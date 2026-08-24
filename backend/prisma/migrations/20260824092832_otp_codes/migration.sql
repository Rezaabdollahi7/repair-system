-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('register', 'reset');

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "purpose" "otp_purpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "otp_codes_phone_purpose_created_at_idx" ON "otp_codes"("phone", "purpose", "created_at" DESC);

-- CreateIndex
CREATE INDEX "otp_codes_created_at_idx" ON "otp_codes"("created_at");

-- ─────────────────────────────────────────────────────────────
-- Everything below is hand-written: Prisma has no representation for RLS,
-- so it neither generates these nor notices when they are missing.
-- ─────────────────────────────────────────────────────────────

-- Grants carry forward on their own via ALTER DEFAULT PRIVILEGES (2.3);
-- stated here so this file reads as the whole story of the table.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE otp_codes TO dofixo_app;
GRANT USAGE, SELECT ON SEQUENCE otp_codes_id_seq TO dofixo_app;

-- This is the first and only table in the schema with no workspace_id.
-- A code is sent to a phone number before any workspace exists, so there is
-- nothing to scope it by.
--
-- RLS is enabled anyway, with a policy that permits everything. "No RLS" and
-- "RLS that allows everything" behave identically, but they do not read
-- identically: the first is indistinguishable from a migration that forgot,
-- and this one says in the catalogue that the sharing was chosen. The COMMENT
-- below is where the reason lives.
--
-- The table holds no tenant data — a phone number, a hash, an expiry and two
-- counters. Nothing here belongs to a workshop.
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY shared_no_tenant ON otp_codes
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE otp_codes IS
  'Deliberately not tenant-scoped: a verification code is sent before any '
  'workspace exists, so there is nothing to scope it by. RLS is enabled with '
  'a permissive policy so this reads as intentional rather than forgotten. '
  'No SECURITY DEFINER function is needed here — unlike login and refresh, '
  'an ordinary query can reach this table.';

COMMENT ON COLUMN otp_codes.code_hash IS
  'SHA-256 of a five-digit code. The hash is close to worthless on its own: '
  'a hundred thousand possibilities, unsalted, so a dump yields the codes in '
  'seconds. Safety comes from the three-minute expiry, the three-attempt '
  'ceiling and single use. Do not drop those because this column is hashed.';
