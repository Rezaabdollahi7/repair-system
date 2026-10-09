-- ─────────────────────────────────────────────────────────────
-- Roadmap 14.1 / 14.2 — warehouses, decimal quantities, the ledger
--
-- Hand-ordered rather than left as Prisma emitted it. Prisma adds the new
-- NOT NULL warehouse_id columns in one statement, which fails on any table
-- that already has rows — and production has items, and may have invoices.
-- So: create the warehouses, give every workspace its default, add the
-- columns nullable, fill them, and only then make them NOT NULL.
--
-- What this migration preserves, row for row: every item, its stock and
-- average cost; every invoice; every ledger row. Nothing is deleted. The
-- only rows it adds are one warehouse per workspace, one item_stocks row per
-- item, and — only where the ledger and the stock column already disagree —
-- one reconciling movement per item (step 7).
-- ─────────────────────────────────────────────────────────────

-- ── 1. Document counters ─────────────────────────────────────
ALTER TABLE "workspaces" ADD COLUMN     "adjustment_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "count_seq" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "transfer_seq" INTEGER NOT NULL DEFAULT 0;

-- ── 2. Warehouses and per-warehouse stock ────────────────────
CREATE TABLE "warehouses" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "is_default" BOOLEAN,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id"),
    -- TRUE or NULL, never FALSE: the unique index on (workspace_id,
    -- is_default) allows one TRUE per workspace only because every other row
    -- is NULL. A FALSE would be a second non-NULL value and collide with the
    -- next FALSE. Prisma neither creates nor drops CHECK constraints.
    CONSTRAINT "warehouses_is_default_true_or_null" CHECK ("is_default")
);

CREATE TABLE "item_stocks" (
    "id" SERIAL NOT NULL,
    "workspace_id" INTEGER NOT NULL,
    "item_id" INTEGER NOT NULL,
    "warehouse_id" INTEGER NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "location" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_stocks_pkey" PRIMARY KEY ("id"),
    -- Stock never goes below zero (agreed 9 October). The stock service
    -- refuses first and says why; this is the floor under it.
    CONSTRAINT "item_stocks_quantity_not_negative" CHECK ("quantity" >= 0)
);

CREATE UNIQUE INDEX "warehouses_workspace_id_name_key" ON "warehouses"("workspace_id", "name");
CREATE UNIQUE INDEX "warehouses_workspace_id_is_default_key" ON "warehouses"("workspace_id", "is_default");
CREATE INDEX "item_stocks_workspace_id_warehouse_id_idx" ON "item_stocks"("workspace_id", "warehouse_id");
CREATE INDEX "item_stocks_warehouse_id_idx" ON "item_stocks"("warehouse_id");
CREATE UNIQUE INDEX "item_stocks_item_id_warehouse_id_key" ON "item_stocks"("item_id", "warehouse_id");

ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_stocks" ADD CONSTRAINT "item_stocks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_stocks" ADD CONSTRAINT "item_stocks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "item_stocks" ADD CONSTRAINT "item_stocks_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Every workspace, the tombstoned ones included: "every workspace has a
-- default warehouse" is a simpler rule to rely on than "every live one".
INSERT INTO "warehouses" ("workspace_id", "name", "is_default", "is_active", "created_at", "updated_at")
SELECT "id", 'انبار اصلی', TRUE, TRUE, now(), now()
FROM "workspaces"
ON CONFLICT DO NOTHING;

-- ── 3. Items: decimal stock, the fractional flag ─────────────
ALTER TABLE "items" ADD COLUMN     "is_fractional" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "min_stock" SET DEFAULT 0,
ALTER COLUMN "min_stock" SET DATA TYPE DECIMAL(14,3),
ALTER COLUMN "current_stock" SET DEFAULT 0,
ALTER COLUMN "current_stock" SET DATA TYPE DECIMAL(14,3);

-- The same default the item form will apply from now on: the three units a
-- shop measures rather than counts.
UPDATE "items" SET "is_fractional" = TRUE WHERE "unit" IN ('متر', 'کیلوگرم', 'لیتر');

