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

// Roadmap 14.15: stock counts through the API, against Postgres.

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

function api(
  method: "get" | "post" | "put" | "delete",
  path: string,
  side: "a" | "b" = "a",
) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces[side].token}`);
}

async function newItem(
  code: string,
  stock: number,
  cost = 1_000,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    sell_price: 5_000,
    ...(stock > 0 ? { openingStock: stock, openingCost: cost } : {}),
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function openCount(body: Record<string, unknown> = {}) {
  const res = await api("post", "/api/stock-counts").send(body);
  expect(res.status).toBe(201);
  return res.body as {
    id: number;
    number: string;
    lines: { id: number; item_id: number }[];
  };
}

function lineFor(
  count: { lines: { id: number; item_id: number }[] },
  itemId: number,
) {
  return count.lines.find((line) => line.item_id === itemId)!.id;
}

function countLine(
  countId: number,
  lineId: number,
  counted: number | null,
  note?: string,
) {
  return api("put", `/api/stock-counts/${countId}/lines/${lineId}`).send({
    counted_quantity: counted,
    ...(note ? { note } : {}),
  });
}

function sell(itemId: number, quantity: number) {
  return api("post", "/api/sale-invoices").send({
    customer_name: "مشتری",
    paid_amount: 0,
    items: [
      { item_type: "inventory", item_id: itemId, quantity, unit_price: 5_000 },
    ],
  });
}

async function stockOf(itemId: number) {
  const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
  return item.currentStock.toNumber();
}

describe("opening a count", () => {
  it("lists every active item, numbered CNT-0001, nothing counted yet", async () => {
    const lcd = await newItem("LCD", 5);
    const battery = await newItem("BAT", 0);
    const retired = await newItem("OLD", 0);
    await owner.item.update({
      where: { id: retired },
      data: { isActive: false },
    });

    const count = await openCount({ description: "شمارش مهر" });

    expect(count).toMatchObject({
      number: "CNT-0001",
      status: "draft",
      blind: false,
      warehouse_name: "انبار اصلی",
      line_count: 2,
      counted_count: 0,
    });
    expect(count.lines.map((l) => l.item_id).sort()).toEqual(
      [lcd, battery].sort(),
    );
    expect(count.lines[0]).toMatchObject({
      counted_quantity: null,
      difference: null,
    });
  });

  it("scopes a partial count to one category", async () => {
    const parts = await owner.category.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "قطعات" },
    });
    const lcd = await newItem("LCD", 5, 1_000, { categoryId: parts.id });
    await newItem("CASE", 3);

    const count = await openCount({ category_id: parts.id });

    expect(count.lines.map((l) => l.item_id)).toEqual([lcd]);
    expect(count).toMatchObject({ category_name: "قطعات" });
  });

  it("refuses an empty scope and another workspace's category", async () => {
    const empty = await owner.category.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "خالی" },
    });
    const theirs = await owner.category.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب" },
    });
    await newItem("LCD", 5);

    const scopeless = await api("post", "/api/stock-counts").send({
      category_id: empty.id,
    });
    const foreign = await api("post", "/api/stock-counts").send({
      category_id: theirs.id,
    });

    expect([scopeless.status, foreign.status]).toEqual([400, 400]);
    expect(await owner.stockCount.count()).toBe(0);
  });
});

describe("counting a line", () => {
  it("records what the system said at that moment", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();

    const res = await countLine(
      count.id,
      lineFor(count, lcd),
      4,
      "یکی در جعبه نبود",
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      counted_quantity: 4,
      expected_quantity: 5,
      difference: -1,
      note: "یکی در جعبه نبود",
    });
    expect(res.body.counted_at).not.toBeNull();
    const line = await owner.stockCountLine.findUniqueOrThrow({
      where: { id: lineFor(count, lcd) },
    });
    expect(line.systemQuantity?.toNumber()).toBe(5);
    // Counting moves nothing until the count is applied.
    expect(await stockOf(lcd)).toBe(5);
  });

  it("hides what the system expects while a blind count is counted", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount({ blind: true });

    const saved = await countLine(count.id, lineFor(count, lcd), 4);
    const read = await api("get", `/api/stock-counts/${count.id}`);

    expect(saved.body).toMatchObject({
      counted_quantity: 4,
      expected_quantity: null,
      difference: null,
    });
    // Not anywhere in the payload either: the network tab shows nothing.
    expect(JSON.stringify(read.body.lines)).not.toMatch(
      /"expected_quantity":5/,
    );
    expect(read.body.lines[0]).toMatchObject({
      expected_quantity: null,
      difference: null,
    });
  });

  it("takes a fraction only of a fractional item, and never a negative", async () => {
    const lcd = await newItem("LCD", 5);
    const wire = await newItem("W", 10, 300, {
      unit: "متر",
      isFractional: true,
    });
    const count = await openCount();

    const half = await countLine(count.id, lineFor(count, lcd), 4.5);
    const wireHalf = await countLine(count.id, lineFor(count, wire), 9.75);
    const negative = await countLine(count.id, lineFor(count, lcd), -1);

    expect([half.status, wireHalf.status, negative.status]).toEqual([
      400, 200, 400,
    ]);
  });

  it("clears a count entered by mistake", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 4);

    const res = await countLine(count.id, lineFor(count, lcd), null);

    expect(res.body).toMatchObject({
      counted_quantity: null,
      counted_at: null,
    });
  });

  it("adds an item the scope left out, once", async () => {
    const parts = await owner.category.create({
      data: { workspaceId: workspaces.a.workspaceId, name: "قطعات" },
    });
    await newItem("LCD", 5, 1_000, { categoryId: parts.id });
    const stray = await newItem("CASE", 2);
    const count = await openCount({ category_id: parts.id });

    const added = await api("post", `/api/stock-counts/${count.id}/lines`).send(
      {
        item_id: stray,
      },
    );
    const again = await api("post", `/api/stock-counts/${count.id}/lines`).send(
      {
        item_id: stray,
      },
    );

    expect(added.status).toBe(201);
    expect(added.body).toMatchObject({
      item_id: stray,
      counted_quantity: null,
    });
    expect(again.status).toBe(400);
  });

  it("refuses another workspace's count and line", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();

    const read = await api("get", `/api/stock-counts/${count.id}`, "b");
    const write = await api(
      "put",
      `/api/stock-counts/${count.id}/lines/${lineFor(count, lcd)}`,
      "b",
    ).send({ counted_quantity: 0 });

    expect([read.status, write.status]).toEqual([404, 404]);
  });
});

describe("reviewing and applying", () => {
  it("posts each difference as a count movement and leaves matching lines alone", async () => {
    const lcd = await newItem("LCD", 5, 1_200);
    const battery = await newItem("BAT", 3, 500);
    const wire = await newItem("W", 10, 300, {
      unit: "متر",
      isFractional: true,
    });
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 4);
    await countLine(count.id, lineFor(count, battery), 3);
    await countLine(count.id, lineFor(count, wire), 10.5);

    const review = await api("get", `/api/stock-counts/${count.id}/review`);
    expect(review.body.summary).toMatchObject({
      counted_count: 3,
      uncounted_count: 0,
      matching_count: 1,
      surplus_count: 1,
      shortage_count: 1,
      surplus_value: 150,
      shortage_value: 1_200,
      moved_count: 0,
    });

    const res = await api("post", `/api/stock-counts/${count.id}/apply`).send(
      {},
    );

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("applied");
    expect(await stockOf(lcd)).toBe(4);
    expect(await stockOf(battery)).toBe(3);
    expect(await stockOf(wire)).toBe(10.5);

    const rows = await owner.inventoryTransaction.findMany({
      where: { type: "count" },
      orderBy: { itemId: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      reason: "count",
      referenceType: "stock_count",
      referenceId: count.id,
      note: "انبارگردانی CNT-0001",
    });
    const lcdLine = res.body.lines.find(
      (l: { item_id: number }) => l.item_id === lcd,
    );
    expect(lcdLine).toMatchObject({ applied_quantity: -1, unit_cost: 1_200 });
  });

  it("applies counted − snapshot, so a sale after counting is kept, after a warning", async () => {
    // Ten on the system; the shelf has eight. A sale of one happens after the
    // shelf was counted: the shortage is still two, and the result seven.
    const lcd = await newItem("LCD", 10);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 8);
    expect((await sell(lcd, 1)).status).toBe(201);

    const review = await api("get", `/api/stock-counts/${count.id}/review`);
    expect(review.body.lines[0]).toMatchObject({
      difference: -2,
      current_quantity: 9,
      moved_since: true,
    });

    const warned = await api(
      "post",
      `/api/stock-counts/${count.id}/apply`,
    ).send({});
    expect(warned.status).toBe(409);
    expect(warned.body.moved).toEqual([
      expect.objectContaining({ item_id: lcd }),
    ]);
    expect(await stockOf(lcd)).toBe(9);

    const applied = await api(
      "post",
      `/api/stock-counts/${count.id}/apply`,
    ).send({
      acknowledge_moved: true,
    });
    expect(applied.status).toBe(200);
    expect(await stockOf(lcd)).toBe(7);
  });

  it("does not warn about a sale made before the line was counted", async () => {
    const lcd = await newItem("LCD", 10);
    const count = await openCount();
    await sell(lcd, 1);
    await countLine(count.id, lineFor(count, lcd), 9);

    const review = await api("get", `/api/stock-counts/${count.id}/review`);

    expect(review.body.lines[0]).toMatchObject({
      difference: 0,
      moved_since: false,
    });
  });

  it("shows a blind count's differences in the review, where they are compared", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount({ blind: true });
    await countLine(count.id, lineFor(count, lcd), 3);

    const review = await api("get", `/api/stock-counts/${count.id}/review`);

    expect(review.body.lines[0]).toMatchObject({
      system_quantity: 5,
      difference: -2,
    });
  });

  it("ignores lines nobody counted", async () => {
    const lcd = await newItem("LCD", 5);
    const battery = await newItem("BAT", 3);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 4);

    await api("post", `/api/stock-counts/${count.id}/apply`).send({});

    expect(await stockOf(battery)).toBe(3);
  });

  it("refuses to apply a count with nothing counted", async () => {
    await newItem("LCD", 5);
    const count = await openCount();

    const res = await api("post", `/api/stock-counts/${count.id}/apply`).send(
      {},
    );

    expect(res.status).toBe(400);
  });

  it("refuses a shortage the shelf can no longer cover, and stays a draft", async () => {
    // Counted none of five; all five sold since. The −5 would go below zero.
    const lcd = await newItem("LCD", 5);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 0);
    await sell(lcd, 5);

    const res = await api("post", `/api/stock-counts/${count.id}/apply`).send({
      acknowledge_moved: true,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("دوباره بشمارید");
    const stored = await owner.stockCount.findUniqueOrThrow({
      where: { id: count.id },
    });
    expect(stored.status).toBe("draft");
  });

  it("applies once when applied twice at the same moment", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 3);

    const results = await Promise.all([
      api("post", `/api/stock-counts/${count.id}/apply`).send({}),
      api("post", `/api/stock-counts/${count.id}/apply`).send({}),
    ]);

    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(await stockOf(lcd)).toBe(3);
  });

  it("is closed once applied", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 3);
    await api("post", `/api/stock-counts/${count.id}/apply`).send({});

    const recount = await countLine(count.id, lineFor(count, lcd), 2);
    const cancel = await api("post", `/api/stock-counts/${count.id}/cancel`);

    expect([recount.status, cancel.status]).toEqual([400, 400]);
    expect(await stockOf(lcd)).toBe(3);
  });
});

describe("cancelling", () => {
  it("abandons a draft, which then takes no counts and applies nothing", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 3);

    const res = await api("post", `/api/stock-counts/${count.id}/cancel`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("cancelled");

    const apply = await api("post", `/api/stock-counts/${count.id}/apply`).send(
      {},
    );
    const recount = await countLine(count.id, lineFor(count, lcd), 2);
    expect([apply.status, recount.status]).toEqual([400, 400]);
    expect(await stockOf(lcd)).toBe(5);
  });

  it("offers no delete", async () => {
    await newItem("LCD", 5);
    const count = await openCount();

    const res = await api("delete", `/api/stock-counts/${count.id}`);

    expect(res.status).toBe(404);
    expect(await owner.stockCount.count()).toBe(1);
  });
});

describe("listing", () => {
  it("shows the newest first, with progress, and filters by status", async () => {
    const lcd = await newItem("LCD", 5);
    await newItem("BAT", 3);
    const first = await openCount();
    await countLine(first.id, lineFor(first, lcd), 5);
    await api("post", `/api/stock-counts/${first.id}/apply`).send({});
    await openCount({ blind: true });

    const all = await api("get", "/api/stock-counts");
    const drafts = await api("get", "/api/stock-counts?status=draft");

    expect(
      all.body.data.map((c: { number: string; counted_count: number }) => [
        c.number,
        c.counted_count,
      ]),
    ).toEqual([
      ["CNT-0002", 0],
      ["CNT-0001", 1],
    ]);
    expect(drafts.body.data.map((c: { number: string }) => c.number)).toEqual([
      "CNT-0002",
    ]);
  });
});

describe("the export workbook", () => {
  it("has a sheet of counted lines with their difference", async () => {
    const lcd = await newItem("LCD", 5);
    const count = await openCount();
    await countLine(count.id, lineFor(count, lcd), 4, "یکی کم بود");

    const buffer = await runWithWorkspace(workspaces.a.workspaceId, () =>
      buildWorkbook(),
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    const values = (
      book.getWorksheet("انبارگردانی")!.getRow(2).values as unknown[]
    ).slice(1);

    expect(values).toEqual([
      "CNT-0001",
      "در حال شمارش",
      "انبار اصلی",
      "LCD",
      "کالا LCD",
      "عدد",
      5,
      4,
      -1,
      expect.any(String),
      "یکی کم بود",
    ]);
  });
});
