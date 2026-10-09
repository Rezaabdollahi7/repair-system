import { runInWorkspaceTransaction } from "../../lib/prisma";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.1. What the migration promises, asked of Postgres as the
// application role — every one of these is a property of grants, constraints
// or policies, which a mocked test never reaches.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
});

/** An item with one ledger row in workspace a's default warehouse. */
async function itemWithHistory() {
  const { workspaceId, warehouseId } = workspaces.a;

  const item = await owner.item.create({
    data: { workspaceId, name: "خازن", code: "C-1", currentStock: 5 },
  });
  await owner.itemStock.create({
    data: { workspaceId, itemId: item.id, warehouseId, quantity: 5 },
  });
  await owner.inventoryTransaction.create({
    data: {
      workspaceId,
      itemId: item.id,
      warehouseId,
      type: "opening",
      quantity: 5,
      unitCost: 1000,
      beforeQuantity: 0,
      afterQuantity: 5,
    },
  });

  return item;
}

describe("the stock ledger is append-only", () => {
  it("refuses UPDATE to the application role", async () => {
    await itemWithHistory();

    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.inventoryTransaction.updateMany({ data: { note: "rewritten" } }),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it("refuses DELETE to the application role", async () => {
    await itemWithHistory();

    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.inventoryTransaction.deleteMany({}),
      ),
    ).rejects.toThrow(/permission denied/i);

    expect(await owner.inventoryTransaction.count()).toBe(1);
  });

  it("still lets the application role append", async () => {
    const item = await itemWithHistory();

    await runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
      tx.inventoryTransaction.create({
        data: {
          workspaceId: workspaces.a.workspaceId,
          itemId: item.id,
          warehouseId: workspaces.a.warehouseId,
          type: "adjustment",
          reason: "damage",
          quantity: -1,
        },
      }),
    );

    expect(await owner.inventoryTransaction.count()).toBe(2);
  });

  it("leaves with its item, through the cascade, as the application role", async () => {
    // How workspace deletion (8.7) removes the ledger: it deletes the items
    // and Postgres runs the ON DELETE CASCADE as the table's owner. If that
    // ever stopped being true, deleting a workspace would fail halfway.
    const item = await itemWithHistory();

    await runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
      tx.item.delete({ where: { id: item.id } }),
    );

    expect(await owner.inventoryTransaction.count()).toBe(0);
    expect(await owner.itemStock.count()).toBe(0);
  });
});

describe("warehouses", () => {
  it("allows one default per workspace and any number of others", async () => {
    const { workspaceId } = workspaces.a;

    await runInWorkspaceTransaction(workspaceId, async (tx) => {
      await tx.warehouse.create({ data: { workspaceId, name: "تعمیرات" } });
      await tx.warehouse.create({ data: { workspaceId, name: "شعبه دوم" } });
    });

    await expect(
      runInWorkspaceTransaction(workspaceId, (tx) =>
        tx.warehouse.create({
          data: { workspaceId, name: "دومین پیش‌فرض", isDefault: true },
        }),
      ),
    ).rejects.toThrow();

    const rows = await owner.warehouse.findMany({ where: { workspaceId } });
    expect(rows).toHaveLength(3);
    expect(rows.filter((w) => w.isDefault === true)).toHaveLength(1);
  });

  it("never stores FALSE, which would break the one-default rule", async () => {
    // Two FALSE rows would collide in the unique index, so the column is
    // TRUE or NULL and a CHECK holds it there.
    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.warehouse.create({
          data: {
            workspaceId: workspaces.a.workspaceId,
            name: "غلط",
            isDefault: false,
          },
        }),
      ),
    ).rejects.toThrow(/is_default_true_or_null/);
  });

  it("are invisible across workspaces", async () => {
    const seen = await runInWorkspaceTransaction(
      workspaces.a.workspaceId,
      (tx) => tx.warehouse.findMany({ select: { workspaceId: true } }),
    );

    expect(seen).toEqual([{ workspaceId: workspaces.a.workspaceId }]);
  });

  it("cannot be created inside another workspace", async () => {
    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.warehouse.create({
          data: { workspaceId: workspaces.b.workspaceId, name: "نفوذی" },
        }),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot be deleted while stock or history points at them", async () => {
    await itemWithHistory();

    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.warehouse.delete({ where: { id: workspaces.a.warehouseId } }),
      ),
    ).rejects.toThrow();
  });
});

describe("stock never goes below zero", () => {
  it("in a warehouse", async () => {
    await itemWithHistory();

    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.itemStock.updateMany({ data: { quantity: -1 } }),
      ),
    ).rejects.toThrow(/item_stocks_quantity_not_negative/);
  });

  it("on the item's total", async () => {
    const item = await itemWithHistory();

    await expect(
      runInWorkspaceTransaction(workspaces.a.workspaceId, (tx) =>
        tx.item.update({
          where: { id: item.id },
          data: { currentStock: -0.5 },
        }),
      ),
    ).rejects.toThrow(/items_current_stock_not_negative/);
  });
});

describe("quantities", () => {
  it("keep three decimal places", async () => {
    const { workspaceId, warehouseId } = workspaces.a;
    const item = await owner.item.create({
      data: {
        workspaceId,
        name: "سیم",
        code: "W-1",
        unit: "متر",
        isFractional: true,
        currentStock: 2.125,
      },
    });
    await owner.itemStock.create({
      data: { workspaceId, itemId: item.id, warehouseId, quantity: 2.125 },
    });

    const stored = await owner.itemStock.findFirstOrThrow({
      where: { itemId: item.id },
    });

    expect(stored.quantity.toNumber()).toBe(2.125);
  });
});
