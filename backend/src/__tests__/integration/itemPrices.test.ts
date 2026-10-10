import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  expectAllStockConsistent,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.20: GET /api/items/:id/prices, against Postgres.

let workspaces: TwoWorkspaces;

function api(method: "get" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

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

async function buy(
  itemId: number,
  date: string,
  quantity: number,
  price: number,
  supplier: string,
) {
  const res = await api("post", "/api/purchase-invoices").send({
    supplier_name: supplier,
    invoice_date: date,
    paid_amount: 0,
    items: [{ item_id: itemId, quantity, unit_price: price }],
  });
  expect(res.status).toBe(201);
}

describe("GET /api/items/:id/prices", () => {
  it("gives the last, lowest, highest and quantity-weighted average purchase price", async () => {
    const created = await api("post", "/api/items").send({
      code: "LCD",
      name: "ال‌سی‌دی",
      unit: "عدد",
      sell_price: 3_500,
      openingStock: 10,
      openingCost: 1_000,
    });
    const lcd = created.body.id;
    await buy(lcd, "2026-10-01", 10, 1_000, "پخش الف");
    await buy(lcd, "2026-10-03", 1, 2_000, "پخش ب");
    await buy(lcd, "2026-10-05", 4, 800, "پخش ج");
    await api("post", "/api/sale-invoices").send({
      customer_name: "مشتری",
      invoice_date: "2026-10-06",
      paid_amount: 0,
      items: [
        {
          item_type: "inventory",
          item_id: lcd,
          quantity: 2,
          unit_price: 3_000,
        },
      ],
    });

    const res = await api("get", `/api/items/${lcd}/prices`);

    expect(res.status).toBe(200);
    expect(res.body.purchase).toMatchObject({
      lines: 3,
      quantity: 15,
      // (10×1,000 + 1×2,000 + 4×800) / 15 — weighted, not the 1,267 of
      // three invoices averaged.
      average: 1_013,
      last: { price: 800, invoice_number: "PUR-0003", supplier: "پخش ج" },
      lowest: { price: 800, invoice_number: "PUR-0003" },
      highest: { price: 2_000, invoice_number: "PUR-0002", supplier: "پخش ب" },
    });
    expect(res.body.history.map((row: { price: number }) => row.price)).toEqual(
      [800, 2_000, 1_000],
    );
    expect(res.body.sale).toMatchObject({
      average: 3_000,
      last: { price: 3_000, invoice_number: "SAL-0001" },
    });
    // The moving average includes the opening stock: 25,200 / 25.
    expect(res.body.current_average).toBe(1_008);
    expect(res.body.sell_price).toBe(3_500);
  });

  it("answers with empty figures for an item never bought or sold", async () => {
    const created = await api("post", "/api/items").send({
      code: "NEW",
      name: "کالای تازه",
      unit: "عدد",
    });

    const res = await api("get", `/api/items/${created.body.id}/prices`);

    expect(res.body.purchase).toEqual({
      lines: 0,
      quantity: 0,
      last: null,
      lowest: null,
      highest: null,
      average: null,
    });
    expect(res.body.sale).toEqual({ average: null, last: null });
    expect(res.body.history).toEqual([]);
  });

  it("404s for another workspace's item", async () => {
    const created = await api("post", "/api/items").send({
      code: "LCD",
      name: "ال‌سی‌دی",
      unit: "عدد",
    });

    const res = await request(app)
      .get(`/api/items/${created.body.id}/prices`)
      .set("Authorization", `Bearer ${workspaces.b.token}`);

    expect(res.status).toBe(404);
  });
});
