import { runInWorkspaceTransaction } from "../../lib/prisma";
import {
  applyStockMovements,
  InsufficientStockError,
  UnknownItemError,
  UnknownWarehouseError,
  type StockLine,
} from "../../utils/stock";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Against a real database, because what the stock service is for — that two
// callers cannot both take the last unit, and that two documents cannot
// deadlock each other — lives in Postgres's row locks. stock.test.ts covers
// the arithmetic without one.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
});

async function newItem(
  workspaceId: number,
  code: string,
  isFractional = false,
): Promise<number> {
  const item = await owner.item.create({
    data: { workspaceId, name: `کالا ${code}`, code, isFractional },
  });
  return item.id;
}

async function move(
  workspaceId: number,
  lines: StockLine[],
  referenceType: string | null = null,
) {
  return runInWorkspaceTransaction(workspaceId, (tx) =>
    applyStockMovements(
      tx,
      workspaceId,
      { referenceType, referenceId: null, actorId: null },
      lines,
    ),
  );
}

/**
 * The invariant 14.1 promised and every scenario below must keep: the
 * item's total is the sum of its warehouses, each warehouse is the sum of
 * its ledger rows, and the newest row's after-quantity is what the
 * warehouse holds.
 */
async function expectStockConsistent(itemId: number) {
  const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
  const stocks = await owner.itemStock.findMany({ where: { itemId } });
  const ledger = await owner.inventoryTransaction.findMany({
    where: { itemId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const sum = (values: { toNumber(): number }[]) =>
    values.reduce((total, value) => total + value.toNumber(), 0);

  expect(item.currentStock.toNumber()).toBeCloseTo(
    sum(stocks.map((s) => s.quantity)),
    3,
  );

  for (const stock of stocks) {
    const rows = ledger.filter((row) => row.warehouseId === stock.warehouseId);
    expect(sum(rows.map((row) => row.quantity))).toBeCloseTo(
      stock.quantity.toNumber(),
      3,
    );
    if (rows.length > 0) {
      expect(rows[rows.length - 1].afterQuantity?.toNumber()).toBeCloseTo(
        stock.quantity.toNumber(),
        3,
      );
    }
  }
}

describe("applyStockMovements", () => {
  it("writes the item, the warehouse and the ledger together", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const itemId = await newItem(workspaceId, "A");

    await move(workspaceId, [
      { itemId, warehouseId, quantity: 10, type: "purchase", unitCost: 1000 },
    ]);
    const [sale] = await move(workspaceId, [
      { itemId, warehouseId, quantity: -4, type: "sale", unitPrice: 1800 },
    ]);

    const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.currentStock.toNumber()).toBe(6);
    expect(item.avgPurchasePrice.toNumber()).toBe(1000);
    // The cost the sale left at, for the invoice line to keep.
    expect(sale.unitCost).toBe(1000);

    const rows = await owner.inventoryTransaction.findMany({
      where: { itemId },
      orderBy: { id: "asc" },
    });
    expect(
      rows.map((row) => [
        row.type,
        row.quantity.toNumber(),
        row.beforeQuantity?.toNumber(),
        row.afterQuantity?.toNumber(),
        row.unitCost?.toNumber(),
      ]),
    ).toEqual([
      ["purchase", 10, 0, 10, 1000],
      ["sale", -4, 10, 6, 1000],
    ]);

    await expectStockConsistent(itemId);
  });

  it("opens the warehouse row on the first movement into it", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const itemId = await newItem(workspaceId, "A");
    const repairs = await owner.warehouse.create({
      data: { workspaceId, name: "تعمیرات" },
    });

    await move(workspaceId, [
      { itemId, warehouseId, quantity: 5, type: "purchase", unitCost: 200 },
    ]);
    await move(workspaceId, [
      { itemId, warehouseId, quantity: -2, type: "transfer_out" },
      { itemId, warehouseId: repairs.id, quantity: 2, type: "transfer_in" },
    ]);

    const stocks = await owner.itemStock.findMany({
      where: { itemId },
      orderBy: { warehouseId: "asc" },
    });
    expect(stocks.map((s) => s.quantity.toNumber())).toEqual([3, 2]);
    await expectStockConsistent(itemId);
  });

  it("keeps fractional quantities exact", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const itemId = await newItem(workspaceId, "W", true);

    await move(workspaceId, [
      { itemId, warehouseId, quantity: 0.3, type: "purchase", unitCost: 50 },
    ]);
    await move(workspaceId, [
      { itemId, warehouseId, quantity: -0.1, type: "sale" },
    ]);
    await move(workspaceId, [
      { itemId, warehouseId, quantity: -0.2, type: "sale" },
    ]);

    const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.currentStock.toString()).toBe("0");
    await expectStockConsistent(itemId);
  });

  it("rolls back everything in the caller's transaction on refusal", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const itemId = await newItem(workspaceId, "A");
    await move(workspaceId, [
      { itemId, warehouseId, quantity: 1, type: "purchase", unitCost: 10 },
    ]);

    await expect(
      runInWorkspaceTransaction(workspaceId, async (tx) => {
        // Something the caller wrote first, like an invoice header.
        await tx.category.create({
          data: { workspaceId, name: "باید برگردد" },
        });
        await applyStockMovements(
          tx,
          workspaceId,
          { referenceType: null, referenceId: null, actorId: null },
          [
            { itemId, warehouseId, quantity: -1, type: "sale" },
            { itemId, warehouseId, quantity: -1, type: "sale" },
          ],
        );
      }),
    ).rejects.toThrow(InsufficientStockError);

    expect(await owner.category.count()).toBe(0);
    expect(await owner.inventoryTransaction.count({ where: { itemId } })).toBe(
      1,
    );
    await expectStockConsistent(itemId);
  });

  it("does not reach another workspace's items or warehouses", async () => {
    const theirs = await newItem(workspaces.b.workspaceId, "B");
    const mine = await newItem(workspaces.a.workspaceId, "A");

    await expect(
      move(workspaces.a.workspaceId, [
        {
          itemId: theirs,
          warehouseId: workspaces.a.warehouseId,
          quantity: 1,
          type: "purchase",
          unitCost: 1,
        },
      ]),
    ).rejects.toThrow(UnknownItemError);

    await expect(
      move(workspaces.a.workspaceId, [
        {
          itemId: mine,
          warehouseId: workspaces.b.warehouseId,
          quantity: 1,
          type: "purchase",
          unitCost: 1,
        },
      ]),
    ).rejects.toThrow(UnknownWarehouseError);

    expect(await owner.inventoryTransaction.count()).toBe(0);
  });
});

