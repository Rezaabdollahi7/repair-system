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

// Roadmap 14.16: stock transfers through the API, against Postgres.

let workspaces: TwoWorkspaces;
let main: number;
let bench: number;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  main = workspaces.a.warehouseId;
  bench = (
    await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "میز تعمیر" },
    })
  ).id;
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

/** An item with opening stock at a cost, in the default warehouse. */
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

function transfer(
  from: number,
  to: number,
  lines: { item_id: number; quantity: number; note?: string }[],
  extra: Record<string, unknown> = {},
) {
  return api("post", "/api/stock-transfers").send({
    from_warehouse_id: from,
    to_warehouse_id: to,
    lines,
    ...extra,
  });
}

/** The item's quantity in each warehouse that has ever held it. */
async function shelves(itemId: number): Promise<Record<number, number>> {
  const rows = await owner.itemStock.findMany({ where: { itemId } });
  return Object.fromEntries(
    rows.map((row) => [row.warehouseId, row.quantity.toNumber()]),
  );
}

async function item(id: number) {
  const row = await owner.item.findUniqueOrThrow({ where: { id } });
  return {
    stock: row.currentStock.toNumber(),
    avg: row.avgPurchasePrice.toNumber(),
  };
}

describe("a transfer moves stock and nothing else", () => {
  it("takes from one warehouse and puts into the other, at the average, leaving the item's total alone", async () => {
    const lcd = await stockedItem("LCD", 5, 1_200_000);

    const res = await transfer(main, bench, [{ item_id: lcd, quantity: 2 }], {
      description: "برای تعمیرات امروز",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      number: "TRF-0001",
      from_warehouse_id: main,
      from_warehouse_name: "انبار اصلی",
      to_warehouse_id: bench,
      to_warehouse_name: "میز تعمیر",
      description: "برای تعمیرات امروز",
      line_count: 1,
      value: 2_400_000,
    });
    expect(res.body.lines).toEqual([
      expect.objectContaining({
        item_id: lcd,
        item_code: "LCD",
        quantity: 2,
        unit_cost: 1_200_000,
        value: 2_400_000,
      }),
    ]);
    expect(await shelves(lcd)).toEqual({ [main]: 3, [bench]: 2 });
    expect(await item(lcd)).toEqual({ stock: 5, avg: 1_200_000 });
  });

  it("writes an out and an in that name the transfer, its date and both sides", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const transferredAt = "2026-10-01T08:00:00.000Z";

    const res = await transfer(main, bench, [{ item_id: lcd, quantity: 2 }], {
      transferred_at: transferredAt,
    });

    const rows = await owner.inventoryTransaction.findMany({
      where: { itemId: lcd, referenceType: "stock_transfer" },
      orderBy: { id: "asc" },
    });
    expect(
      rows.map((row) => ({
        type: row.type,
        warehouseId: row.warehouseId,
        quantity: row.quantity.toNumber(),
        before: row.beforeQuantity?.toNumber(),
        after: row.afterQuantity?.toNumber(),
        unitCost: row.unitCost?.toNumber(),
        referenceId: row.referenceId,
        occurredAt: row.occurredAt.toISOString(),
      })),
    ).toEqual([
      {
        type: "transfer_out",
        warehouseId: main,
        quantity: -2,
        before: 5,
        after: 3,
        unitCost: 1_000,
        referenceId: res.body.id,
        occurredAt: transferredAt,
      },
      {
        type: "transfer_in",
        warehouseId: bench,
        quantity: 2,
        before: 0,
        after: 2,
        unitCost: 1_000,
        referenceId: res.body.id,
        occurredAt: transferredAt,
      },
    ]);
  });

  it("moves a fraction of a fractional item, and several items in one document", async () => {
    const wire = await stockedItem("W", 10, 300, {
      unit: "متر",
      isFractional: true,
    });
    const lcd = await stockedItem("LCD", 4, 1_000);

    const res = await transfer(main, bench, [
      { item_id: wire, quantity: 2.5 },
      { item_id: lcd, quantity: 1, note: "برای دستگاه ۱۲" },
    ]);

    expect(res.status).toBe(201);
    expect(res.body.value).toBe(1_750);
    expect(await shelves(wire)).toEqual({ [main]: 7.5, [bench]: 2.5 });
    expect(await shelves(lcd)).toEqual({ [main]: 3, [bench]: 1 });
  });

  it("is undone by a transfer the other way", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);

    await transfer(main, bench, [{ item_id: lcd, quantity: 2 }]);
    const back = await transfer(bench, main, [{ item_id: lcd, quantity: 2 }]);

    expect(back.body.number).toBe("TRF-0002");
    expect(await shelves(lcd)).toEqual({ [main]: 5, [bench]: 0 });
  });

  it("keeps the average where it was even after the destination bought at another price", async () => {
    // The average is per item: 4 at 1,000 and then 4 at 2,000 into the bench
    // is 1,500 for every unit, wherever it sits.
    const lcd = await stockedItem("LCD", 4, 1_000);
    await api("post", "/api/purchase-invoices").send({
      supplier_name: "تأمین‌کننده",
      paid_amount: 0,
      warehouse_id: bench,
      items: [{ item_id: lcd, quantity: 4, unit_price: 2_000 }],
    });

    const res = await transfer(bench, main, [{ item_id: lcd, quantity: 4 }]);

    expect(res.body.lines[0].unit_cost).toBe(1_500);
    expect(await item(lcd)).toEqual({ stock: 8, avg: 1_500 });
  });
});

