import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  expectAllStockConsistent,
  expectStockConsistent,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.6: a sale invoice through the API, against Postgres. Goods
// leave the warehouse it names, each line keeps the cost it left at, and an
// edit or delete puts back exactly what was taken.

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

function api(method: "post" | "put" | "delete", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

/** An item with stock bought in through the purchase API, so its average
 * and ledger are real. */
async function stockedItem(
  code: string,
  quantity: number,
  unitPrice: number,
  isFractional = false,
): Promise<number> {
  const item = await owner.item.create({
    data: {
      workspaceId: workspaces.a.workspaceId,
      name: `کالا ${code}`,
      code,
      isFractional,
    },
  });
  if (quantity > 0) {
    const res = await api("post", "/api/purchase-invoices").send({
      supplier_name: null,
      paid_amount: 0,
      items: [{ item_id: item.id, quantity, unit_price: unitPrice }],
    });
    expect(res.status).toBe(201);
  }
  return item.id;
}

function saleLine(itemId: number, quantity: number, unitPrice = 5000) {
  return {
    item_type: "inventory",
    item_id: itemId,
    name: null,
    unit: null,
    quantity,
    unit_price: unitPrice,
  };
}

function saleBody(items: unknown[], extra: Record<string, unknown> = {}) {
  return { customer_name: "مشتری", paid_amount: 0, items, ...extra };
}

async function stockOf(itemId: number) {
  const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
  return item.currentStock.toNumber();
}

describe("a sale invoice moves stock", () => {
  it("takes its goods off the shelf and keeps what they cost", async () => {
    const itemId = await stockedItem("A", 10, 3000);

    const res = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 4, 5000)]),
    );

    expect(res.status).toBe(201);
    expect(await stockOf(itemId)).toBe(6);

    const line = await owner.saleInvoiceItem.findFirstOrThrow({
      where: { invoiceId: res.body.id },
    });
    // The margin of this sale, fixed now: sold at 5000, cost 3000.
    expect(line.unitCost?.toNumber()).toBe(3000);

    const row = await owner.inventoryTransaction.findFirstOrThrow({
      where: { itemId, type: "sale" },
    });
    expect(row).toMatchObject({
      referenceType: "sale_invoice",
      referenceId: res.body.id,
    });
    expect(row.unitCost?.toNumber()).toBe(3000);
    await expectStockConsistent(itemId);
  });

  it("keeps the cost it sold at when the item is restocked dearer", async () => {
    // The reason unit_cost is stored: the profit on this sale must not move
    // when the next delivery costs more.
    const itemId = await stockedItem("A", 10, 3000);
    const sale = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 4)]),
    );
    await api("post", "/api/purchase-invoices").send({
      supplier_name: null,
      paid_amount: 0,
      items: [{ item_id: itemId, quantity: 6, unit_price: 9000 }],
    });

    const line = await owner.saleInvoiceItem.findFirstOrThrow({
      where: { invoiceId: sale.body.id },
    });
    expect(line.unitCost?.toNumber()).toBe(3000);
  });

  it("refuses to sell more than the shelf holds, and keeps nothing", async () => {
    const itemId = await stockedItem("A", 2, 3000);

    const res = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 3)]),
    );

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("«کالا A»");
    expect(await owner.saleInvoice.count()).toBe(0);
    expect(await stockOf(itemId)).toBe(2);
    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
    });
    expect(workspace.saleSeq).toBe(0);
  });

  it("sells a custom line without touching any stock", async () => {
    const res = await api("post", "/api/sale-invoices").send(
      saleBody([
        {
          item_type: "custom",
          item_id: null,
          name: "اجرت نصب",
          unit: null,
          quantity: 1,
          unit_price: 200000,
        },
      ]),
    );

    expect(res.status).toBe(201);
    expect(await owner.inventoryTransaction.count()).toBe(0);
    const line = await owner.saleInvoiceItem.findFirstOrThrow({
      where: { invoiceId: res.body.id },
    });
    expect(line.unitCost).toBeNull();
  });

  it("sells a fraction of a fractional item", async () => {
    const cable = await stockedItem("W", 10, 1000, true);

    const res = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(cable, 2.75, 1500)]),
    );

    expect(res.status).toBe(201);
    expect(await stockOf(cable)).toBe(7.25);
    await expectStockConsistent(cable);
  });

  it("issues from the warehouse it names, judged by that warehouse alone", async () => {
    const itemId = await stockedItem("A", 10, 3000);
    const repairs = await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "تعمیرات" },
    });

    // Ten in the main warehouse, none in repairs.
    const res = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 1)], { warehouse_id: repairs.id }),
    );

    expect(res.status).toBe(400);
    expect(await stockOf(itemId)).toBe(10);
  });

  it("does not let two invoices sell the last unit twice", async () => {
    const itemId = await stockedItem("A", 1, 3000);

    const results = await Promise.all([
      api("post", "/api/sale-invoices").send(saleBody([saleLine(itemId, 1)])),
      api("post", "/api/sale-invoices").send(saleBody([saleLine(itemId, 1)])),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await stockOf(itemId)).toBe(0);
    await expectStockConsistent(itemId);
  });

  it("does not deadlock invoices that list the same items in opposite orders", async () => {
    // Without a fixed lock order, one invoice holds A waiting for B while the
    // other holds B waiting for A, and Postgres kills one of them. A few
    // rounds, because a deadlock needs the two to interleave just so.
    const a = await stockedItem("A", 20, 1000);
    const b = await stockedItem("B", 20, 1000);

    for (let round = 0; round < 5; round += 1) {
      const results = await Promise.all([
        api("post", "/api/sale-invoices").send(
          saleBody([saleLine(a, 1), saleLine(b, 1)]),
        ),
        api("post", "/api/sale-invoices").send(
          saleBody([saleLine(b, 1), saleLine(a, 1)]),
        ),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
    }

    expect(await stockOf(a)).toBe(10);
    expect(await stockOf(b)).toBe(10);
  });
});

describe("editing a sale invoice", () => {
  it("can raise a quantity using what the invoice already held", async () => {
    // Five in stock, three sold on this invoice, two left: raising the line
    // to five has to draw the three back first.
    const itemId = await stockedItem("A", 5, 3000);
    const sale = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 3)]),
    );

    const res = await api("put", `/api/sale-invoices/${sale.body.id}`).send(
      saleBody([saleLine(itemId, 5)]),
    );

    expect(res.status).toBe(200);
    expect(await stockOf(itemId)).toBe(0);
    await expectStockConsistent(itemId);
  });

  it("changes nothing when the new lines are more than the shelf", async () => {
    const itemId = await stockedItem("A", 5, 3000);
    const sale = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 3)]),
    );

    const res = await api("put", `/api/sale-invoices/${sale.body.id}`).send(
      saleBody([saleLine(itemId, 6)]),
    );

    expect(res.status).toBe(400);
    expect(await stockOf(itemId)).toBe(2);
    const lines = await owner.saleInvoiceItem.findMany({
      where: { invoiceId: sale.body.id },
    });
    expect(lines.map((line) => line.quantity.toNumber())).toEqual([3]);
    await expectStockConsistent(itemId);
  });
});