describe("applyStockMovements under concurrency", () => {
  // Six, not more: the pool has ten connections, and each caller holds one
  // for the length of its transaction (the limit smsWallet.test.ts found).
  const CALLERS = 6;

  it("lets exactly one of several callers take the last unit", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const itemId = await newItem(workspaceId, "A");
    await move(workspaceId, [
      { itemId, warehouseId, quantity: 1, type: "purchase", unitCost: 500 },
    ]);

    const results = await Promise.allSettled(
      Array.from({ length: CALLERS }, () =>
        move(workspaceId, [
          { itemId, warehouseId, quantity: -1, type: "sale" },
        ]),
      ),
    );

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const refused = results.filter(
      (r) =>
        r.status === "rejected" && r.reason instanceof InsufficientStockError,
    );
    expect(fulfilled).toHaveLength(1);
    expect(refused).toHaveLength(CALLERS - 1);

    const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.currentStock.toNumber()).toBe(0);
    await expectStockConsistent(itemId);
  });

  it("serves as many callers as there is stock, and no more", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const itemId = await newItem(workspaceId, "A");
    await move(workspaceId, [
      { itemId, warehouseId, quantity: 3, type: "purchase", unitCost: 500 },
    ]);

    const results = await Promise.allSettled(
      Array.from({ length: CALLERS }, () =>
        move(workspaceId, [
          { itemId, warehouseId, quantity: -1, type: "sale" },
        ]),
      ),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);
    await expectStockConsistent(itemId);
  });

  it("does not deadlock two documents that touch items in opposite orders", async () => {
    // The lock order is the service's, not the caller's: items ascending,
    // then (item, warehouse) ascending. Without it these two would each hold
    // one row the other needs.
    const { workspaceId, warehouseId } = workspaces.a;
    const first = await newItem(workspaceId, "A");
    const second = await newItem(workspaceId, "B");
    await move(workspaceId, [
      {
        itemId: first,
        warehouseId,
        quantity: 100,
        type: "purchase",
        unitCost: 1,
      },
      {
        itemId: second,
        warehouseId,
        quantity: 100,
        type: "purchase",
        unitCost: 1,
      },
    ]);

    const results = await Promise.allSettled(
      Array.from({ length: CALLERS }, (_, i) =>
        move(
          workspaceId,
          i % 2 === 0
            ? [
                { itemId: first, warehouseId, quantity: -1, type: "sale" },
                { itemId: second, warehouseId, quantity: -1, type: "sale" },
              ]
            : [
                { itemId: second, warehouseId, quantity: -1, type: "sale" },
                { itemId: first, warehouseId, quantity: -1, type: "sale" },
              ],
        ),
      ),
    );

    expect(results.filter((r) => r.status === "rejected")).toEqual([]);

    const items = await owner.item.findMany({
      where: { id: { in: [first, second] } },
    });
    expect(items.map((item) => item.currentStock.toNumber())).toEqual([
      100 - CALLERS,
      100 - CALLERS,
    ]);
    await expectStockConsistent(first);
    await expectStockConsistent(second);
  });
});
