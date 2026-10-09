import request from "supertest";
import app from "../../app";
import { runInWorkspaceTransaction } from "../../lib/prisma";
import { applyStockMovements } from "../../utils/stock";
import {
  disconnectOwner,
  expectAllStockConsistent,
  expectStockConsistent,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.5: a purchase invoice through the API, against Postgres. What
// it buys arrives in a warehouse, an edit nets out, and a delete can no
// longer take back goods that have already been sold.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

// Every item in the database, after every test: a scenario cannot leave
// stock inconsistent anywhere, even on an item it never checks (14.12).
afterEach(async () => {
  await expectAllStockConsistent();
});

afterAll(async () => {
  await disconnectOwner();
});

async function newItem(code: string, isFractional = false): Promise<number> {
  const item = await owner.item.create({
    data: {
      workspaceId: workspaces.a.workspaceId,
      name: `کالا ${code}`,
      code,
      isFractional,
    },
  });
  return item.id;
}

function api(method: "post" | "put" | "delete", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

function invoiceBody(
  items: { item_id: number; quantity: number; unit_price: number }[],
  extra: Record<string, unknown> = {},
) {
  return { supplier_name: "پخش قطعه", paid_amount: 0, items, ...extra };
}

/** Sells from the default warehouse the way 14.6 will, without its API. */
async function sell(itemId: number, quantity: number) {
  const { workspaceId, warehouseId } = workspaces.a;
  await runInWorkspaceTransaction(workspaceId, (tx) =>
    applyStockMovements(
      tx,
      workspaceId,
      { referenceType: null, referenceId: null, actorId: null },
      [{ itemId, warehouseId, quantity: -quantity, type: "sale" }],
    ),
  );
}

async function stockOf(itemId: number) {
  const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
  return {
    stock: item.currentStock.toNumber(),
    avg: item.avgPurchasePrice.toNumber(),
  };
}

describe("a purchase invoice moves stock", () => {
  it("brings its goods into the default warehouse", async () => {
    const itemId = await newItem("A");

    const res = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 10, unit_price: 3000 }]),
    );

    expect(res.status).toBe(201);
    expect(res.body.warehouse_id).toBe(workspaces.a.warehouseId);
    expect(await stockOf(itemId)).toEqual({ stock: 10, avg: 3000 });

    const row = await owner.inventoryTransaction.findFirstOrThrow({
      where: { itemId },
    });
    expect(row).toMatchObject({
      type: "purchase",
      referenceType: "purchase_invoice",
      referenceId: res.body.id,
      warehouseId: workspaces.a.warehouseId,
    });
    expect(row.unitCost?.toNumber()).toBe(3000);
    await expectStockConsistent(itemId);
  });

  it("receives into the warehouse the invoice names", async () => {
    const itemId = await newItem("A");
    const repairs = await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "تعمیرات" },
    });

    const res = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 3, unit_price: 100 }], {
        warehouse_id: repairs.id,
      }),
    );

    expect(res.status).toBe(201);
    const stock = await owner.itemStock.findUniqueOrThrow({
      where: { itemId_warehouseId: { itemId, warehouseId: repairs.id } },
    });
    expect(stock.quantity.toNumber()).toBe(3);
  });

  it("refuses another workspace's warehouse and keeps nothing", async () => {
    const itemId = await newItem("A");

    const res = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 3, unit_price: 100 }], {
        warehouse_id: workspaces.b.warehouseId,
      }),
    );

    expect(res.status).toBe(400);
    expect(await owner.purchaseInvoice.count()).toBe(0);
    // The number it would have drawn is back too.
    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
    });
    expect(workspace.purchaseSeq).toBe(0);
  });

  it("refuses another workspace's item by its id", async () => {
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });

    const res = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: theirs.id, quantity: 1, unit_price: 100 }]),
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(`کالا با شناسه ${theirs.id} یافت نشد`);
    expect(await owner.purchaseInvoice.count()).toBe(0);
  });

  it("takes a fraction of a fractional item, and not of a whole one", async () => {
    const cable = await newItem("W", true);
    const phone = await newItem("P");

    const ok = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: cable, quantity: 2.5, unit_price: 1001 }]),
    );
    expect(ok.status).toBe(201);
    expect(ok.body.total_amount).toBe(2503);
    expect((await stockOf(cable)).stock).toBe(2.5);

    const refused = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: phone, quantity: 0.5, unit_price: 1000 }]),
    );
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain("تعداد صحیح");
  });
});

