-- Roadmap 2.4 — the one deliberate aperture in the RLS wall.
--
-- Login has to find a user by username before anyone knows which workspace
-- that user belongs to, so it is the single query that cannot run under a
-- workspace policy. SECURITY DEFINER makes it execute as the function's
-- owner, who bypasses RLS.
--
-- Kept as narrow as it can be: four columns, an exact-match lookup on a
-- unique column, no way to enumerate. Everything login needs beyond this —
-- the full user record and its role — is read afterwards through the normal
-- client, once the workspace is known and the policies apply again.

CREATE OR REPLACE FUNCTION app_login_lookup(p_username text)
RETURNS TABLE (
  id           integer,
  workspace_id integer,
  password     text,
  is_active    boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned so the function can't be redirected at a look-alike table planted
-- in a schema earlier on the caller's search_path.
SET search_path = public
AS $$
  SELECT u.id, u.workspace_id, u.password, u.is_active
  FROM users u
  WHERE u.username = p_username;
$$;

COMMENT ON FUNCTION app_login_lookup(text) IS
  'Pre-authentication user lookup. SECURITY DEFINER because the caller has '
  'no workspace context yet. Returns only what password verification needs.';

-- EXECUTE is granted to PUBLIC by default, which for a SECURITY DEFINER
-- function is exactly the wrong default.
REVOKE ALL ON FUNCTION app_login_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_login_lookup(text) TO dofixo_app;