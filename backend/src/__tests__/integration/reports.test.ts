import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.9: the profit report reads the cost each sale stored, and the
// stock report narrows to one warehouse — through the API, against Postgres.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
});

function api(method: "get" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

async function newItem(
  code: string,
  openingStock: number,
  openingCost: number,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    sell_price: 5_000,
    openingStock,
    openingCost,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

function buy(itemId: number, quantity: number, unitPrice: number) {
  return api("post", "/api/purchase-invoices").send({
    supplier_name: null,
    paid_amount: 0,
    items: [{ item_id: itemId, quantity, unit_price: unitPrice }],
  });
}

function sell(itemId: number, quantity: number, unitPrice: number) {
  return api("post", "/api/sale-invoices").send({
    paid_amount: 0,
    items: [
      {
        item_type: "inventory",
        item_id: itemId,
        quantity,
        unit_price: unitPrice,
      },
    ],
  });
}

describe("the profit report", () => {
  it("keeps a sale's margin when the item is restocked at a new price", async () => {
    const lcd = await newItem("LCD", 2, 1_000);
    expect((await sell(lcd, 2, 3_000)).status).toBe(201);

    // Restocking dearer moves today's average to 2,000. The old report
    // re-costed last week's sale at that and halved its margin.
    expect((await buy(lcd, 5, 2_000)).status).toBe(201);

    const res = await api("get", "/api/reports/profit");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        item_id: lcd,
        total_quantity: 2,
        total_revenue: 6_000,
        total_cost: 2_000,
        profit: 4_000,
      }),
    ]);
    expect(res.body.summary).toMatchObject({
      total_revenue: 6_000,
      total_cost: 2_000,
      total_profit: 4_000,
    });
  });

  it("costs each sale at the average of its own moment", async () => {
    // Two at 1,000 → sell one (cost 1,000) → two more at 1,600 (average
    // 1,400 over three) → sell one (cost 1,400).
    const lcd = await newItem("LCD", 2, 1_000);
    await sell(lcd, 1, 3_000);
    await buy(lcd, 2, 1_600);
    await sell(lcd, 1, 3_000);

    const res = await api("get", "/api/reports/profit");

    expect(res.body.data[0]).toMatchObject({
      total_quantity: 2,
      total_cost: 2_400,
      profit: 3_600,
    });
  });

  it("costs a fractional sale exactly", async () => {
    const wire = await newItem("W", 10, 30_000, {
      unit: "متر",
      isFractional: true,
    });
    await sell(wire, 0.4, 20_000);

    const res = await api("get", "/api/reports/profit");

    expect(res.body.data[0]).toMatchObject({
      total_quantity: 0.4,
      total_cost: 12_000,
    });
  });

  it("falls back to today's average for a line that stored no cost", async () => {
    // A line from before 14.6, written directly as the old code left it.
    const lcd = await newItem("LCD", 4, 1_500);
    const sale = await sell(lcd, 1, 3_000);
    await owner.saleInvoiceItem.updateMany({
      where: { invoiceId: sale.body.id },
      data: { unitCost: null },
    });

    const res = await api("get", "/api/reports/profit");

    expect(res.body.data[0].total_cost).toBe(1_500);
  });

  it("leaves out another workspace's sales", async () => {
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });
    const invoice = await owner.saleInvoice.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        invoiceNumber: "SAL-9999",
        warehouseId: workspaces.b.warehouseId,
        totalAmount: 9_000,
      },
    });
    await owner.saleInvoiceItem.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        invoiceId: invoice.id,
        itemId: theirs.id,
        quantity: 1,
        unitPrice: 9_000,
        totalPrice: 9_000,
        unitCost: 1,
      },
    });

    const res = await api("get", "/api/reports/profit");

    expect(res.body.data).toEqual([]);
  });
});

describe("the stock report by warehouse", () => {
  async function secondWarehouse(name = "تعمیرات") {
    return owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name },
    });
  }

  it("shows what one warehouse holds, valued at that quantity", async () => {
    const repairs = await secondWarehouse();
    const lcd = await newItem("LCD", 5, 1_000);
    const battery = await newItem("BAT", 3, 2_000);
    // Two LCDs into the repairs warehouse as well; no batteries.
    await api("post", `/api/items/${lcd}/quick-purchase`).send({
      quantity: 2,
      unit_price: 1_000,
      warehouse_id: repairs.id,
    });

    const res = await api(
      "get",
      `/api/reports/stock?warehouseId=${repairs.id}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      expect.objectContaining({
        id: lcd,
        current_stock: 7,
        warehouse_stock: 2,
      }),
    ]);
    expect(res.body.summary).toMatchObject({
      total_items: 1,
      total_inventory_value: 2_000,
    });

    const main = await api(
      "get",
      `/api/reports/stock?warehouseId=${workspaces.a.warehouseId}`,
    );
    expect(
      main.body.data.map((row: { id: number; warehouse_stock: number }) => [
        row.id,
        row.warehouse_stock,
      ]),
    ).toEqual([
      [battery, 3],
      [lcd, 5],
    ]);
    expect(main.body.summary.total_inventory_value).toBe(11_000);
  });

  it("reports every item, without a warehouse figure, when not filtered", async () => {
    await newItem("LCD", 5, 1_000);
    await newItem("BAT", 0, 0);

    const res = await api("get", "/api/reports/stock");

    expect(res.body.data).toHaveLength(2);
    expect(
      res.body.data.every(
        (row: { warehouse_stock: unknown }) => row.warehouse_stock === null,
      ),
    ).toBe(true);
  });

  it("does not show another workspace's warehouse", async () => {
    const res = await api(
      "get",
      `/api/reports/stock?warehouseId=${workspaces.b.warehouseId}`,
    );

    expect(res.status).toBe(404);
  });

  it("refuses a warehouse id that is not a number", async () => {
    const res = await api("get", "/api/reports/stock?warehouseId=main");

    expect(res.status).toBe(400);
  });
});