-- Every write path clamped at zero until now, so no row is below it; if one
-- somehow is, this fails the migration loudly rather than carrying it in.
ALTER TABLE "items" ADD CONSTRAINT "items_current_stock_not_negative" CHECK ("current_stock" >= 0);

-- ── 4. Invoice lines: decimal quantity, cost at the time ─────
ALTER TABLE "purchase_invoice_items" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

ALTER TABLE "sale_invoice_items" ADD COLUMN     "unit_cost" DECIMAL(18,2),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

ALTER TABLE "repair_invoice_items" ADD COLUMN     "unit_cost" DECIMAL(18,2),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

-- ── 5. Invoice headers: the warehouse ────────────────────────
ALTER TABLE "purchase_invoices" ADD COLUMN "warehouse_id" INTEGER;
ALTER TABLE "sale_invoices" ADD COLUMN "warehouse_id" INTEGER;
ALTER TABLE "repair_invoices" ADD COLUMN "warehouse_id" INTEGER;

UPDATE "purchase_invoices" i SET "warehouse_id" = w."id"
FROM "warehouses" w WHERE w."workspace_id" = i."workspace_id" AND w."is_default";
UPDATE "sale_invoices" i SET "warehouse_id" = w."id"
FROM "warehouses" w WHERE w."workspace_id" = i."workspace_id" AND w."is_default";
UPDATE "repair_invoices" i SET "warehouse_id" = w."id"
FROM "warehouses" w WHERE w."workspace_id" = i."workspace_id" AND w."is_default";

ALTER TABLE "purchase_invoices" ALTER COLUMN "warehouse_id" SET NOT NULL;
ALTER TABLE "sale_invoices" ALTER COLUMN "warehouse_id" SET NOT NULL;
ALTER TABLE "repair_invoices" ALTER COLUMN "warehouse_id" SET NOT NULL;

CREATE INDEX "purchase_invoices_warehouse_id_idx" ON "purchase_invoices"("warehouse_id");
CREATE INDEX "sale_invoices_warehouse_id_idx" ON "sale_invoices"("warehouse_id");
CREATE INDEX "repair_invoices_warehouse_id_idx" ON "repair_invoices"("warehouse_id");

ALTER TABLE "purchase_invoices" ADD CONSTRAINT "purchase_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sale_invoices" ADD CONSTRAINT "sale_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "repair_invoices" ADD CONSTRAINT "repair_invoices_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 6. The ledger's new columns ──────────────────────────────
ALTER TABLE "inventory_transactions" ADD COLUMN     "after_quantity" DECIMAL(14,3),
ADD COLUMN     "before_quantity" DECIMAL(14,3),
ADD COLUMN     "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reason" "stock_movement_reason",
ADD COLUMN     "unit_cost" DECIMAL(18,2),
ADD COLUMN     "warehouse_id" INTEGER,
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(14,3);

UPDATE "inventory_transactions" t SET "warehouse_id" = w."id"
FROM "warehouses" w WHERE w."workspace_id" = t."workspace_id" AND w."is_default";

-- No document date was ever stored; the moment of writing is the closest
-- thing there is.
UPDATE "inventory_transactions" SET "occurred_at" = "created_at";

-- A purchase row's price was the price paid, which is exactly its cost. For
-- every other old row the cost at the time was never recorded, and a guess
-- would be worse than the NULL.
UPDATE "inventory_transactions" SET "unit_cost" = "unit_price" WHERE "type" = 'purchase';

-- Relabelled so the kardex reads true from the first day. Until now a part
-- used on a repair was written as `sale`, and every invoice taking back its
-- own movement — an edit, a delete, a cancelled repair invoice — was written
-- as `adjustment`, the type a person correcting the shelf will now use.
-- Those three reference types are the only places that ever wrote
-- `adjustment`.
UPDATE "inventory_transactions" SET "type" = 'repair_use'
WHERE "reference_type" = 'repair_invoice' AND "type" = 'sale';

