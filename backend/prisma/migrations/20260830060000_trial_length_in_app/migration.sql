-- Roadmap 8.2 — the trial's length moves out of SQL and into the engine.
--
-- app_create_workspace has set expires_at to now() + interval '1 month'
-- since 3.1, which was right while nothing else touched the column. From 8.2
-- it is not: populateWorkspace calls startTrial, and a workspace registered
-- today would get 31 days here plus 30 there — 61 in total, which the
-- integration suite caught.
--
-- Removing it from here rather than removing startTrial keeps two properties
-- worth more than the interval:
--
--   * extendSubscription stays the only place expires_at ever changes, so
--     every move it makes leaves a SubscriptionEvent behind. A trial granted
--     in SQL is the one change with no record, and "why does my subscription
--     end then" would have a hole in it from the very first day.
--
--   * The trial is a fixed number of days rather than a calendar month.
--     `interval '1 month'` gives 31 days from 30 August and 28 from 1
--     February; TRIAL_DAYS gives thirty to everyone, and is a number a test
--     can read.
--
-- Everything else about this function is unchanged and deliberately so:
-- SECURITY DEFINER, the pinned search_path, the name check and the grant to
-- dofixo_app alone. It is one of three apertures in the RLS wall (RULES.md
-- §7) and this migration narrows what it writes rather than what it is.

CREATE OR REPLACE FUNCTION app_create_workspace(p_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
-- Pinned so the function can't be redirected at a look-alike table planted
-- in a schema earlier on the caller's search_path.
SET search_path = public
AS $$
DECLARE
  new_id integer;
BEGIN
  -- Zod validates this before the call; repeated here because a SECURITY
  -- DEFINER function runs with elevated rights and shouldn't trust that it
  -- was reached the way its author expected.
  IF p_name IS NULL OR btrim(p_name) = '' THEN
    RAISE EXCEPTION 'workspace name must not be empty';
  END IF;

  -- expires_at is left NULL: startTrial fills it in, inside this same
  -- transaction, a few statements later.
  --
  -- ⚠️ A workspace that reaches the outside world with a NULL expiry is
  -- expired as far as the 8.3 guard is concerned — it treats "no answer to
  -- until when" as no, rather than as forever. That is the safe direction
  -- and it costs nothing here, because populateWorkspace runs in the same
  -- transaction: either both land or neither does.
  --
  -- updated_at is set explicitly: Prisma manages @updatedAt in the client,
  -- so the column has no database default and a raw insert must supply it.
  INSERT INTO workspaces (name, status, updated_at)
  VALUES (btrim(p_name), 'trial', now())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION app_create_workspace(text) IS
  'Creates a tenant and returns its id, with no expiry — utils/subscription '
  'grants the trial. SECURITY DEFINER because the caller has no workspace '
  'context yet and the application role cannot insert here.';

-- Re-granted rather than assumed: CREATE OR REPLACE keeps the existing
-- privileges, but stating them means a future replacement that drops these
-- two lines fails visibly instead of quietly handing EXECUTE back to PUBLIC.
REVOKE ALL ON FUNCTION app_create_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_create_workspace(text) TO dofixo_app;
