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

// Roadmap 14.21: GET /api/reports/movements (گردش کالا), against Postgres.

let workspaces: TwoWorkspaces;
let main: number;
let bench: number;
let lcd: number;
let cable: number;
let category: number;

function api(method: "get" | "post", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

async function item(code: string, extra: Record<string, unknown> = {}) {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function buy(itemId: number, date: string, quantity: number) {
  const res = await api("post", "/api/purchase-invoices").send({
    supplier_name: "پخش",
    invoice_date: date,
    paid_amount: 0,
    items: [{ item_id: itemId, quantity, unit_price: 1_000 }],
  });
  expect(res.status).toBe(201);
}

const PERIOD = "from_date=2026-09-10&to_date=2026-09-30";

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  main = workspaces.a.warehouseId;
  bench = (
    await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "میز تعمیر" },
    })
  ).id;
  category = (
    await owner.category.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "قطعات" },
    })
  ).id;

  lcd = await item("LCD", { categoryId: category });
  cable = await item("CBL");
  await item("IDLE"); // never held anything: not in the report

  // Before the period: 10 LCD and 4 cables.
  await buy(lcd, "2026-09-01", 10);
  await buy(cable, "2026-09-02", 4);

  // During: sell 3, move 2 to the bench, lose 1, buy 5.
  await api("post", "/api/sale-invoices").send({
    customer_name: "مشتری",
    invoice_date: "2026-09-15",
    paid_amount: 0,
    items: [
      { item_type: "inventory", item_id: lcd, quantity: 3, unit_price: 2_000 },
    ],
  });
  await api("post", "/api/stock-transfers").send({
    from_warehouse_id: main,
    to_warehouse_id: bench,
    transferred_at: "2026-09-16",
    lines: [{ item_id: lcd, quantity: 2 }],
  });
  await api("post", "/api/stock-adjustments").send({
    adjusted_at: "2026-09-17",
    lines: [{ item_id: lcd, direction: "out", quantity: 1, reason: "damage" }],
  });
  await buy(lcd, "2026-09-20", 5);

  // After: not in the period.
  await api("post", "/api/sale-invoices").send({
    customer_name: "مشتری",
    invoice_date: "2026-10-05",
    paid_amount: 0,
    items: [
      { item_type: "inventory", item_id: lcd, quantity: 1, unit_price: 2_000 },
    ],
  });
});

afterEach(async () => {
  await expectAllStockConsistent();
});

afterAll(async () => {
  await disconnectOwner();
});

describe("GET /api/reports/movements", () => {
  it("gives each item's opening, per-kind movements and closing for the period", async () => {
    const res = await api("get", `/api/reports/movements?${PERIOD}`);

    expect(res.status).toBe(200);
    expect(res.body.data.map((row: { code: string }) => row.code)).toEqual([
      "CBL",
      "LCD",
    ]);
    const row = res.body.data.find((r: { code: string }) => r.code === "LCD");
    expect(row).toMatchObject({
      opening: 10,
      initial: 0,
      purchase: 5,
      sale: 3,
      repair_use: 0,
      // Both sides of the transfer, netting to nothing for the item.
      transfer_in: 2,
      transfer_out: 2,
      correction: -1,
      other: 0,
      closing: 11,
      moved: true,
      category_name: "قطعات",
    });
    // Held stock all period, moved nothing: listed, opening = closing.
    expect(
      res.body.data.find((r: { code: string }) => r.code === "CBL"),
    ).toMatchObject({ opening: 4, closing: 4, moved: false });
    expect(res.body.summary).toEqual({ item_count: 2, moved_count: 1 });
  });

  it("gives one warehouse's figures when filtered to it", async () => {
    const atMain = await api(
      "get",
      `/api/reports/movements?${PERIOD}&warehouse_id=${main}`,
    );
    const atBench = await api(
      "get",
      `/api/reports/movements?${PERIOD}&warehouse_id=${bench}`,
    );

    expect(
      atMain.body.data.find((r: { code: string }) => r.code === "LCD"),
    ).toMatchObject({
      opening: 10,
      transfer_in: 0,
      transfer_out: 2,
      closing: 9,
    });
    expect(atBench.body.data).toEqual([
      expect.objectContaining({
        code: "LCD",
        opening: 0,
        transfer_in: 2,
        closing: 2,
      }),
    ]);
  });

  it("closes on the shelf when the period runs to today", async () => {
    const res = await api("get", "/api/reports/movements?from_date=2026-09-10");

    const row = res.body.data.find((r: { code: string }) => r.code === "LCD");
    const stock = await owner.item.findUniqueOrThrow({ where: { id: lcd } });
    expect(row.closing).toBe(stock.currentStock.toNumber());
    expect(row.sale).toBe(4);
  });

  it("narrows to a category, and never shows another workspace's items", async () => {
    await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });

    const res = await api(
      "get",
      `/api/reports/movements?${PERIOD}&category_id=${category}`,
    );
    const all = await api("get", `/api/reports/movements?${PERIOD}`);

    expect(res.body.data.map((row: { code: string }) => row.code)).toEqual([
      "LCD",
    ]);
    expect(
      all.body.data.map((row: { code: string }) => row.code),
    ).not.toContain("B");
  });
});
