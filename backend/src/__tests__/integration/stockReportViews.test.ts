import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  expectAllStockConsistent,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.22: the stock report's idle and slow views and its column per
// warehouse, against Postgres.

let workspaces: TwoWorkspaces;
let bench: number;

function api(method: "get" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

/** A date `days` ago, as the API takes it. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

async function item(code: string, stock: number, cost: number) {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    ...(stock > 0 ? { openingStock: stock, openingCost: cost } : {}),
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function sell(itemId: number, quantity: number, date: string) {
  const res = await api("post", "/api/sale-invoices").send({
    customer_name: "مشتری",
    invoice_date: date,
    paid_amount: 0,
    items: [
      { item_type: "inventory", item_id: itemId, quantity, unit_price: 5_000 },
    ],
  });
  expect(res.status).toBe(201);
}

interface Row {
  code: string;
  out_quantity: number | null;
  last_out_at: string | null;
  days_of_cover: number | null;
  warehouse_stocks: Record<string, number> | null;
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  bench = (
    await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "میز تعمیر" },
    })
  ).id;

  const fast = await item("FAST", 20, 1_000); // 10 sold this month
  const slow = await item("SLOW", 30, 1_000); // 1 sold this month
  const stale = await item("STALE", 5, 4_000); // last sold 200 days ago
  await item("NEVER", 3, 10_000); // never sold
  await item("EMPTY", 0, 0); // nothing on the shelf: in neither view

  await sell(fast, 10, daysAgo(5));
  await sell(slow, 1, daysAgo(10));
  await sell(stale, 1, daysAgo(200));
  await api("post", "/api/stock-transfers").send({
    from_warehouse_id: workspaces.a.warehouseId,
    to_warehouse_id: bench,
    lines: [{ item_id: slow, quantity: 9 }],
  });
});

afterEach(async () => {
  await expectAllStockConsistent();
});

afterAll(async () => {
  await disconnectOwner();
});

describe("GET /api/reports/stock — 14.22 views", () => {
  it("lists idle stock, most money first, with when it last left", async () => {
    const res = await api("get", "/api/reports/stock?view=idle&days=90");

    expect(res.status).toBe(200);
    // NEVER: 3 × 10,000; STALE: 4 × 4,000.
    expect(res.body.data.map((row: Row) => row.code)).toEqual([
      "NEVER",
      "STALE",
    ]);
    const stale = res.body.data.find((row: Row) => row.code === "STALE");
    expect(stale.out_quantity).toBe(0);
    expect(stale.last_out_at?.slice(0, 10)).toBe(daysAgo(200));
    expect(res.body.data[0].last_out_at).toBeNull();
    expect(res.body.summary.total_inventory_value).toBe(46_000);
  });

  it("ranks slow sellers by how long the shelf would last", async () => {
    const res = await api("get", "/api/reports/stock?view=slow&days=30");

    // SLOW: 29 left, 1 sold in 30 days → 870 days. FAST: 10 left, 10 sold →
    // 30 days. STALE sold nothing in the window: idle, not slow.
    expect(
      res.body.data.map((row: Row) => [
        row.code,
        row.out_quantity,
        row.days_of_cover,
      ]),
    ).toEqual([
      ["SLOW", 1, 870],
      ["FAST", 10, 30],
    ]);
  });

  it("widens the window: a 365-day view no longer counts STALE as idle", async () => {
    const res = await api("get", "/api/reports/stock?view=idle&days=365");

    expect(res.body.data.map((row: Row) => row.code)).toEqual(["NEVER"]);
  });

  it("gives each item's quantity in every warehouse on request", async () => {
    const res = await api("get", "/api/reports/stock?perWarehouse=true");

    const slow = res.body.data.find((row: Row) => row.code === "SLOW");
    expect(slow.warehouse_stocks).toEqual({
      [workspaces.a.warehouseId]: 20,
      [bench]: 9,
    });
    const plain = await api("get", "/api/reports/stock");
    expect(plain.body.data[0].warehouse_stocks).toBeNull();
  });
});
