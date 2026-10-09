-- ─────────────────────────────────────────────────────────────
-- Roadmap 14.1 — the movement types and reasons, on their own
--
-- A migration of its own because Prisma runs each migration in one
-- transaction, and Postgres will not let a transaction use an enum value it
-- added itself. The next migration relabels the ledger's old rows to
-- `repair_use` and `reversal`; it can only do that once these values are
-- committed.
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "stock_movement_reason" AS ENUM ('count', 'damage', 'loss', 'found', 'entry_error', 'internal_use', 'return_from_use', 'other');

-- AlterEnum
ALTER TYPE "inventory_transaction_type" ADD VALUE 'opening';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'repair_use';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'count';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'transfer_out';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'transfer_in';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'purchase_return';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'sale_return';
ALTER TYPE "inventory_transaction_type" ADD VALUE 'reversal';