describe("what a transfer refuses", () => {
  it("refuses more than the source warehouse holds, even when the item's total would cover it", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    await transfer(main, bench, [{ item_id: lcd, quantity: 1 }]);

    const refused = await transfer(bench, main, [
      { item_id: lcd, quantity: 2 },
    ]);

    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain("کالا LCD");
    expect(await shelves(lcd)).toEqual({ [main]: 4, [bench]: 1 });
    // The refused one gave its number back.
    const next = await transfer(bench, main, [{ item_id: lcd, quantity: 1 }]);
    expect(next.body.number).toBe("TRF-0002");
  });

  it("rolls the whole document back when one line cannot move", async () => {
    const lcd = await stockedItem("LCD", 1, 1_000);
    const battery = await stockedItem("BAT", 5, 500);

    const refused = await transfer(main, bench, [
      { item_id: battery, quantity: 2 },
      { item_id: lcd, quantity: 3 },
    ]);

    expect(refused.status).toBe(400);
    expect(await owner.stockTransfer.count()).toBe(0);
    expect(await shelves(battery)).toEqual({ [main]: 5 });
  });

  it("does not let two transfers take the last unit twice", async () => {
    const lcd = await stockedItem("LCD", 1, 1_000);

    const results = await Promise.all([
      transfer(main, bench, [{ item_id: lcd, quantity: 1 }]),
      transfer(main, bench, [{ item_id: lcd, quantity: 1 }]),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect(await shelves(lcd)).toEqual({ [main]: 0, [bench]: 1 });
  });

  it("refuses a warehouse to itself, a missing side and a duplicated item", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);

    const same = await transfer(main, main, [{ item_id: lcd, quantity: 1 }]);
    const noTarget = await api("post", "/api/stock-transfers").send({
      from_warehouse_id: main,
      lines: [{ item_id: lcd, quantity: 1 }],
    });
    const twice = await transfer(main, bench, [
      { item_id: lcd, quantity: 1 },
      { item_id: lcd, quantity: 1 },
    ]);

    expect([same.status, noTarget.status, twice.status]).toEqual([
      400, 400, 400,
    ]);
    expect(same.body.error).toContain("مبدأ و مقصد");
    expect(await owner.stockTransfer.count()).toBe(0);
  });

  it("refuses an inactive destination", async () => {
    const closed = await owner.warehouse.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        name: "بسته",
        isActive: false,
      },
    });
    const lcd = await stockedItem("LCD", 5, 1_000);

    const res = await transfer(main, closed.id, [
      { item_id: lcd, quantity: 1 },
    ]);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("غیرفعال");
    expect(await shelves(lcd)).toEqual({ [main]: 5 });
  });

  it("refuses another workspace's warehouse and another workspace's item", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });

    const warehouse = await transfer(main, workspaces.b.warehouseId, [
      { item_id: lcd, quantity: 1 },
    ]);
    const foreignItem = await transfer(main, bench, [
      { item_id: theirs.id, quantity: 1 },
    ]);

    expect([warehouse.status, foreignItem.status]).toEqual([400, 400]);
    expect(await owner.stockTransfer.count()).toBe(0);
    expect(await shelves(lcd)).toEqual({ [main]: 5 });
  });

  it("refuses a fraction of a whole-number item", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);

    const res = await transfer(main, bench, [{ item_id: lcd, quantity: 0.5 }]);

    expect(res.status).toBe(400);
    expect(await shelves(lcd)).toEqual({ [main]: 5 });
  });

  it("offers no way to edit or delete one", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const created = await transfer(main, bench, [
      { item_id: lcd, quantity: 1 },
    ]);

    const edit = await api(
      "put",
      `/api/stock-transfers/${created.body.id}`,
    ).send({ lines: [{ item_id: lcd, quantity: 3 }] });
    const remove = await api(
      "delete",
      `/api/stock-transfers/${created.body.id}`,
    );

    expect([edit.status, remove.status]).toEqual([404, 404]);
    expect(await shelves(lcd)).toEqual({ [main]: 4, [bench]: 1 });
  });
});

