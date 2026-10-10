-- ─────────────────────────────────────────────────────────────
-- Roadmap 14.16 — stock transfers (TRF)
--
-- New tables only; nothing existing is read or changed, so this migration
-- touches no production row. The numbering counter (transfer_seq) has been
-- on workspaces since 14.1.
-- ─────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "stock_transfers" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "from_warehouse_id" INTEGER NOT NULL,
    "to_warehouse_id" INTEGER NOT NULL,
    "transferred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_transfer_lines" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "transfer_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_transfer_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_transfers_workspace_id_transferred_at_idx" ON "stock_transfers"("workspace_id", "transferred_at" DESC);

-- CreateIndex
CREATE INDEX "stock_transfers_from_warehouse_id_idx" ON "stock_transfers"("from_warehouse_id");

-- CreateIndex
CREATE INDEX "stock_transfers_to_warehouse_id_idx" ON "stock_transfers"("to_warehouse_id");

-- CreateIndex
CREATE INDEX "stock_transfers_created_by_idx" ON "stock_transfers"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "stock_transfers_workspace_id_number_key" ON "stock_transfers"("workspace_id", "number");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_workspace_id_idx" ON "stock_transfer_lines"("workspace_id");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_transfer_id_idx" ON "stock_transfer_lines"("transfer_id");

-- CreateIndex
CREATE INDEX "stock_transfer_lines_item_id_idx" ON "stock_transfer_lines"("item_id");

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_warehouse_id_fkey" FOREIGN KEY ("from_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_warehouse_id_fkey" FOREIGN KEY ("to_warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "stock_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Constraints Prisma cannot express
-- ─────────────────────────────────────────────────────────────

-- A warehouse to itself would write a transfer_out and a transfer_in that
-- cancel out: two ledger rows that say nothing happened.
ALTER TABLE "stock_transfers"
  ADD CONSTRAINT "stock_transfers_distinct_warehouses"
  CHECK ("from_warehouse_id" <> "to_warehouse_id");

-- The direction is the header's; a line only says how much.
ALTER TABLE "stock_transfer_lines"
  ADD CONSTRAINT "stock_transfer_lines_quantity_positive" CHECK ("quantity" > 0);

-- ─────────────────────────────────────────────────────────────
-- RLS — hand-written, as in every migration since 2.3. Grants carry forward
-- through ALTER DEFAULT PRIVILEGES; RLS does not.
--
-- UPDATE and DELETE stay granted for workspace deletion (8.7), as on the
-- adjustment tables; the API offers neither.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "stock_transfers" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "stock_transfers"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE "stock_transfer_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "stock_transfer_lines"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
