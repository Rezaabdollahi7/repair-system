-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_workspace_id_idx" ON "refresh_tokens"("workspace_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- Everything below is hand-written: Prisma has no representation for RLS,
-- so it neither generates these nor notices when they are missing.
-- ─────────────────────────────────────────────────────────────

-- Grants do carry forward on their own — ALTER DEFAULT PRIVILEGES in the
-- 2.3 migration covers tables created later. Stated here anyway so this file
-- reads as the whole story of the table rather than half of it.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE refresh_tokens TO dofixo_app;
GRANT USAGE, SELECT ON SEQUENCE refresh_tokens_id_seq TO dofixo_app;

-- RLS does NOT carry forward. A tenant-scoped table added without this is
-- readable across workspaces, and nothing would say so.
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_isolation ON refresh_tokens
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- ─────────────────────────────────────────────────────────────
-- The third aperture
-- ─────────────────────────────────────────────────────────────

-- /auth/refresh is reached precisely when the access token has expired, so
-- there is no workspace context to look the row up under — the same problem
-- login has, and the same shape of answer.
--
-- Returns the row's own id as well as the user's: the caller has to revoke
-- exactly this token, and finding it again afterwards would mean a second
-- unscoped lookup.
--
-- Expiry and revocation are reported rather than filtered out. A revoked
-- token being presented is not nothing — it means a copy is in circulation,
-- and the caller answers by revoking every session that user has. Returning
-- no row would make a stolen token indistinguishable from a typo.
CREATE OR REPLACE FUNCTION app_refresh_lookup(p_token_hash text)
RETURNS TABLE (
  id           integer,
  user_id      integer,
  workspace_id integer,
  expires_at   timestamp(3),
  revoked_at   timestamp(3)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
-- Pinned so the function can't be redirected at a look-alike table planted
-- in a schema earlier on the caller's search_path.
SET search_path = public
AS $$
  SELECT t.id, t.user_id, t.workspace_id, t.expires_at, t.revoked_at
  FROM refresh_tokens t
  WHERE t.token_hash = p_token_hash;
$$;

COMMENT ON FUNCTION app_refresh_lookup(text) IS
  'Pre-authentication refresh-token lookup. SECURITY DEFINER because the '
  'caller''s access token has expired and carries no workspace. Matches on '
  'a SHA-256 hash of a 32-byte random secret, so it cannot be guessed.';

-- EXECUTE is granted to PUBLIC by default, which for a SECURITY DEFINER
-- function is exactly the wrong default.
REVOKE ALL ON FUNCTION app_refresh_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_refresh_lookup(text) TO dofixo_app;