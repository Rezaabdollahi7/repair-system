import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  expectAllStockConsistent,
  seedDevice,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.18: GET /api/items/:id/trade — the item page's «خرید و فروش»
// tab, against Postgres.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

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

async function stockedItem(code: string): Promise<number> {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    openingStock: 10,
    openingCost: 1_000,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function repairInvoice(
  itemId: number,
  quantity: number,
  date: string,
): Promise<number> {
  const device = await seedDevice(workspaces.a.workspaceId, {
    deviceName: "Galaxy A54",
  });
  const res = await api("post", "/api/repair-invoices").send({
    device_id: device.id,
    customer_name: "مشتری تعمیر",
    invoice_date: date,
    items: [
      {
        item_type: "inventory",
        item_id: itemId,
        name: "ال‌سی‌دی",
        quantity,
        unit_price: 4_000,
      },
    ],
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("GET /api/items/:id/trade", () => {
  it("lists every invoice line for the item, newest first, with who was on the other side", async () => {
    const lcd = await stockedItem("LCD");
    await api("post", "/api/purchase-invoices").send({
      supplier_name: "پخش قطعات",
      invoice_date: "2026-10-01",
      paid_amount: 0,
      items: [{ item_id: lcd, quantity: 5, unit_price: 1_200 }],
    });
    await api("post", "/api/sale-invoices").send({
      customer_name: "آقای رضایی",
      invoice_date: "2026-10-03",
      paid_amount: 0,
      items: [
        { item_type: "inventory", item_id: lcd, quantity: 2, unit_price: 3_000 },
      ],
    });
    const repair = await repairInvoice(lcd, 1, "2026-10-05");
    await api("put", `/api/repair-invoices/${repair}/status`).send({
      status: "issued",
    });

    const res = await api("get", `/api/items/${lcd}/trade`);

    expect(res.status).toBe(200);
    expect(
      res.body.rows.map(
        (row: { kind: string; party: string; quantity: number }) => [
          row.kind,
          row.party,
          row.quantity,
        ],
      ),
    ).toEqual([
      ["repair", "مشتری تعمیر", 1],
      ["sale", "آقای رضایی", 2],
      ["purchase", "پخش قطعات", 5],
    ]);
    expect(res.body.rows[0]).toMatchObject({
      invoice_number: "REP-0001",
      status: "issued",
      unit_price: 4_000,
    });
    expect(res.body.rows[2]).toMatchObject({
      invoice_number: "PUR-0001",
      total_price: 6_000,
    });
    expect(res.body.totals).toEqual({
      purchase: { lines: 1, quantity: 5, amount: 6_000 },
      sale: { lines: 1, quantity: 2, amount: 6_000 },
      repair: { lines: 1, quantity: 1, amount: 4_000 },
    });
    expect(res.body.truncated).toBe(false);
  });

  it("lists a پیش‌فاکتور and a cancelled repair but counts neither, since neither moved stock", async () => {
    const lcd = await stockedItem("LCD");
    await repairInvoice(lcd, 1, "2026-10-01");
    const cancelled = await repairInvoice(lcd, 2, "2026-10-02");
    await api("put", `/api/repair-invoices/${cancelled}/status`).send({
      status: "issued",
    });
    await api("put", `/api/repair-invoices/${cancelled}/status`).send({
      status: "cancelled",
    });

    const res = await api("get", `/api/items/${lcd}/trade`);

    expect(
      res.body.rows.map((row: { status: string }) => row.status),
    ).toEqual(["cancelled", "draft"]);
    expect(res.body.totals.repair).toEqual({
      lines: 0,
      quantity: 0,
      amount: 0,
    });
  });

  it("does not show another item's lines, or a service line that shares its id", async () => {
    const lcd = await stockedItem("LCD");
    const other = await stockedItem("BAT");
    await api("post", "/api/purchase-invoices").send({
      supplier_name: "پخش",
      paid_amount: 0,
      items: [{ item_id: other, quantity: 1, unit_price: 500 }],
    });
    const device = await seedDevice(workspaces.a.workspaceId, {
      deviceName: "iPhone",
    });
    // A labour line whose service id happens to equal the item's id.
    await api("post", "/api/repair-invoices").send({
      device_id: device.id,
      items: [
        {
          item_type: "service",
          item_id: lcd,
          name: "دستمزد",
          quantity: 1,
          unit_price: 2_000,
        },
      ],
    });

    const res = await api("get", `/api/items/${lcd}/trade`);

    expect(res.body.rows).toEqual([]);
    expect(res.body.totals.purchase.lines).toBe(0);
  });

  it("404s for another workspace's item", async () => {
    const lcd = await stockedItem("LCD");

    const res = await request(app)
      .get(`/api/items/${lcd}/trade`)
      .set("Authorization", `Bearer ${workspaces.b.token}`);

    expect(res.status).toBe(404);
  });
});
