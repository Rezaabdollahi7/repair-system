import type { Prisma } from "../generated/prisma/client";
import {
  applyStockMovements,
  InsufficientStockError,
  UnknownItemError,
  UnknownWarehouseError,
  type StockLine,
} from "../utils/stock";

// The I/O half of the stock service against a hand-rolled transaction
// (14.12): the order it locks in and the rule that a refusal writes nothing.
// Postgres itself — that the locks hold, that nothing deadlocks — is proven
// in integration/stock.test.ts; this pins the sequence that makes it so.

const WORKSPACE = 1;
const MAIN = 1;
const REPAIRS = 2;

interface ItemRow {
  id: number;
  name: string;
  current_stock: string;
  avg_purchase_price: string;
  is_fractional: boolean;
}

interface Call {
  op: string;
  sql?: string;
  values?: unknown[];
  args?: unknown;
}

function fakeTx(options: {
  items: ItemRow[];
  warehouses?: { id: number; name: string; is_active: boolean }[];
  stocks?: { item_id: number; warehouse_id: number; quantity: string }[];
}) {
  const calls: Call[] = [];
  const warehouses = options.warehouses ?? [
    { id: MAIN, name: "انبار اصلی", is_active: true },
    { id: REPAIRS, name: "تعمیرات", is_active: true },
  ];

  const raw =
    (op: string) =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join("?").replace(/\s+/g, " ").trim();
      calls.push({ op, sql, values });
      if (op === "$executeRaw") return Promise.resolve(1);
      if (sql.includes("FROM items")) return Promise.resolve(options.items);
      if (sql.includes("FROM warehouses")) return Promise.resolve(warehouses);
      if (sql.includes("FROM item_stocks"))
        return Promise.resolve(options.stocks ?? []);
      throw new Error(`unexpected query: ${sql}`);
    };

  const write = (op: string) =>
    jest.fn((args: unknown) => {
      calls.push({ op, args });
      return Promise.resolve({ count: 1 });
    });

  const tx = {
    $queryRaw: raw("$queryRaw"),
    $executeRaw: raw("$executeRaw"),
    item: { updateMany: write("item.updateMany") },
    itemStock: { updateMany: write("itemStock.updateMany") },
    inventoryTransaction: { createMany: write("ledger.createMany") },
  };

  return { tx: tx as unknown as Prisma.TransactionClient, calls };
}

function itemRow(id: number, stock = 10, avg = 1000): ItemRow {
  return {
    id,
    name: `کالا ${id}`,
    current_stock: String(stock),
    avg_purchase_price: String(avg),
    is_fractional: false,
  };
}

function sale(itemId: number, quantity: number, warehouseId = MAIN): StockLine {
  return { itemId, warehouseId, quantity: -quantity, type: "sale" };
}

const document = {
  referenceType: "sale_invoice",
  referenceId: 77,
  actorId: 3,
};

/** The kind of each step, in the order the service took it. */
function sequence(calls: Call[]): string[] {
  return calls.map((call) => {
    if (!call.sql) return call.op;
    if (call.sql.includes("FROM items")) return "lock items";
    if (call.sql.includes("FROM warehouses")) return "share warehouses";
    if (call.sql.startsWith("INSERT INTO item_stocks")) return "open stocks";
    if (call.sql.includes("FROM item_stocks")) return "lock stocks";
    return call.sql;
  });
}

describe("applyStockMovements — locking", () => {
  it("locks items, then warehouses, then stock rows, and only then writes", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10), itemRow(20)],
      stocks: [
        { item_id: 10, warehouse_id: MAIN, quantity: "10" },
        { item_id: 20, warehouse_id: MAIN, quantity: "10" },
      ],
    });

    await applyStockMovements(tx, WORKSPACE, document, [
      sale(20, 1),
      sale(10, 1),
    ]);

    expect(sequence(calls)).toEqual([
      "lock items",
      "share warehouses",
      "open stocks",
      "lock stocks",
      "item.updateMany",
      "item.updateMany",
      "itemStock.updateMany",
      "itemStock.updateMany",
      "ledger.createMany",
    ]);
  });

  it("asks for the items in ascending order whatever order the lines came in", async () => {
    // Two documents locking the same items in the same order queue instead
    // of deadlocking. The order is the one thing both must agree on.
    const { tx, calls } = fakeTx({
      items: [itemRow(10), itemRow(20), itemRow(30)],
      stocks: [10, 20, 30].map((id) => ({
        item_id: id,
        warehouse_id: MAIN,
        quantity: "10",
      })),
    });

    await applyStockMovements(tx, WORKSPACE, document, [
      sale(30, 1),
      sale(10, 1),
      sale(20, 1),
      sale(10, 1),
    ]);

    const lockItems = calls[0];
    expect(lockItems.sql).toContain("ORDER BY id FOR UPDATE");
    expect(lockItems.values).toEqual([WORKSPACE, [10, 20, 30]]);
  });

  it("takes the warehouses FOR SHARE, so deactivating one waits for it", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10)],
      stocks: [{ item_id: 10, warehouse_id: MAIN, quantity: "10" }],
    });

    await applyStockMovements(tx, WORKSPACE, document, [sale(10, 1)]);

    expect(calls[1].sql).toMatch(/FROM warehouses .* FOR SHARE$/);
  });

  it("locks the stock rows by (item, warehouse), ascending", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10), itemRow(20)],
      stocks: [
        { item_id: 10, warehouse_id: MAIN, quantity: "10" },
        { item_id: 10, warehouse_id: REPAIRS, quantity: "10" },
        { item_id: 20, warehouse_id: MAIN, quantity: "10" },
      ],
    });

    await applyStockMovements(tx, WORKSPACE, document, [
      sale(20, 1, MAIN),
      sale(10, 1, REPAIRS),
      sale(10, 1, MAIN),
    ]);

    const lockStocks = calls.find((call) =>
      call.sql?.includes("FOR UPDATE OF s"),
    )!;
    expect(lockStocks.sql).toContain("ORDER BY s.item_id, s.warehouse_id");
    expect(lockStocks.values).toEqual([
      [10, 10, 20],
      [MAIN, REPAIRS, MAIN],
      WORKSPACE,
    ]);
  });

  it("scopes every lock to the caller's workspace", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10)],
      stocks: [{ item_id: 10, warehouse_id: MAIN, quantity: "10" }],
    });

    await applyStockMovements(tx, WORKSPACE, document, [sale(10, 1)]);

    for (const call of calls.filter((c) => c.sql)) {
      expect(call.sql).toContain("workspace_id");
      expect(call.values).toContain(WORKSPACE);
    }
  });
});

