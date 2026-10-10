import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../app";
import { runWithWorkspace } from "../../lib/workspaceContext";
import { buildWorkbook } from "../../utils/export/workbook";
import {
  disconnectOwner,
  expectAllStockConsistent,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.14: stock adjustments through the API, against Postgres.

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

function api(method: "get" | "post" | "put" | "delete", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

/** An item with opening stock at a cost, through the item API. */
async function stockedItem(
  code: string,
  quantity: number,
  cost: number,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    ...(quantity > 0 ? { openingStock: quantity, openingCost: cost } : {}),
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

function adjust(lines: unknown[], extra: Record<string, unknown> = {}) {
  return api("post", "/api/stock-adjustments").send({ lines, ...extra });
}

function line(
  itemId: number,
  direction: "in" | "out",
  quantity: number,
  reason: string,
  extra: Record<string, unknown> = {},
) {
  return { item_id: itemId, direction, quantity, reason, ...extra };
}

async function item(id: number) {
  const row = await owner.item.findUniqueOrThrow({ where: { id } });
  return {
    stock: row.currentStock.toNumber(),
    avg: row.avgPurchasePrice.toNumber(),
  };
}

describe("an adjustment is applied when it is saved", () => {
  it("takes a damaged part off the shelf at its average cost", async () => {
    const lcd = await stockedItem("LCD", 5, 1_200_000);

    const res = await adjust(
      [line(lcd, "out", 1, "damage", { note: "شکست موقع نصب" })],
      { description: "بازبینی هفتگی" },
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      number: "ADJ-0001",
      warehouse_id: workspaces.a.warehouseId,
      warehouse_name: "انبار اصلی",
      description: "بازبینی هفتگی",
      line_count: 1,
      value_in: 0,
      value_out: 1_200_000,
    });
    expect(res.body.lines).toEqual([
      expect.objectContaining({
        item_id: lcd,
        quantity: -1,
        reason: "damage",
        note: "شکست موقع نصب",
        unit_cost: 1_200_000,
        value: -1_200_000,
      }),
    ]);
    expect(await item(lcd)).toEqual({ stock: 4, avg: 1_200_000 });
  });

  it("writes a ledger row that names the adjustment, the reason and the date", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const adjustedAt = "2026-10-01T08:00:00.000Z";

    const res = await adjust([line(lcd, "out", 2, "loss")], {
      adjusted_at: adjustedAt,
      description: "انبارگردانی ماهانه",
    });

    const row = await owner.inventoryTransaction.findFirstOrThrow({
      where: { itemId: lcd, type: "adjustment" },
    });
    expect(row).toMatchObject({
      reason: "loss",
      referenceType: "stock_adjustment",
      referenceId: res.body.id,
      warehouseId: workspaces.a.warehouseId,
      createdBy: workspaces.a.userId,
      // With no note on the line, the document's description explains it.
      note: "انبارگردانی ماهانه",
    });
    expect(row.quantity.toNumber()).toBe(-2);
    expect(row.occurredAt.toISOString()).toBe(adjustedAt);
    expect(row.beforeQuantity?.toNumber()).toBe(5);
    expect(row.afterQuantity?.toNumber()).toBe(3);
  });

  it("puts a found part back without moving the average when no cost is given", async () => {
    const lcd = await stockedItem("LCD", 4, 1_000);

    const res = await adjust([line(lcd, "in", 1, "found")]);

    expect(res.status).toBe(201);
    expect(res.body.lines[0].unit_cost).toBe(1_000);
    expect(await item(lcd)).toEqual({ stock: 5, avg: 1_000 });
  });

  it("pulls the average when stock comes in with a cost of its own", async () => {
    // Four at 1,000 plus four at 2,000 average 1,500.
    const lcd = await stockedItem("LCD", 4, 1_000);

    await adjust([
      line(lcd, "in", 4, "entry_error", {
        note: "فاکتور خرید ثبت نشده بود",
        unit_cost: 2_000,
      }),
    ]);

    expect(await item(lcd)).toEqual({ stock: 8, avg: 1_500 });
  });

  it("moves several items in one document, each its own way", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const wire = await stockedItem("W", 10, 300, {
      unit: "متر",
      isFractional: true,
    });

    const res = await adjust([
      line(lcd, "out", 1, "internal_use"),
      line(wire, "in", 0.75, "return_from_use"),
    ]);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ value_out: 1_000, value_in: 225 });
    expect((await item(lcd)).stock).toBe(4);
    expect((await item(wire)).stock).toBe(10.75);
  });

  it("files the adjustment in the warehouse it names", async () => {
    const repairs = await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "تعمیرات" },
    });
    const lcd = await stockedItem("LCD", 0, 0);

    const res = await adjust([line(lcd, "in", 3, "found")], {
      warehouse_id: repairs.id,
    });

    expect(res.body.warehouse_name).toBe("تعمیرات");
    const stocks = await owner.itemStock.findMany({ where: { itemId: lcd } });
    expect(stocks.map((s) => [s.warehouseId, s.quantity.toNumber()])).toEqual([
      [repairs.id, 3],
    ]);
  });
});

