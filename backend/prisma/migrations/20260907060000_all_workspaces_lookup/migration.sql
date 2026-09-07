-- Roadmap 8.11 — the fourth aperture, and the first that is not about
-- authentication.
--
-- The nightly subscription job has to walk every workspace: that is its
-- entire purpose. It has no workspace context because there is no single
-- workspace it belongs to, so the policy on `workspaces` answers its query
-- with zero rows — silently, because an empty result is indistinguishable
-- from a night with nothing to do. It had done exactly that since 8.7.
--
-- No ordinary query can do this job. The three existing apertures exist
-- because the caller does not KNOW its workspace yet; this one exists
-- because the caller legitimately has none. Different reason, same
-- impossibility.
--
-- Narrow in the way that matters: four columns, none of them tenant data.
-- An id, two flags and a date. Everything the job does afterwards — reading
-- the owner's phone, writing a notification row, settling a payment — opens
-- that workspace's own context and runs under the policies like any request.

CREATE OR REPLACE FUNCTION app_all_workspaces()
RETURNS TABLE (
  id            integer,
  never_expires boolean,
  expires_at    timestamp(3) without time zone,
  status        text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned so the function can't be redirected at a look-alike table planted
-- in a schema earlier on the caller's search_path.
SET search_path = public
AS $$
  SELECT w.id, w.never_expires, w.expires_at, w.status::text
  FROM workspaces w
  WHERE w.deleted_at IS NULL
  ORDER BY w.id;
$$;

COMMENT ON FUNCTION app_all_workspaces() IS
  'Every live workspace, for the nightly subscription job. SECURITY DEFINER '
  'because the job legitimately belongs to no workspace — walking all of '
  'them is what it is for — and a raw query returns zero rows without '
  'error. Returns no tenant data: an id, two flags and a date. Tombstoned '
  'workspaces are excluded; their rows are kept for the payment ledger, not '
  'for the job to act on.';

-- EXECUTE is granted to PUBLIC by default, which for a SECURITY DEFINER
-- function is exactly the wrong default.
REVOKE ALL ON FUNCTION app_all_workspaces() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_all_workspaces() TO dofixo_app;