describe("applyStockMovements — refusals write nothing", () => {
  it("writes nothing when the shelf is short", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10, 1)],
      stocks: [{ item_id: 10, warehouse_id: MAIN, quantity: "1" }],
    });

    await expect(
      applyStockMovements(tx, WORKSPACE, document, [sale(10, 2)]),
    ).rejects.toBeInstanceOf(InsufficientStockError);

    expect(sequence(calls)).not.toContain("item.updateMany");
    expect(sequence(calls)).not.toContain("itemStock.updateMany");
    expect(sequence(calls)).not.toContain("ledger.createMany");
  });

  it("refuses an item the workspace does not have before opening any stock row", async () => {
    // The lock query found nothing: another workspace's id, or none at all.
    const { tx, calls } = fakeTx({ items: [] });

    await expect(
      applyStockMovements(tx, WORKSPACE, document, [sale(99, 1)]),
    ).rejects.toBeInstanceOf(UnknownItemError);

    expect(sequence(calls)).toEqual(["lock items", "share warehouses"]);
  });

  it("refuses a warehouse the workspace does not have", async () => {
    const { tx, calls } = fakeTx({ items: [itemRow(10)], warehouses: [] });

    await expect(
      applyStockMovements(tx, WORKSPACE, document, [sale(10, 1)]),
    ).rejects.toBeInstanceOf(UnknownWarehouseError);

    expect(sequence(calls)).toEqual(["lock items", "share warehouses"]);
  });

  it("touches nothing at all for a document with no stock lines", async () => {
    const { tx, calls } = fakeTx({ items: [] });

    await expect(
      applyStockMovements(tx, WORKSPACE, document, []),
    ).resolves.toEqual([]);

    expect(calls).toEqual([]);
  });
});

describe("applyStockMovements — what it writes", () => {
  it("writes the ledger with the document, its date and each row's before and after", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10, 5, 1200)],
      stocks: [{ item_id: 10, warehouse_id: MAIN, quantity: "5" }],
    });
    const occurredAt = new Date("2026-10-01T08:00:00.000Z");

    await applyStockMovements(tx, WORKSPACE, { ...document, occurredAt }, [
      sale(10, 2),
    ]);

    const ledger = calls.find((call) => call.op === "ledger.createMany")!
      .args as { data: Record<string, unknown>[] };
    expect(ledger.data).toHaveLength(1);
    const row = ledger.data[0];
    expect(row).toMatchObject({
      workspaceId: WORKSPACE,
      itemId: 10,
      warehouseId: MAIN,
      type: "sale",
      referenceType: "sale_invoice",
      referenceId: 77,
      createdBy: 3,
      occurredAt,
    });
    expect(String(row.quantity)).toBe("-2");
    expect(String(row.beforeQuantity)).toBe("5");
    expect(String(row.afterQuantity)).toBe("3");
    expect(String(row.unitCost)).toBe("1200");
  });

  it("writes the item's new total and the warehouse's new quantity", async () => {
    const { tx, calls } = fakeTx({
      items: [itemRow(10, 5, 1200)],
      stocks: [{ item_id: 10, warehouse_id: MAIN, quantity: "5" }],
    });

    await applyStockMovements(tx, WORKSPACE, document, [sale(10, 2)]);

    const itemWrite = calls.find((call) => call.op === "item.updateMany")!
      .args as { where: unknown; data: { currentStock: unknown } };
    expect(itemWrite.where).toEqual({ id: 10, workspaceId: WORKSPACE });
    expect(String(itemWrite.data.currentStock)).toBe("3");

    const stockWrite = calls.find((call) => call.op === "itemStock.updateMany")!
      .args as { where: unknown; data: { quantity: unknown } };
    expect(stockWrite.where).toEqual({
      itemId: 10,
      warehouseId: MAIN,
      workspaceId: WORKSPACE,
    });
    expect(String(stockWrite.data.quantity)).toBe("3");
  });
});