describe("what an adjustment refuses", () => {
  it("refuses to take more than the shelf holds, keeps nothing, and burns no number", async () => {
    const lcd = await stockedItem("LCD", 1, 1_000);
    const battery = await stockedItem("BAT", 5, 500);

    const refused = await adjust([
      line(battery, "out", 1, "damage"),
      line(lcd, "out", 2, "loss"),
    ]);

    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain("کالا LCD");
    expect(await owner.stockAdjustment.count()).toBe(0);
    // The battery line was fine, and is rolled back with the rest.
    expect((await item(battery)).stock).toBe(5);

    const next = await adjust([line(lcd, "out", 1, "loss")]);
    expect(next.body.number).toBe("ADJ-0001");
  });

  it("numbers adjustments one after another", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);

    const first = await adjust([line(lcd, "out", 1, "damage")]);
    const second = await adjust([line(lcd, "out", 1, "damage")]);

    expect([first.body.number, second.body.number]).toEqual([
      "ADJ-0001",
      "ADJ-0002",
    ]);
  });

  it("does not let two adjustments take the last unit twice", async () => {
    const lcd = await stockedItem("LCD", 1, 1_000);

    const results = await Promise.all([
      adjust([line(lcd, "out", 1, "damage")]),
      adjust([line(lcd, "out", 1, "loss")]),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await item(lcd)).stock).toBe(0);
  });

  it("refuses a fraction of a whole-number item", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);

    const res = await adjust([line(lcd, "out", 0.5, "damage")]);

    expect(res.status).toBe(400);
    expect((await item(lcd)).stock).toBe(5);
  });

  it("refuses another workspace's item and another workspace's warehouse", async () => {
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });
    const mine = await stockedItem("LCD", 5, 1_000);

    const item = await adjust([line(theirs.id, "in", 1, "found")]);
    const warehouse = await adjust([line(mine, "in", 1, "found")], {
      warehouse_id: workspaces.b.warehouseId,
    });

    expect([item.status, warehouse.status]).toEqual([400, 400]);
    expect(await owner.stockAdjustment.count()).toBe(0);
    expect(
      await owner.inventoryTransaction.count({ where: { itemId: theirs.id } }),
    ).toBe(0);
  });

  it("refuses an inactive warehouse", async () => {
    const closed = await owner.warehouse.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        name: "بسته",
        isActive: false,
      },
    });
    const lcd = await stockedItem("LCD", 0, 0);

    const res = await adjust([line(lcd, "in", 1, "found")], {
      warehouse_id: closed.id,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("غیرفعال");
  });

  it("refuses a reason that points the other way, and «سایر» without a note", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);

    const wrongWay = await adjust([line(lcd, "in", 1, "damage")]);
    const bareOther = await adjust([line(lcd, "out", 1, "other")]);
    const countReason = await adjust([line(lcd, "out", 1, "count")]);

    expect(wrongWay.status).toBe(400);
    expect(bareOther.status).toBe(400);
    expect(countReason.status).toBe(400);
    expect((await item(lcd)).stock).toBe(5);
  });

  it("offers no way to edit or delete one", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const created = await adjust([line(lcd, "out", 1, "damage")]);

    const edit = await api(
      "put",
      `/api/stock-adjustments/${created.body.id}`,
    ).send({
      lines: [line(lcd, "out", 3, "damage")],
    });
    const remove = await api(
      "delete",
      `/api/stock-adjustments/${created.body.id}`,
    );

    expect([edit.status, remove.status]).toEqual([404, 404]);
    expect((await item(lcd)).stock).toBe(4);
  });
});

describe("reading adjustments", () => {
  it("lists the newest first and filters by warehouse", async () => {
    const repairs = await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "تعمیرات" },
    });
    const lcd = await stockedItem("LCD", 5, 1_000);
    await adjust([line(lcd, "out", 1, "damage")], {
      adjusted_at: "2026-10-01T08:00:00.000Z",
    });
    await adjust([line(lcd, "in", 2, "found")], {
      adjusted_at: "2026-10-05T08:00:00.000Z",
      warehouse_id: repairs.id,
    });

    const all = await api("get", "/api/stock-adjustments");
    const filtered = await api(
      "get",
      `/api/stock-adjustments?warehouse_id=${repairs.id}`,
    );

    expect(all.body.data.map((row: { number: string }) => row.number)).toEqual([
      "ADJ-0002",
      "ADJ-0001",
    ]);
    expect(all.body.total).toBe(2);
    expect(filtered.body.data).toEqual([
      expect.objectContaining({
        number: "ADJ-0002",
        warehouse_name: "تعمیرات",
      }),
    ]);
  });

  it("shows one with its lines, and 404s for another workspace's", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const created = await adjust([line(lcd, "out", 1, "damage")]);

    const mine = await api("get", `/api/stock-adjustments/${created.body.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.lines[0]).toMatchObject({
      item_code: "LCD",
      item_name: "کالا LCD",
      item_unit: "عدد",
    });

    const theirs = await request(app)
      .get(`/api/stock-adjustments/${created.body.id}`)
      .set("Authorization", `Bearer ${workspaces.b.token}`);
    expect(theirs.status).toBe(404);
  });
});

describe("the export workbook", () => {
  it("has a sheet of adjustment lines, signed, with the reason in Persian", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    await adjust([line(lcd, "out", 2, "damage", { note: "شکست" })]);

    const buffer = await runWithWorkspace(workspaces.a.workspaceId, () =>
      buildWorkbook(),
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    const sheet = book.getWorksheet("اصلاح موجودی")!;
    const values = (sheet.getRow(2).values as unknown[]).slice(1);

    expect(values).toEqual([
      "ADJ-0001",
      expect.any(String),
      "انبار اصلی",
      "LCD",
      "کالا LCD",
      -2,
      "عدد",
      "خرابی",
      "شکست",
      1_000,
      -2_000,
    ]);
  });
});
