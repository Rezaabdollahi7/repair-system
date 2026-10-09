import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Roadmap 14.12: the 14.1 migration against data shaped like production
// before it — the one migration in this project that had to carry existing
// stock across rather than start from an empty schema.
//
// It cannot run against the shared test database, which globalSetup has
// already migrated to the end. So it builds its own: a scratch database
// beside the test one, migrated up to just before the inventory migrations,
// filled with legacy rows written straight into the old schema, and then
// migrated the rest of the way. Dropped again afterwards.

const MIGRATIONS = path.resolve(__dirname, "../../../prisma/migrations");
/** The first migration of 14.1; everything before it is the old schema. */
const FIRST_INVENTORY = "20261009100000_inventory_movement_types";

const testUrl = new URL(process.env.TEST_DATABASE_URL!.split("?")[0]);
const testDb = testUrl.pathname.slice(1);
// Still ends in _test, the suffix every destructive step here is guarded by.
const scratchDb = `${testDb.replace(/_test$/, "")}_backfill_test`;
const scratchUrl = new URL(testUrl);
scratchUrl.pathname = `/${scratchDb}`;

function migrationDirs(): string[] {
  return fs
    .readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

async function applyMigration(client: Client, dir: string) {
  const sql = fs.readFileSync(
    path.join(MIGRATIONS, dir, "migration.sql"),
    "utf8",
  );
  await client.query(sql);
}

/**
 * Production as it stood before 14.1, in miniature. Three workspaces — one
 * with stock history, one tombstoned, one empty — and four items, each a
 * case the backfill has to handle differently:
 *
 *   A  consistent: +10 bought, −3 sold, −2 on a repair, +2 when that repair
 *      was cancelled = 7, and the column says 7.
 *   B  clamped: +5 bought, −8 sold. The old code clamped the column at zero
 *      while the ledger logged −8, so the two disagree by 3.
 *   C  stock with no history at all: 4 on the shelf, nothing in the ledger.
 *   D  bought and the invoice deleted: 0, and the ledger agrees.
 */
const LEGACY = `
INSERT INTO workspaces (id, name, updated_at) VALUES (101, 'کارگاه یک', now());
INSERT INTO workspaces (id, name, status, deleted_at, updated_at)
VALUES (102, 'حذف‌شده', 'deleted', now(), now());
INSERT INTO workspaces (id, name, updated_at) VALUES (103, 'خالی', now());

INSERT INTO devices (id, workspace_id, device_name, reception_number, updated_at)
VALUES (2001, 101, 'Galaxy A54', 1, now());

INSERT INTO items (id, workspace_id, name, code, unit, current_stock, min_stock, avg_purchase_price, updated_at) VALUES
  (3001, 101, 'خازن',  'A', 'عدد', 7, 2, 1000, now()),
  (3002, 101, 'سیم',   'B', 'متر', 0, 0, 2000, now()),
  (3003, 101, 'LCD',   'C', 'عدد', 4, 1, 0,    now()),
  (3004, 101, 'باتری', 'D', 'عدد', 0, 0, 500,  now());

INSERT INTO purchase_invoices (id, workspace_id, invoice_number, total_amount, updated_at)
VALUES (4001, 101, 'PUR-0001', 20000, now());
INSERT INTO purchase_invoice_items (workspace_id, invoice_id, item_id, quantity, unit_price, total_price)
VALUES (101, 4001, 3001, 10, 1000, 10000), (101, 4001, 3002, 5, 2000, 10000);

INSERT INTO sale_invoices (id, workspace_id, invoice_number, total_amount, updated_at)
VALUES (5001, 101, 'SAL-0001', 0, now());
INSERT INTO sale_invoice_items (workspace_id, invoice_id, item_id, quantity, unit_price, total_price)
VALUES (101, 5001, 3001, 3, 1500, 4500), (101, 5001, 3002, 8, 2500, 20000);

INSERT INTO repair_invoices (id, workspace_id, invoice_number, device_id, status, updated_at)
VALUES (6001, 101, 'REP-0001', 2001, 'cancelled', now());
INSERT INTO repair_invoice_items (workspace_id, invoice_id, item_type, item_id, name, quantity, unit_price)
VALUES (101, 6001, 'inventory', 3001, 'خازن', 2, 1500);

INSERT INTO inventory_transactions (workspace_id, item_id, type, quantity, unit_price, reference_id, reference_type, created_at) VALUES
  (101, 3001, 'purchase',   10, 1000, 4001, 'purchase_invoice', now() - interval '10 days'),
  (101, 3002, 'purchase',    5, 2000, 4001, 'purchase_invoice', now() - interval '10 days'),
  (101, 3001, 'sale',       -3, 1500, 5001, 'sale_invoice',     now() - interval '9 days'),
  (101, 3002, 'sale',       -8, 2500, 5001, 'sale_invoice',     now() - interval '9 days'),
  (101, 3001, 'sale',       -2, 1500, 6001, 'repair_invoice',   now() - interval '8 days'),
  (101, 3001, 'adjustment',  2, 1500, 6001, 'repair_invoice',   now() - interval '7 days'),
  (101, 3004, 'purchase',    5,  500, 4002, 'purchase_invoice', now() - interval '6 days'),
  (101, 3004, 'adjustment', -5,  500, 4002, 'purchase_invoice', now() - interval '5 days');
`;

let db: Client;

async function rows<T>(sql: string): Promise<T[]> {
  return (await db.query(sql)).rows as T[];
}

beforeAll(async () => {
  const admin = new Client({ connectionString: testUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${scratchDb}"`);
  await admin.query(`CREATE DATABASE "${scratchDb}"`);
  await admin.end();

  db = new Client({ connectionString: scratchUrl.toString() });
  await db.connect();

  const dirs = migrationDirs();
  const cut = dirs.indexOf(FIRST_INVENTORY);
  expect(cut).toBeGreaterThan(0);

  for (const dir of dirs.slice(0, cut)) await applyMigration(db, dir);
  await db.query(LEGACY);
  // Each in its own statement batch, as Prisma applies them: the enum values
  // the first adds cannot be used in the transaction that adds them.
  for (const dir of dirs.slice(cut)) await applyMigration(db, dir);
}, 120_000);

afterAll(async () => {
  await db?.end();
  const admin = new Client({ connectionString: testUrl.toString() });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS "${scratchDb}"`);
  await admin.end();
});

describe("the 14.1 migration on pre-14.1 data", () => {
  it("gives every workspace one default warehouse, the tombstoned one included", async () => {
    const warehouses = await rows<{
      workspace_id: number;
      name: string;
      is_default: boolean;
    }>(
      `SELECT workspace_id, name, is_default FROM warehouses ORDER BY workspace_id`,
    );

    expect(warehouses).toEqual([
      { workspace_id: 101, name: "انبار اصلی", is_default: true },
      { workspace_id: 102, name: "انبار اصلی", is_default: true },
      { workspace_id: 103, name: "انبار اصلی", is_default: true },
    ]);
  });

  it("keeps every item's stock and average cost exactly", async () => {
    const items = await rows<{
      code: string;
      current_stock: string;
      avg_purchase_price: string;
      is_fractional: boolean;
    }>(
      `SELECT code, current_stock, avg_purchase_price, is_fractional FROM items ORDER BY code`,
    );

    expect(items).toEqual([
      {
        code: "A",
        current_stock: "7.000",
        avg_purchase_price: "1000.00",
        is_fractional: false,
      },
      {
        code: "B",
        current_stock: "0.000",
        avg_purchase_price: "2000.00",
        is_fractional: true,
      },
      {
        code: "C",
        current_stock: "4.000",
        avg_purchase_price: "0.00",
        is_fractional: false,
      },
      {
        code: "D",
        current_stock: "0.000",
        avg_purchase_price: "500.00",
        is_fractional: false,
      },
    ]);
  });

  it("puts each item's stock in its workspace's default warehouse", async () => {
    const mismatched = await rows(`
      SELECT i.code
      FROM items i
      JOIN item_stocks s ON s.item_id = i.id
      JOIN warehouses w ON w.id = s.warehouse_id
      WHERE s.quantity <> i.current_stock
         OR w.workspace_id <> i.workspace_id
         OR w.is_default IS NOT TRUE
    `);
    const count = await rows<{ n: string }>(
      `SELECT count(*) AS n FROM item_stocks`,
    );

    expect(mismatched).toEqual([]);
    expect(Number(count[0].n)).toBe(4);
  });

  it("reconciles a ledger that disagreed, in the open, and only there", async () => {
    const reconciling = await rows<{
      code: string;
      quantity: string;
      type: string;
      reason: string;
      note: string;
    }>(`
      SELECT i.code, t.quantity, t.type, t.reason, t.note
      FROM inventory_transactions t JOIN items i ON i.id = t.item_id
      WHERE t.note = 'تطبیق هنگام مهاجرت انبار (۱۴.۱)'
      ORDER BY i.code
    `);

    // B logged −3 against a column of 0; C had 4 and no history. A and D
    // already agreed and get nothing.
    expect(reconciling).toEqual([
      {
        code: "B",
        quantity: "3.000",
        type: "adjustment",
        reason: "entry_error",
        note: "تطبیق هنگام مهاجرت انبار (۱۴.۱)",
      },
      {
        code: "C",
        quantity: "4.000",
        type: "adjustment",
        reason: "entry_error",
        note: "تطبیق هنگام مهاجرت انبار (۱۴.۱)",
      },
    ]);
  });

  it("leaves current_stock = SUM(item_stocks) = SUM(ledger) for every item", async () => {
    const broken = await rows(`
      SELECT i.code
      FROM items i
      LEFT JOIN (SELECT item_id, SUM(quantity) q FROM item_stocks GROUP BY item_id) s
        ON s.item_id = i.id
      LEFT JOIN (SELECT item_id, SUM(quantity) q FROM inventory_transactions GROUP BY item_id) l
        ON l.item_id = i.id
      WHERE i.current_stock <> COALESCE(s.q, 0)
         OR i.current_stock <> COALESCE(l.q, 0)
    `);

    expect(broken).toEqual([]);
  });

  it("names what each old movement was, and keeps the ones it cannot name", async () => {
    const ledger = await rows<{
      code: string;
      type: string;
      reference_type: string | null;
    }>(`
      SELECT i.code, t.type, t.reference_type
      FROM inventory_transactions t JOIN items i ON i.id = t.item_id
      WHERE t.note IS DISTINCT FROM 'تطبیق هنگام مهاجرت انبار (۱۴.۱)'
      ORDER BY t.id
    `);

    expect(ledger).toEqual([
      { code: "A", type: "purchase", reference_type: "purchase_invoice" },
      { code: "B", type: "purchase", reference_type: "purchase_invoice" },
      { code: "A", type: "sale", reference_type: "sale_invoice" },
      { code: "B", type: "sale", reference_type: "sale_invoice" },
      // A part used on a repair was written as a sale.
      { code: "A", type: "repair_use", reference_type: "repair_invoice" },
      // An invoice taking back its own movement was written as adjustment.
      { code: "A", type: "reversal", reference_type: "repair_invoice" },
      { code: "D", type: "purchase", reference_type: "purchase_invoice" },
      { code: "D", type: "reversal", reference_type: "purchase_invoice" },
    ]);
  });

  it("gives purchases their cost and leaves every other old cost unknown", async () => {
    const costs = await rows<{ type: string; unit_cost: string | null }>(`
      SELECT DISTINCT type::text AS type, unit_cost FROM inventory_transactions
      WHERE note IS NULL ORDER BY type, unit_cost
    `);

    expect(costs).toEqual([
      { type: "purchase", unit_cost: "500.00" },
      { type: "purchase", unit_cost: "1000.00" },
      { type: "purchase", unit_cost: "2000.00" },
      { type: "repair_use", unit_cost: null },
      { type: "reversal", unit_cost: null },
      { type: "sale", unit_cost: null },
    ]);
  });

  it("runs before/after as a running sum that ends on the stock", async () => {
    const a = await rows<{ before_quantity: string; after_quantity: string }>(`
      SELECT before_quantity, after_quantity
      FROM inventory_transactions WHERE item_id = 3001 ORDER BY created_at, id
    `);
    expect(a).toEqual([
      { before_quantity: "0.000", after_quantity: "10.000" },
      { before_quantity: "10.000", after_quantity: "7.000" },
      { before_quantity: "7.000", after_quantity: "5.000" },
      { before_quantity: "5.000", after_quantity: "7.000" },
    ]);

    // Each item's last movement, then compared — filtering first would pick
    // the last of the rows that disagree rather than the last row.
    const last = await rows(`
      SELECT code FROM (
        SELECT DISTINCT ON (t.item_id) i.code, t.after_quantity, i.current_stock
        FROM inventory_transactions t JOIN items i ON i.id = t.item_id
        ORDER BY t.item_id, t.created_at DESC, t.id DESC
      ) latest
      WHERE after_quantity <> current_stock
    `);
    expect(last).toEqual([]);
  });

  it("files every invoice and every movement in its workspace's default warehouse", async () => {
    const misfiled = await rows(`
      SELECT 'purchase' AS kind, x.id FROM purchase_invoices x
        JOIN warehouses w ON w.id = x.warehouse_id
        WHERE w.workspace_id <> x.workspace_id OR w.is_default IS NOT TRUE
      UNION ALL
      SELECT 'sale', x.id FROM sale_invoices x
        JOIN warehouses w ON w.id = x.warehouse_id
        WHERE w.workspace_id <> x.workspace_id OR w.is_default IS NOT TRUE
      UNION ALL
      SELECT 'repair', x.id FROM repair_invoices x
        JOIN warehouses w ON w.id = x.warehouse_id
        WHERE w.workspace_id <> x.workspace_id OR w.is_default IS NOT TRUE
      UNION ALL
      SELECT 'ledger', x.id FROM inventory_transactions x
        JOIN warehouses w ON w.id = x.warehouse_id
        WHERE w.workspace_id <> x.workspace_id OR w.is_default IS NOT TRUE
    `);

    expect(misfiled).toEqual([]);
  });

  it("deletes no invoice and no line", async () => {
    const counts = await rows<{ t: string; n: string }>(`
      SELECT 'purchase_invoices' t, count(*) n FROM purchase_invoices
      UNION ALL SELECT 'purchase_invoice_items', count(*) FROM purchase_invoice_items
      UNION ALL SELECT 'sale_invoices', count(*) FROM sale_invoices
      UNION ALL SELECT 'sale_invoice_items', count(*) FROM sale_invoice_items
      UNION ALL SELECT 'repair_invoices', count(*) FROM repair_invoices
      UNION ALL SELECT 'repair_invoice_items', count(*) FROM repair_invoice_items
    `);

    expect(Object.fromEntries(counts.map((c) => [c.t, Number(c.n)]))).toEqual({
      purchase_invoices: 1,
      purchase_invoice_items: 2,
      sale_invoices: 1,
      sale_invoice_items: 2,
      repair_invoices: 1,
      repair_invoice_items: 1,
    });
  });
});
