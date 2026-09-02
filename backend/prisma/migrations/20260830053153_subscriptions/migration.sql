-- CreateEnum
CREATE TYPE "subscription_payment_status" AS ENUM ('pending', 'paid', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "subscription_event_type" AS ENUM ('trial', 'payment', 'referral', 'manual');

-- CreateEnum
CREATE TYPE "discount_code_type" AS ENUM ('percent', 'fixed');

-- CreateEnum
CREATE TYPE "subscription_notification_kind" AS ENUM ('before_expiry_7', 'before_expiry_1', 'on_expiry', 'after_expiry_3', 'after_expiry_23');

-- AlterEnum
ALTER TYPE "workspace_status" ADD VALUE 'deleted';

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN     "deleted_at" TIMESTAMP(3),
ADD COLUMN     "never_expires" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "plans" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "price_rials" DECIMAL(18,0) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "order_id" TEXT NOT NULL,
    "track_id" BIGINT,
    "status" "subscription_payment_status" NOT NULL DEFAULT 'pending',
    "base_price_rials" DECIMAL(18,0) NOT NULL,
    "discount_rials" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "amount_rials" DECIMAL(18,0) NOT NULL,
    "plan_duration_days" INTEGER NOT NULL,
    "ref_number" TEXT,
    "card_number" TEXT,
    "paid_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_events" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "type" "subscription_event_type" NOT NULL,
    "days" INTEGER NOT NULL,
    "previous_expires_at" TIMESTAMP(3),
    "new_expires_at" TIMESTAMP(3) NOT NULL,
    "payment_id" INTEGER,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_codes" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "type" "discount_code_type" NOT NULL,
    "value" DECIMAL(18,0) NOT NULL,
    "expires_at" TIMESTAMP(3),
    "max_uses" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discount_code_uses" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "discount_code_id" INTEGER NOT NULL,
    "payment_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discount_code_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_codes" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" SERIAL NOT NULL,
    "referrer_workspace_id" INTEGER NOT NULL,
    "referred_workspace_id" INTEGER NOT NULL,
    "payment_id" INTEGER,
    "rewarded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_notifications" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "kind" "subscription_notification_kind" NOT NULL,
    "expires_at_snapshot" TIMESTAMP(3) NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_code_key" ON "plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_track_id_key" ON "payments"("track_id");

-- CreateIndex
CREATE INDEX "payments_workspace_id_created_at_idx" ON "payments"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_plan_id_idx" ON "payments"("plan_id");

-- CreateIndex
CREATE INDEX "payments_created_by_idx" ON "payments"("created_by");

-- CreateIndex
CREATE INDEX "subscription_events_workspace_id_created_at_idx" ON "subscription_events"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "subscription_events_payment_id_idx" ON "subscription_events"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "discount_codes_code_key" ON "discount_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "discount_code_uses_payment_id_key" ON "discount_code_uses"("payment_id");

-- CreateIndex
CREATE INDEX "discount_code_uses_workspace_id_idx" ON "discount_code_uses"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "discount_code_uses_discount_code_id_workspace_id_key" ON "discount_code_uses"("discount_code_id", "workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_workspace_id_key" ON "referral_codes"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "referral_codes_code_key" ON "referral_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referred_workspace_id_key" ON "referrals"("referred_workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_payment_id_key" ON "referrals"("payment_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_workspace_id_idx" ON "referrals"("referrer_workspace_id");

-- CreateIndex
CREATE INDEX "subscription_notifications_workspace_id_idx" ON "subscription_notifications"("workspace_id");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_notifications_workspace_id_kind_expires_at_sna_key" ON "subscription_notifications"("workspace_id", "kind", "expires_at_snapshot");

-- CreateIndex
CREATE INDEX "workspaces_expires_at_idx" ON "workspaces"("expires_at");

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_events" ADD CONSTRAINT "subscription_events_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_code_uses" ADD CONSTRAINT "discount_code_uses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_code_uses" ADD CONSTRAINT "discount_code_uses_discount_code_id_fkey" FOREIGN KEY ("discount_code_id") REFERENCES "discount_codes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discount_code_uses" ADD CONSTRAINT "discount_code_uses_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_workspace_id_fkey" FOREIGN KEY ("referrer_workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referred_workspace_id_fkey" FOREIGN KEY ("referred_workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_notifications" ADD CONSTRAINT "subscription_notifications_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Roadmap 8.1 — RLS, grants and reference data for subscriptions
--
-- Everything below is hand-written: Prisma emits the tables above but has no
-- representation for policies or grants, so it neither creates them nor
-- notices when they are missing. Grants carry forward through ALTER DEFAULT
-- PRIVILEGES; RLS does not.
-- ─────────────────────────────────────────────────────────────

-- ── Reference data: no RLS, read-only for the app ────────────
--
-- Same treatment as `roles`. These are platform-wide rows created with psql;
-- a workspace reads them and never writes them, so there is no workspace to
-- scope by and no policy to write.
REVOKE INSERT, UPDATE, DELETE ON TABLE plans FROM dofixo_app;
REVOKE INSERT, UPDATE, DELETE ON TABLE discount_codes FROM dofixo_app;

-- ── The ledger ───────────────────────────────────────────────

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON payments
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- A ledger that can be erased is not a ledger. UPDATE stays: a payment moves
-- from pending to paid to verified, and the verify response fills in the
-- reference number.
REVOKE DELETE ON TABLE payments FROM dofixo_app;

ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON subscription_events
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- Stricter than payments: an event records something that already happened,
-- so nothing about it can legitimately change afterwards.
REVOKE UPDATE, DELETE ON TABLE subscription_events FROM dofixo_app;

-- ── Discount usage ───────────────────────────────────────────

ALTER TABLE discount_code_uses ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON discount_code_uses
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- The row IS the "once per workspace" rule. Being able to delete it would be
-- being able to spend the code again.
REVOKE UPDATE, DELETE ON TABLE discount_code_uses FROM dofixo_app;

-- ── Referral codes: read open, write scoped ──────────────────
--
-- Sign-up must resolve a code belonging to a workspace the caller has no
-- relationship with, and at that moment the transaction's context is already
-- set to the NEW workspace — so this is not the OtpCode situation (no context
-- at all), it is a policy question, and it is answered with a policy rather
-- than by exempting the table from the client extension's guard.
--
-- UNSCOPED_MODELS therefore still has exactly one member.
--
-- Split into two policies because the two commands want different rules:
-- anyone may read a code, only its owner may create one.
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY referral_code_read ON referral_codes
  FOR SELECT
  USING (true);

CREATE POLICY referral_code_write ON referral_codes
  FOR INSERT
  WITH CHECK (workspace_id = app_current_workspace_id());

-- A code that changes is a link that stops working, and a code that can be
-- deleted is a referral relationship that can be orphaned.
REVOKE UPDATE, DELETE ON TABLE referral_codes FROM dofixo_app;

-- ── Referrals: the only two-sided policy in the schema ───────
--
-- The row belongs to both parties: the referrer needs it for their invite
-- page, the referred workspace for the discount at checkout. USING admits
-- either side.
--
-- WITH CHECK names only the referred side, which covers both writes that
-- happen: the INSERT at sign-up (running in the new workspace's context) and
-- the UPDATE that stamps rewardedAt after that workspace's payment verifies.
-- The referrer never writes this row — their reward is written to their own
-- workspace, through runWithWorkspace(), in 8.6.
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY referral_either_side ON referrals
  USING (
    referrer_workspace_id = app_current_workspace_id()
    OR referred_workspace_id = app_current_workspace_id()
  )
  WITH CHECK (referred_workspace_id = app_current_workspace_id());

REVOKE DELETE ON TABLE referrals FROM dofixo_app;

-- ── Notification log ─────────────────────────────────────────

ALTER TABLE subscription_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON subscription_notifications
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- UPDATE revoked, DELETE left in place: old rows are housekeeping the cron
-- may want to prune, but rewriting what was sent would defeat the whole
-- point of the table.
REVOKE UPDATE ON TABLE subscription_notifications FROM dofixo_app;

-- ─────────────────────────────────────────────────────────────
-- Reference data
-- ─────────────────────────────────────────────────────────────
--
-- Prices in rials. The annual plan is 425 days, not 365: it is sold as
-- twelve months plus two, and the extra time is part of the product rather
-- than a promotion, so it lives in the plan's duration.
--
-- updated_at is written explicitly: Prisma's @updatedAt is applied by the
-- client, so the column has NOT NULL and no database default.
INSERT INTO plans (code, name, duration_days, price_rials, sort_order, updated_at)
VALUES
  ('quarterly', 'اشتراک ۳ ماهه',              90,  19900000, 1, now()),
  ('biannual',  'اشتراک ۶ ماهه',             180,  39900000, 2, now()),
  ('annual',    'اشتراک ۱۲ ماهه + ۲ ماه هدیه', 425,  79900000, 3, now())
ON CONFLICT (code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Backfill
-- ─────────────────────────────────────────────────────────────

-- Every workspace that exists at the moment this runs is ours: production
-- has one, development has whatever seed.ts made. None of them should ever
-- go read-only, and none of them should be deleted by the nightly job.
--
-- ⚠️ This is a one-time statement about today, not a rule. Workspaces
-- created after this migration get a 30-day trial from populateWorkspace
-- (8.2) and this flag stays false for them.
UPDATE workspaces SET never_expires = TRUE WHERE deleted_at IS NULL;

-- Existing workspaces need an invite code too — populateWorkspace only
-- covers the ones created from here on.
--
-- The alphabet omits I, O, 0 and 1: this code is read aloud over the phone,
-- and those four are the pairs people mishear.
DO $$
DECLARE
  alphabet  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  w         record;
  candidate text;
  i         int;
BEGIN
  FOR w IN SELECT id FROM workspaces LOOP
    LOOP
      candidate := '';
      FOR i IN 1..6 LOOP
        candidate := candidate ||
          substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      END LOOP;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = candidate);
    END LOOP;

    INSERT INTO referral_codes (workspace_id, code)
    VALUES (w.id, candidate)
    ON CONFLICT (workspace_id) DO NOTHING;
  END LOOP;
END
$$;