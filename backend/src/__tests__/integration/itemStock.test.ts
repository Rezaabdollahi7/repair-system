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

// Roadmap 14.8: the item endpoints that move stock — opening stock, quick
// purchase, quick sale — through the API, against Postgres.

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

function api(method: "get" | "post" | "put", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

function newItem(extra: Record<string, unknown> = {}) {
  return api("post", "/api/items").send({
    code: "LCD-A54",
    name: "ال‌سی‌دی A54",
    unit: "عدد",
    sell_price: 2_000_000,
    ...extra,
  });
}

describe("creating an item with opening stock", () => {
  it("opens with its stock at its cost, in the default warehouse", async () => {
    const res = await newItem({ openingStock: 4, openingCost: 1_200_000 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      currentStock: 4,
      avgPurchasePrice: 1_200_000,
      isFractional: false,
    });

    const row = await owner.inventoryTransaction.findFirstOrThrow({
      where: { itemId: res.body.id },
    });
    expect(row).toMatchObject({
      type: "opening",
      warehouseId: workspaces.a.warehouseId,
      referenceType: null,
    });
    expect(row.unitCost?.toNumber()).toBe(1_200_000);
    await expectStockConsistent(res.body.id);
  });

  it("writes no purchase invoice and draws no number", async () => {
    // The old way — a zero-priced quick purchase — left a 0-rial PUR- invoice
    // behind every item that opened with stock.
    await newItem({ openingStock: 4, openingCost: 1_200_000 });

    expect(await owner.purchaseInvoice.count()).toBe(0);
    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
    });
    expect(workspace.purchaseSeq).toBe(0);
  });

  it("keeps a later purchase's average honest", async () => {
    // Four at 1,200,000 then four at 1,400,000 average 1,300,000. With the
    // opening stock at zero, as it used to be, this came out at 700,000.
    const created = await newItem({ openingStock: 4, openingCost: 1_200_000 });
    await api("post", `/api/items/${created.body.id}/quick-purchase`).send({
      quantity: 4,
      unit_price: 1_400_000,
    });

    const item = await owner.item.findUniqueOrThrow({
      where: { id: created.body.id },
    });
    expect(item.avgPurchasePrice.toNumber()).toBe(1_300_000);
  });

  it("refuses opening stock without a cost", async () => {
    const res = await newItem({ openingStock: 4 });

    expect(res.status).toBe(400);
    expect(await owner.item.count()).toBe(0);
  });

  it("creates nothing when the opening stock cannot go where it was sent", async () => {
    const res = await newItem({
      openingStock: 4,
      openingCost: 1_000,
      warehouseId: workspaces.b.warehouseId,
    });

    expect(res.status).toBe(400);
    // The item went with it: one transaction.
    expect(await owner.item.count()).toBe(0);
  });

  it("opens a fractional item with a fraction, and refuses one for a whole item", async () => {
    const cable = await newItem({
      code: "W-1",
      unit: "متر",
      isFractional: true,
      openingStock: 12.5,
      openingCost: 30_000,
    });
    expect(cable.status).toBe(201);
    expect(cable.body.currentStock).toBe(12.5);

    const phone = await newItem({ openingStock: 0.5, openingCost: 1 });
    expect(phone.status).toBe(400);
  });
});

describe("an item's stock per warehouse", () => {
  it("is shown on the item, with every warehouse that holds it", async () => {
    const created = await newItem({ openingStock: 5, openingCost: 1_000 });
    const repairs = await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "تعمیرات" },
    });
    await api("post", `/api/items/${created.body.id}/quick-purchase`).send({
      quantity: 2,
      unit_price: 1_000,
      warehouse_id: repairs.id,
    });

    const res = await api("get", `/api/items/${created.body.id}`);

    expect(res.body.currentStock).toBe(7);
    expect(res.body.stocks).toEqual([
      expect.objectContaining({
        warehouseId: workspaces.a.warehouseId,
        warehouseName: "انبار اصلی",
        quantity: 5,
      }),
      expect.objectContaining({
        warehouseId: repairs.id,
        warehouseName: "تعمیرات",
        quantity: 2,
      }),
    ]);
  });
});

describe("quick purchase and quick sale", () => {
  it("refuses a quick purchase at no price", async () => {
    const created = await newItem();

    const res = await api(
      "post",
      `/api/items/${created.body.id}/quick-purchase`,
    ).send({ quantity: 3, unit_price: 0 });

    expect(res.status).toBe(400);
  });

  it("sells at the sale price and keeps the cost on the invoice line", async () => {
    const created = await newItem({ openingStock: 3, openingCost: 1_200_000 });

    const res = await api(
      "post",
      `/api/items/${created.body.id}/quick-sale`,
    ).send({ quantity: 2, customer_name: "زهرا" });

    expect(res.status).toBe(200);
    expect(res.body.new_stock).toBe(1);
    const line = await owner.saleInvoiceItem.findFirstOrThrow({
      where: { itemId: created.body.id },
    });
    expect(line.unitPrice.toNumber()).toBe(2_000_000);
    expect(line.unitCost?.toNumber()).toBe(1_200_000);
    await expectStockConsistent(created.body.id);
  });

  it("refuses to sell what is not on the shelf, and keeps nothing", async () => {
    const created = await newItem({ openingStock: 1, openingCost: 1_000 });

    const res = await api(
      "post",
      `/api/items/${created.body.id}/quick-sale`,
    ).send({ quantity: 2 });

    expect(res.status).toBe(400);
    expect(await owner.saleInvoice.count()).toBe(0);
  });

  it("does not sell the last unit twice", async () => {
    const created = await newItem({ openingStock: 1, openingCost: 1_000 });

    const results = await Promise.all([
      api("post", `/api/items/${created.body.id}/quick-sale`).send({
        quantity: 1,
      }),
      api("post", `/api/items/${created.body.id}/quick-sale`).send({
        quantity: 1,
      }),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    await expectStockConsistent(created.body.id);
  });

  it("returns 404 for another workspace's item", async () => {
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });

    const res = await api(
      "post",
      `/api/items/${theirs.id}/quick-purchase`,
    ).send({ quantity: 1, unit_price: 100 });

    expect(res.status).toBe(404);
    expect(await owner.inventoryTransaction.count()).toBe(0);
  });
});

describe("the fractional setting", () => {
  it("cannot be turned off while the item holds a fraction", async () => {
    const cable = await newItem({
      code: "W-1",
      unit: "متر",
      isFractional: true,
      openingStock: 2.5,
      openingCost: 30_000,
    });

    const res = await api("put", `/api/items/${cable.body.id}`).send({
      isFractional: false,
    });

    expect(res.status).toBe(400);
  });
});