describe("deleting a sale invoice", () => {
  it("puts its goods back at the cost they left at", async () => {
    // Bought 10 at 3000, sold 4, then 6 more bought at 9000 (average 6000
    // over 12). Deleting the sale returns the four at their 3000, not at
    // 6000: sixteen units worth 3000×4 + 6000×12 = 84000, i.e. 5250 each.
    const itemId = await stockedItem("A", 10, 3000);
    const sale = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 4)]),
    );
    await api("post", "/api/purchase-invoices").send({
      supplier_name: null,
      paid_amount: 0,
      items: [{ item_id: itemId, quantity: 6, unit_price: 9000 }],
    });

    const res = await api("delete", `/api/sale-invoices/${sale.body.id}`);

    expect(res.status).toBe(200);
    const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
    expect(item.currentStock.toNumber()).toBe(16);
    expect(item.avgPurchasePrice.toNumber()).toBe(5250);
    await expectStockConsistent(itemId);
  });

  it("puts goods back once when two deletes arrive together", async () => {
    const itemId = await stockedItem("A", 10, 3000);
    const sale = await api("post", "/api/sale-invoices").send(
      saleBody([saleLine(itemId, 4)]),
    );

    const results = await Promise.all([
      api("delete", `/api/sale-invoices/${sale.body.id}`),
      api("delete", `/api/sale-invoices/${sale.body.id}`),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 404]);
    expect(await stockOf(itemId)).toBe(10);
    await expectStockConsistent(itemId);
  });
});