UPDATE "inventory_transactions" SET "type" = 'reversal'
WHERE "type" = 'adjustment'
  AND "reference_type" IN ('purchase_invoice', 'sale_invoice', 'repair_invoice');

-- ── 7. Reconcile the ledger with the stock column ────────────
--
-- From now on current_stock = SUM(ledger) is an invariant the tests check.
-- Until now it was not: every write clamped the column at zero while the
-- ledger logged the full quantity. Where the two disagree, one movement
-- records the difference — the column is what the shop has been looking at,
-- so it is the figure kept, and the ledger is brought to it in the open
-- rather than silently.
INSERT INTO "inventory_transactions"
    ("workspace_id", "item_id", "warehouse_id", "type", "quantity", "unit_price",
     "unit_cost", "reason", "note", "occurred_at", "created_at")
SELECT i."workspace_id", i."id", w."id", 'adjustment',
       i."current_stock" - COALESCE(l."total", 0), 0,
       i."avg_purchase_price", 'entry_error', 'تطبیق هنگام مهاجرت انبار (۱۴.۱)',
       now(), now()
FROM "items" i
JOIN "warehouses" w ON w."workspace_id" = i."workspace_id" AND w."is_default"
LEFT JOIN (
    SELECT "item_id", SUM("quantity") AS "total"
    FROM "inventory_transactions"
    GROUP BY "item_id"
) l ON l."item_id" = i."id"
WHERE i."current_stock" <> COALESCE(l."total", 0);

-- Before/after for every existing row, as a running sum per item. All of
-- them are in the default warehouse, so per item is per warehouse.
UPDATE "inventory_transactions" t
SET "after_quantity" = r."running",
    "before_quantity" = r."running" - t."quantity"
FROM (
    SELECT "id",
           SUM("quantity") OVER (PARTITION BY "item_id" ORDER BY "created_at", "id") AS "running"
    FROM "inventory_transactions"
) r
WHERE r."id" = t."id";

ALTER TABLE "inventory_transactions" ALTER COLUMN "warehouse_id" SET NOT NULL;

DROP INDEX "inventory_transactions_item_id_idx";
CREATE INDEX "inventory_transactions_item_id_created_at_idx" ON "inventory_transactions"("item_id", "created_at");
CREATE INDEX "inventory_transactions_warehouse_id_idx" ON "inventory_transactions"("warehouse_id");

ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── 8. Per-warehouse stock from the column ───────────────────
--
-- After step 7, so the column, the ledger and these rows all agree.
INSERT INTO "item_stocks" ("workspace_id", "item_id", "warehouse_id", "quantity", "created_at", "updated_at")
SELECT i."workspace_id", i."id", w."id", i."current_stock", now(), now()
FROM "items" i
JOIN "warehouses" w ON w."workspace_id" = i."workspace_id" AND w."is_default";

-- ─────────────────────────────────────────────────────────────
-- RLS and grants — hand-written, as in every migration since 2.3. Prisma
-- has no representation for either. Grants carry forward through ALTER
-- DEFAULT PRIVILEGES; RLS does not.
-- ─────────────────────────────────────────────────────────────

ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "warehouses"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

ALTER TABLE "item_stocks" ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_isolation ON "item_stocks"
  USING (workspace_id = app_current_workspace_id())
  WITH CHECK (workspace_id = app_current_workspace_id());

-- The ledger becomes append-only, like sms_wallet_transactions: a stock
-- figure is only checkable against its history if nobody can rewrite the
-- history. A correction is a new movement, never an edit.
--
-- Item deletion still removes an item's rows — through the ON DELETE CASCADE
-- on item_id, which Postgres runs as the table's owner rather than as the
-- caller — and that is the only way they leave: workspace deletion (8.7)
-- deletes the items, not the ledger.
REVOKE UPDATE, DELETE ON TABLE "inventory_transactions" FROM dofixo_app;
