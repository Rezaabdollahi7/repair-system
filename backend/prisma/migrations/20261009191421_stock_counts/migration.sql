-- ─────────────────────────────────────────────────────────────
-- Roadmap 14.15 — stock counts (CNT)
--
-- New tables and a new enum only; nothing existing is read or changed, so
-- this migration touches no production row. The numbering counter
-- (count_seq) has been on workspaces since 14.1.
-- ─────────────────────────────────────────────────────────────

-- CreateEnum
CREATE TYPE "stock_count_status" AS ENUM ('draft', 'applied', 'cancelled');

-- CreateTable
CREATE TABLE "stock_counts" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "category_id" INTEGER,
    "blind" BOOLEAN NOT NULL DEFAULT false,
    "status" "stock_count_status" NOT NULL DEFAULT 'draft',
    "description" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "applied_at" TIMESTAMP(3),
    "applied_by" INTEGER,
    "cancelled_at" TIMESTAMP(3),

    CONSTRAINT "stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_count_lines" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "count_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "counted_quantity" DECIMAL(14,3),
    "system_quantity" DECIMAL(14,3),
    "counted_at" TIMESTAMP(3),
    "counted_by" INTEGER,
    "note" TEXT,
    "applied_quantity" DECIMAL(14,3),
    "unit_cost" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_counts_workspace_id_created_at_idx" ON "stock_counts"("workspace_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "stock_counts_warehouse_id_idx" ON "stock_counts"("warehouse_id");

-- CreateIndex
CREATE INDEX "stock_counts_category_id_idx" ON "stock_counts"("category_id");

-- CreateIndex
CREATE INDEX "stock_counts_created_by_idx" ON "stock_counts"("created_by");

-- CreateIndex
CREATE INDEX "stock_counts_applied_by_idx" ON "stock_counts"("applied_by");

-- CreateIndex
CREATE UNIQUE INDEX "stock_counts_workspace_id_number_key" ON "stock_counts"("workspace_id", "number");

-- CreateIndex
CREATE INDEX "stock_count_lines_workspace_id_idx" ON "stock_count_lines"("workspace_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_item_id_idx" ON "stock_count_lines"("item_id");

-- CreateIndex
CREATE INDEX "stock_count_lines_counted_by_idx" ON "stock_count_lines"("counted_by");

-- CreateIndex
CREATE UNIQUE INDEX "stock_count_lines_count_id_item_id_key" ON "stock_count_lines"("count_id", "item_id");

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_applied_by_fkey" FOREIGN KEY ("applied_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "stock_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_counted_by_fkey" FOREIGN KEY ("counted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ─────────────────────────────────────────────────────────────
-- Constraints Prisma cannot express
-- ─────────────────────────────────────────────────────────────

-- A shelf holds nothing or something, never less.
ALTER TABLE "stock_count_lines"
  ADD CONSTRAINT "stock_count_lines_counted_not_negative"
  CHECK ("counted_quantity" IS NULL OR "counted_quantity" >= 0);

-- A count and the snapshot it is measured against are written together, or
-- the difference applied later would be measured against nothing.
ALTER TABLE "stock_count_lines"
  ADD CONSTRAINT "stock_count_lines_counted_with_snapshot"
  CHECK (("counted_quantity" IS NULL) = ("system_quantity" IS NULL)
     AND ("counted_quantity" IS NULL) = ("counted_at" IS NULL));

-- ─────────────────────────────────────────────────────────────
-- RLS — hand-written, as in every migration since 2.3. Grants carry forward
-- through ALTER DEFAULT PRIVILEGES; RLS does not. UPDATE and DELETE stay
-- granted: lines are filled in one by one while the count is a draft, and
-- workspace deletion (8.7) removes both tables as the application role. The
-- API offers no delete; a count is cancelled instead.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "stock_counts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "stock_counts"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE "stock_count_lines" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "stock_count_lines"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());