describe("editing a purchase invoice", () => {
  it("nets out to the difference and re-prices the stock", async () => {
    const itemId = await newItem("A");
    const created = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 10, unit_price: 2000 }]),
    );

    const res = await api(
      "put",
      `/api/purchase-invoices/${created.body.id}`,
    ).send(invoiceBody([{ item_id: itemId, quantity: 4, unit_price: 2500 }]));

    expect(res.status).toBe(200);
    expect(await stockOf(itemId)).toEqual({ stock: 4, avg: 2500 });
    await expectStockConsistent(itemId);
  });

  it("allows raising a quantity after some of it was sold", async () => {
    // Ten bought, five sold, then the invoice corrected to twelve: seven
    // remain. Taking the ten out before putting the twelve in would dip
    // below zero on the way, so the edit applies them the other way round.
    const itemId = await newItem("A");
    const created = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 10, unit_price: 1000 }]),
    );
    await sell(itemId, 5);

    const res = await api(
      "put",
      `/api/purchase-invoices/${created.body.id}`,
    ).send(invoiceBody([{ item_id: itemId, quantity: 12, unit_price: 1000 }]));

    expect(res.status).toBe(200);
    expect((await stockOf(itemId)).stock).toBe(7);
    await expectStockConsistent(itemId);
  });

  it("refuses to shrink below what has already been sold", async () => {
    const itemId = await newItem("A");
    const created = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 10, unit_price: 1000 }]),
    );
    await sell(itemId, 8);

    const res = await api(
      "put",
      `/api/purchase-invoices/${created.body.id}`,
    ).send(invoiceBody([{ item_id: itemId, quantity: 5, unit_price: 1000 }]));

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("فروخته یا مصرف شده");
    // Untouched: the line rows, the stock and the ledger are as they were.
    const lines = await owner.purchaseInvoiceItem.findMany({
      where: { invoiceId: created.body.id },
    });
    expect(lines.map((line) => line.quantity.toNumber())).toEqual([10]);
    expect((await stockOf(itemId)).stock).toBe(2);
    await expectStockConsistent(itemId);
  });
});

describe("deleting a purchase invoice", () => {
  it("takes its goods back out at the price they came in at", async () => {
    // Five held at 1000, then this invoice's ten at 2000. Deleting it has
    // to leave the five at the 1000 they cost.
    const itemId = await newItem("A");
    await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 5, unit_price: 1000 }]),
    );
    const second = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 10, unit_price: 2000 }]),
    );

    const res = await api("delete", `/api/purchase-invoices/${second.body.id}`);

    expect(res.status).toBe(200);
    const after = await stockOf(itemId);
    expect(after.stock).toBe(5);
    expect(after.avg).toBeCloseTo(1000, 1);
    await expectStockConsistent(itemId);
  });

  it("refuses when its goods were already sold, and keeps the invoice", async () => {
    // Until 14.5 this clamped the stock at zero and carried on, leaving the
    // ledger and the stock figure disagreeing for good.
    const itemId = await newItem("A");
    const created = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 10, unit_price: 1000 }]),
    );
    await sell(itemId, 4);

    const res = await api(
      "delete",
      `/api/purchase-invoices/${created.body.id}`,
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("«کالا A»");
    expect(await owner.purchaseInvoice.count()).toBe(1);
    expect((await stockOf(itemId)).stock).toBe(6);
    await expectStockConsistent(itemId);
  });

  it("puts goods back once when two deletes arrive together", async () => {
    // Both used to read the invoice before their transaction, both found
    // it, and both reversed it.
    const itemId = await newItem("A");
    await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 20, unit_price: 1000 }]),
    );
    const created = await api("post", "/api/purchase-invoices").send(
      invoiceBody([{ item_id: itemId, quantity: 5, unit_price: 1000 }]),
    );

    const [first, second] = await Promise.all([
      api("delete", `/api/purchase-invoices/${created.body.id}`),
      api("delete", `/api/purchase-invoices/${created.body.id}`),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 404]);
    expect((await stockOf(itemId)).stock).toBe(20);
    await expectStockConsistent(itemId);
  });

  it("returns 404 for another workspace's invoice", async () => {
    const theirs = await owner.purchaseInvoice.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        warehouseId: workspaces.b.warehouseId,
        invoiceNumber: "PUR-0001",
      },
    });

    const res = await api("delete", `/api/purchase-invoices/${theirs.id}`);

    expect(res.status).toBe(404);
    expect(await owner.purchaseInvoice.count()).toBe(1);
  });
});