describe("reading transfers", () => {
  it("lists the newest first, and a warehouse's filter finds it on either side", async () => {
    const store = await owner.warehouse.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "انبار پشتی" },
    });
    const lcd = await stockedItem("LCD", 5, 1_000);
    await transfer(main, bench, [{ item_id: lcd, quantity: 2 }], {
      transferred_at: "2026-10-01T08:00:00.000Z",
    });
    await transfer(bench, store.id, [{ item_id: lcd, quantity: 1 }], {
      transferred_at: "2026-10-05T08:00:00.000Z",
    });

    const all = await api("get", "/api/stock-transfers");
    const atBench = await api("get", `/api/stock-transfers?warehouse_id=${bench}`);
    const atStore = await api(
      "get",
      `/api/stock-transfers?warehouse_id=${store.id}`,
    );

    const numbers = (res: request.Response) =>
      res.body.data.map((row: { number: string }) => row.number);
    expect(numbers(all)).toEqual(["TRF-0002", "TRF-0001"]);
    expect(numbers(atBench)).toEqual(["TRF-0002", "TRF-0001"]);
    expect(numbers(atStore)).toEqual(["TRF-0002"]);
  });

  it("shows one with its lines, and 404s for another workspace's", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    const created = await transfer(main, bench, [
      { item_id: lcd, quantity: 1, note: "قفسه‌ی بالا" },
    ]);

    const mine = await api("get", `/api/stock-transfers/${created.body.id}`);
    expect(mine.status).toBe(200);
    expect(mine.body.lines[0]).toMatchObject({
      item_name: "کالا LCD",
      item_unit: "عدد",
      note: "قفسه‌ی بالا",
    });

    const theirs = await request(app)
      .get(`/api/stock-transfers/${created.body.id}`)
      .set("Authorization", `Bearer ${workspaces.b.token}`);
    expect(theirs.status).toBe(404);
  });
});

describe("the export workbook", () => {
  it("has a sheet of transfer lines, with both warehouses", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000);
    await transfer(main, bench, [{ item_id: lcd, quantity: 2 }]);

    const buffer = await runWithWorkspace(workspaces.a.workspaceId, () =>
      buildWorkbook(),
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    const sheet = book.getWorksheet("انتقال بین انبارها")!;
    const values = (sheet.getRow(2).values as unknown[]).slice(1);

    expect(values).toEqual([
      "TRF-0001",
      expect.any(String),
      "انبار اصلی",
      "میز تعمیر",
      "LCD",
      "کالا LCD",
      2,
      "عدد",
      1_000,
      2_000,
      "",
    ]);
  });
});
