-- CreateEnum
CREATE TYPE "sms_topup_status" AS ENUM ('pending', 'paid', 'verified', 'failed');

-- CreateEnum
CREATE TYPE "sms_wallet_transaction_type" AS ENUM ('topup', 'send', 'refund', 'adjustment');

-- CreateEnum
CREATE TYPE "sms_message_kind" AS ENUM ('device_accepted', 'device_ready', 'device_delivered');

-- CreateEnum
CREATE TYPE "sms_message_status" AS ENUM ('pending', 'sent', 'failed', 'insufficient_balance', 'invalid_phone', 'disabled', 'refunded');

-- AlterTable
ALTER TABLE "settings" ADD COLUMN     "sms_customer_notifications_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "sms_wallets" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "balance_rials" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_wallet_transactions" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "type" "sms_wallet_transaction_type" NOT NULL,
    "amount_rials" DECIMAL(18,0) NOT NULL,
    "balance_before_rials" DECIMAL(18,0) NOT NULL,
    "balance_after_rials" DECIMAL(18,0) NOT NULL,
    "sms_message_id" INTEGER,
    "topup_id" INTEGER,
    "description" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_messages" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "customer_id" INTEGER,
    "device_id" INTEGER,
    "phone" TEXT NOT NULL,
    "kind" "sms_message_kind" NOT NULL,
    "segments" INTEGER NOT NULL DEFAULT 1,
    "unit_price_rials" DECIMAL(18,0) NOT NULL,
    "cost_rials" DECIMAL(18,0) NOT NULL DEFAULT 0,
    "status" "sms_message_status" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL DEFAULT 'smsir',
    "provider_message_id" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "sms_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_topups" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "order_id" TEXT NOT NULL,
    "track_id" BIGINT,
    "status" "sms_topup_status" NOT NULL DEFAULT 'pending',
    "amount_rials" DECIMAL(18,0) NOT NULL,
    "ref_number" TEXT,
    "card_number" TEXT,
    "paid_at" TIMESTAMP(3),
    "verified_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sms_topups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_prices" (
    "id" SERIAL NOT NULL,
    "unit_price_rials" DECIMAL(18,0) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sms_prices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_wallets_workspace_id_key" ON "sms_wallets"("workspace_id");

-- CreateIndex
CREATE INDEX "sms_wallet_transactions_workspace_id_created_at_idx" ON "sms_wallet_transactions"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sms_wallet_transactions_topup_id_idx" ON "sms_wallet_transactions"("topup_id");

-- CreateIndex
CREATE INDEX "sms_wallet_transactions_created_by_idx" ON "sms_wallet_transactions"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "sms_wallet_transactions_sms_message_id_type_key" ON "sms_wallet_transactions"("sms_message_id", "type");

-- CreateIndex
CREATE INDEX "sms_messages_workspace_id_created_at_idx" ON "sms_messages"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sms_messages_workspace_id_status_idx" ON "sms_messages"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "sms_messages_customer_id_idx" ON "sms_messages"("customer_id");

-- CreateIndex
CREATE INDEX "sms_messages_device_id_idx" ON "sms_messages"("device_id");

-- CreateIndex
CREATE INDEX "sms_messages_created_by_idx" ON "sms_messages"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "sms_topups_order_id_key" ON "sms_topups"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "sms_topups_track_id_key" ON "sms_topups"("track_id");

-- CreateIndex
CREATE INDEX "sms_topups_workspace_id_created_at_idx" ON "sms_topups"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sms_topups_status_idx" ON "sms_topups"("status");

-- CreateIndex
CREATE INDEX "sms_topups_created_by_idx" ON "sms_topups"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "sms_prices_effective_from_key" ON "sms_prices"("effective_from");

-- AddForeignKey
ALTER TABLE "sms_wallets" ADD CONSTRAINT "sms_wallets_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_wallet_transactions" ADD CONSTRAINT "sms_wallet_transactions_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_wallet_transactions" ADD CONSTRAINT "sms_wallet_transactions_sms_message_id_fkey" FOREIGN KEY ("sms_message_id") REFERENCES "sms_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_wallet_transactions" ADD CONSTRAINT "sms_wallet_transactions_topup_id_fkey" FOREIGN KEY ("topup_id") REFERENCES "sms_topups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_wallet_transactions" ADD CONSTRAINT "sms_wallet_transactions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_messages" ADD CONSTRAINT "sms_messages_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_topups" ADD CONSTRAINT "sms_topups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sms_topups" ADD CONSTRAINT "sms_topups_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Roadmap 12.1 — RLS, grants and the opening price for the SMS wallet
--
-- Hand-written, like the block in 20260830053153_subscriptions: Prisma emits
-- the tables above but has no representation for policies or grants, so it
-- neither creates them nor notices when they are missing. Grants carry
-- forward through ALTER DEFAULT PRIVILEGES; RLS does not.
-- ─────────────────────────────────────────────────────────────

-- ── The wallet ───────────────────────────────────────────────
--
-- UPDATE stays, and it is the only table here where that is true: the
-- balance is a running figure, and 12.3's conditional UPDATE is how it
-- moves. DELETE goes — a wallet that can be dropped and recreated is a
-- balance that can be reset, and the transaction rows would then describe a
-- history the column no longer agrees with.
--
-- INSERT stays because populateWorkspace creates the row under the new
-- workspace's own context at sign-up.
ALTER TABLE sms_wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON sms_wallets
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

REVOKE DELETE ON TABLE sms_wallets FROM dofixo_app;

-- ── The wallet ledger ────────────────────────────────────────
--
-- Append-only, stricter than payments and for the same reason
-- subscription_events is: a movement records something that already
-- happened. It is also what makes the balance column above trustworthy —
-- two answers to "how much credit is there" are only safe while the rows
-- cannot be rewritten.
ALTER TABLE sms_wallet_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON sms_wallet_transactions
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

REVOKE UPDATE, DELETE ON TABLE sms_wallet_transactions FROM dofixo_app;

-- ── The send log ─────────────────────────────────────────────
--
-- The one table here that is tenant data rather than ledger, because of one
-- column: `phone` belongs to the workshop's customer. So it keeps DELETE and
-- goes on DELETION_ORDER, while the three money tables do neither.
--
-- UPDATE stays: a row is written as `pending` before the provider is called
-- and stamped with the outcome afterwards.
ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON sms_messages
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- ── Top-ups ──────────────────────────────────────────────────
--
-- The same treatment as payments: a ledger that can be erased is not a
-- ledger. UPDATE stays, because a top-up moves pending → paid → verified and
-- the verify response fills in the reference number.
ALTER TABLE sms_topups ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON sms_topups
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

REVOKE DELETE ON TABLE sms_topups FROM dofixo_app;

-- ── Reference data: no RLS, read-only for the app ────────────
--
-- Same treatment as plans, discount_codes and roles. A price is a
-- platform-wide row set with psql; there is no workspace to scope it by and
-- therefore no policy to write.
REVOKE INSERT, UPDATE, DELETE ON TABLE sms_prices FROM dofixo_app;

-- ─────────────────────────────────────────────────────────────
-- The opening price
-- ─────────────────────────────────────────────────────────────
--
-- Per SMS part, in rials. 1,750 rials is 175 toman a part, which is 350
-- toman for the two-part message every one of these templates comes to —
-- the figure in the original brief.
--
-- ⚠️ Provisional. sms.ir quotes 130–250 toman per پیامک depending on top-up
-- size, and has not yet confirmed whether that is billed per part or per
-- message. At two parts and the worst tier this price sells at a loss.
-- Changing it is one INSERT — that is the whole reason this is a table:
--
--   INSERT INTO sms_prices (unit_price_rials, effective_from, note)
--   VALUES (2500, now(), 'sms.ir confirmed per-part billing');
--
-- Rows are never updated in place. The current price is the greatest
-- effective_from not in the future, so a correction is a new row and the old
-- one stays as the record of what last month cost.
INSERT INTO sms_prices (unit_price_rials, effective_from, note)
VALUES (1750, '2026-01-01 00:00:00', 'Opening price: 350 toman per two-part message')
ON CONFLICT (effective_from) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- Backfill
-- ─────────────────────────────────────────────────────────────
--
-- Every workspace that already exists needs a wallet row, because
-- populateWorkspace only covers the ones created from here on. Balance zero:
-- nobody has bought credit yet, and a free opening balance would be a
-- decision this migration has no business making.
INSERT INTO sms_wallets (workspace_id, updated_at)
SELECT id, now() FROM workspaces
ON CONFLICT (workspace_id) DO NOTHING;
