-- CreateIndex
CREATE UNIQUE INDEX "sms_wallet_transactions_topup_id_type_key" ON "sms_wallet_transactions"("topup_id", "type");

-- ─────────────────────────────────────────────────────────────
-- Roadmap 12.4 — one credit per top-up, in the database
--
-- settleTopup gates on the status transition: whoever moves the row from
-- pending to verified is the one that credits, so two callbacks arriving
-- together credit once. That works, and it is application logic — a second
-- settle path written later (an operator script, a different job) would not
-- inherit it.
--
-- Same shape as the refund rule on (sms_message_id, type) and for the same
-- reason: a financial guarantee held in a controller is a guarantee until
-- somebody writes a second controller.
--
-- NULLs are distinct in a Postgres unique index, so the send and refund rows
-- — which carry no topup_id — are unaffected however many there are.
-- ─────────────────────────────────────────────────────────────
