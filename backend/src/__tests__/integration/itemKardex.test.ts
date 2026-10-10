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

// Roadmap 14.19: GET /api/items/:id/kardex, against Postgres.

let workspaces: TwoWorkspaces;
let main: number;
let bench: number;
let lcd: number;

function api(method: "get" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

interface KardexRow {
  type: string;
  quantity: number;
  balance: number;
  warehouse_id: number;
  document_number: string | null;
  reference_type: string | null;
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  main = workspaces.a.warehouseId;
  bench = (
    await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "میز تعمیر" },
    })
  ).id;

  // 10 opening in main → +5 bought into the bench → −3 sold from main →
  // 2 moved from the bench to main. Entered in that order.
  const item = await api("post", "/api/items").send({
    code: "LCD",
    name: "ال‌سی‌دی",
    unit: "عدد",
    openingStock: 10,
    openingCost: 1_000,
  });
  lcd = item.body.id;
  await api("post", "/api/purchase-invoices").send({
    supplier_name: "پخش",
    invoice_date: "2026-10-01",
    paid_amount: 0,
    warehouse_id: bench,
    items: [{ item_id: lcd, quantity: 5, unit_price: 1_000 }],
  });
  await api("post", "/api/sale-invoices").send({
    customer_name: "مشتری",
    invoice_date: "2026-10-03",
    paid_amount: 0,
    items: [
      { item_type: "inventory", item_id: lcd, quantity: 3, unit_price: 2_000 },
    ],
  });
  await api("post", "/api/stock-transfers").send({
    from_warehouse_id: bench,
    to_warehouse_id: main,
    transferred_at: "2026-10-05",
    lines: [{ item_id: lcd, quantity: 2 }],
  });
});

afterEach(async () => {
  await expectAllStockConsistent();
});

afterAll(async () => {
  await disconnectOwner();
});

describe("GET /api/items/:id/kardex", () => {
  it("lists every movement newest first, with the item's balance after each and its document", async () => {
    const res = await api("get", `/api/items/${lcd}/kardex`);

    expect(res.status).toBe(200);
    expect(
      res.body.data.map((row: KardexRow) => [
        row.type,
        row.quantity,
        row.balance,
        row.document_number,
      ]),
    ).toEqual([
      ["transfer_in", 2, 12, "TRF-0001"],
      ["transfer_out", -2, 10, "TRF-0001"],
      ["sale", -3, 12, "SAL-0001"],
      ["purchase", 5, 15, "PUR-0001"],
      ["opening", 10, 10, null],
    ]);
    expect(res.body.summary).toEqual({
      opening: 0,
      total_in: 17,
      total_out: 5,
      closing: 12,
    });
    // The last balance is the shelf.
    const stock = await owner.item.findUniqueOrThrow({ where: { id: lcd } });
    expect(stock.currentStock.toNumber()).toBe(12);
  });

  it("gives one warehouse's balance when filtered to it", async () => {
    const res = await api(
      "get",
      `/api/items/${lcd}/kardex?warehouse_id=${bench}`,
    );

    expect(
      res.body.data.map((row: KardexRow) => [row.type, row.balance]),
    ).toEqual([
      ["transfer_out", 3],
      ["purchase", 5],
    ]);
    expect(res.body.summary.closing).toBe(3);
  });

  it("filters by the document's date without changing what the balances say", async () => {
    const res = await api(
      "get",
      `/api/items/${lcd}/kardex?from_date=2026-10-02&to_date=2026-10-03`,
    );

    expect(
      res.body.data.map((row: KardexRow) => [row.type, row.balance]),
    ).toEqual([["sale", 12]]);
    expect(res.body.summary).toEqual({
      opening: 15,
      total_in: 0,
      total_out: 3,
      closing: 12,
    });
  });

  it("pages newest first", async () => {
    const first = await api("get", `/api/items/${lcd}/kardex?limit=2`);
    const third = await api("get", `/api/items/${lcd}/kardex?limit=2&page=3`);

    expect(first.body.total).toBe(5);
    expect(first.body.totalPages).toBe(3);
    expect(first.body.data.map((row: KardexRow) => row.type)).toEqual([
      "transfer_in",
      "transfer_out",
    ]);
    expect(third.body.data.map((row: KardexRow) => row.type)).toEqual([
      "opening",
    ]);
  });

  it("404s for another workspace's item", async () => {
    const res = await request(app)
      .get(`/api/items/${lcd}/kardex`)
      .set("Authorization", `Bearer ${workspaces.b.token}`);

    expect(res.status).toBe(404);
  });
});
