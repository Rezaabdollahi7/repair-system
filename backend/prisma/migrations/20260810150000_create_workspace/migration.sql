-- Roadmap 3.1 — the second and last aperture in the RLS wall.
--
-- Sign-up creates a workspace before any workspace context can exist, and
-- the application role deliberately has no INSERT on workspaces (task 2.3):
-- creating a tenant is not an ordinary request.
--
-- Kept to exactly that one gap. The user, settings and default services that
-- follow are ordinary tenant rows, so they are written through the normal
-- client once this function has returned an id and the caller has set the
-- context to it. Widening this function to create them too would put four
-- inserts outside the policies to save nothing.

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

  -- One month, no feature restrictions (CLAUDE.md). Enforcing the expiry —
  -- locking the workspace to read-only — is task 8.3; this only records when
  -- it falls due, so no row is ever left without an answer to "until when".
  --
  -- updated_at is set explicitly: Prisma manages @updatedAt in the client,
  -- so the column has no database default and a raw insert must supply it.
  INSERT INTO workspaces (name, status, expires_at, updated_at)
  VALUES (btrim(p_name), 'trial', now() + interval '1 month', now())
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$;

COMMENT ON FUNCTION app_create_workspace(text) IS
  'Creates a tenant and returns its id. SECURITY DEFINER because the caller '
  'has no workspace context yet and the application role cannot insert here. '
  'Sign-up is rate limited — this function is the only thing standing between '
  'an open endpoint and unlimited tenant creation until SMS OTP (task 8.6).';

-- EXECUTE is granted to PUBLIC by default, which for a SECURITY DEFINER
-- function is exactly the wrong default.
REVOKE ALL ON FUNCTION app_create_workspace(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_create_workspace(text) TO dofixo_app;