-- ─────────────────────────────────────────────────────────────
-- Roadmap 14.14 — stock adjustments (ADJ)
--
-- New tables only; nothing existing is read or changed, so this migration
-- touches no production row. The numbering counter (adjustment_seq) has
-- been on workspaces since 14.1.
-- ─────────────────────────────────────────────────────────────

-- CreateTable
CREATE TABLE "stock_adjustments" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "adjusted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_adjustment_lines" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "adjustment_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "reason" "stock_movement_reason" NOT NULL,
    "note" TEXT,
    "unit_cost" DECIMAL(18,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_adjustment_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_adjustments_workspace_id_adjusted_at_idx" ON "stock_adjustments"("workspace_id", "adjusted_at" DESC);

-- CreateIndex
CREATE INDEX "stock_adjustments_warehouse_id_idx" ON "stock_adjustments"("warehouse_id");

-- CreateIndex
CREATE INDEX "stock_adjustments_created_by_idx" ON "stock_adjustments"("created_by");

-- CreateIndex
CREATE UNIQUE INDEX "stock_adjustments_workspace_id_number_key" ON "stock_adjustments"("workspace_id", "number");

-- CreateIndex
CREATE INDEX "stock_adjustment_lines_workspace_id_idx" ON "stock_adjustment_lines"("workspace_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_lines_adjustment_id_idx" ON "stock_adjustment_lines"("adjustment_id");

-- CreateIndex
CREATE INDEX "stock_adjustment_lines_item_id_idx" ON "stock_adjustment_lines"("item_id");

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustments" ADD CONSTRAINT "stock_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_adjustment_id_fkey" FOREIGN KEY ("adjustment_id") REFERENCES "stock_adjustments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_adjustment_lines" ADD CONSTRAINT "stock_adjustment_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Constraints Prisma cannot express
-- ─────────────────────────────────────────────────────────────

-- A line moves something: a zero would write a ledger row that says nothing.
ALTER TABLE "stock_adjustment_lines"
  ADD CONSTRAINT "stock_adjustment_lines_quantity_not_zero" CHECK ("quantity" <> 0);

-- `count` is the stock-count document's reason (14.15), posted when a count
-- is applied. An adjustment that claimed it would read in the kardex as a
-- count that has no count behind it.
ALTER TABLE "stock_adjustment_lines"
  ADD CONSTRAINT "stock_adjustment_lines_reason_not_count" CHECK ("reason" <> 'count');

-- ─────────────────────────────────────────────────────────────
-- RLS — hand-written, as in every migration since 2.3. Grants carry forward
-- through ALTER DEFAULT PRIVILEGES; RLS does not.
--
-- Unlike the ledger, these keep their UPDATE and DELETE grants: workspace
-- deletion (8.7) removes them as the application role, table by table. The
-- API offers neither — an adjustment is never edited — and the ledger rows
-- it wrote are append-only regardless.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "stock_adjustments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "stock_adjustments"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE "stock_adjustment_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "stock_adjustment_lines"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
