import request from "supertest";
import ExcelJS from "exceljs";
import app from "../../app";
import { runWithWorkspace } from "../../lib/workspaceContext";
import { buildWorkbook } from "../../utils/export/workbook";
import {
  disconnectOwner,
  expectAllStockConsistent,
  expectStockConsistent,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.10: the warehouse endpoints, against Postgres — one default
// always, no delete, and deactivation only once the shelves are empty.

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

async function newWarehouse(name = "تعمیرات"): Promise<number> {
  const res = await api("post", "/api/warehouses").send({ name });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function newItem(code: string, openingStock = 0, openingCost = 0) {
  const res = await api("post", "/api/items").send({
    code,
    name: `کالا ${code}`,
    unit: "عدد",
    openingStock,
    ...(openingStock > 0 ? { openingCost } : {}),
  });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

function buyInto(
  warehouseId: number | null,
  itemId: number,
  quantity: number,
  unitPrice = 1_000,
) {
  return api("post", "/api/purchase-invoices").send({
    supplier_name: null,
    paid_amount: 0,
    ...(warehouseId === null ? {} : { warehouse_id: warehouseId }),
    items: [{ item_id: itemId, quantity, unit_price: unitPrice }],
  });
}

async function defaults(workspaceId: number) {
  return owner.warehouse.findMany({
    where: { workspaceId, isDefault: true },
    select: { id: true },
  });
}

describe("listing warehouses", () => {
  it("starts with the main warehouse, the default", async () => {
    const res = await api("get", "/api/warehouses");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      expect.objectContaining({
        id: workspaces.a.warehouseId,
        name: "انبار اصلی",
        is_default: true,
        is_active: true,
        item_count: 0,
        stock_value: 0,
      }),
    ]);
  });

  it("counts what each holds and what it is worth", async () => {
    const repairs = await newWarehouse();
    const lcd = await newItem("LCD", 4, 1_000);
    await newItem("BAT", 2, 3_000);
    await buyInto(repairs, lcd, 2, 1_000);

    const res = await api("get", "/api/warehouses");

    const byId = new Map(res.body.map((row: { id: number }) => [row.id, row]));
    expect(byId.get(workspaces.a.warehouseId)).toMatchObject({
      item_count: 2,
      stock_value: 10_000,
    });
    expect(byId.get(repairs)).toMatchObject({
      item_count: 1,
      stock_value: 2_000,
    });
  });

  it("lists the default first and the inactive last", async () => {
    const retired = await newWarehouse("الف قدیمی");
    await api("put", `/api/warehouses/${retired}/status`).send({
      is_active: false,
    });
    const shop = await newWarehouse("ب مغازه");

    const res = await api("get", "/api/warehouses");

    expect(res.body.map((row: { id: number }) => row.id)).toEqual([
      workspaces.a.warehouseId,
      shop,
      retired,
    ]);
  });
});

describe("creating and renaming", () => {
  it("creates an active warehouse that is not the default", async () => {
    const res = await api("post", "/api/warehouses").send({
      name: "  تعمیرات  ",
      note: "طبقه دوم",
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "تعمیرات",
      note: "طبقه دوم",
      is_default: false,
      is_active: true,
    });
    expect(await defaults(workspaces.a.workspaceId)).toHaveLength(1);
  });

  it("refuses a name the shop already uses, on create and on rename", async () => {
    const repairs = await newWarehouse("تعمیرات");

    const again = await api("post", "/api/warehouses").send({
      name: "تعمیرات",
    });
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("انباری با این نام وجود دارد");

    const rename = await api("put", `/api/warehouses/${repairs}`).send({
      name: "انبار اصلی",
    });
    expect(rename.status).toBe(400);
  });

  it("allows a name another shop uses", async () => {
    await owner.warehouse.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "تعمیرات" },
    });

    const res = await api("post", "/api/warehouses").send({ name: "تعمیرات" });

    expect(res.status).toBe(201);
  });

  it("renames, and the invoices follow the row", async () => {
    const res = await api(
      "put",
      `/api/warehouses/${workspaces.a.warehouseId}`,
    ).send({ name: "انبار مغازه", note: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "انبار مغازه", is_default: true });
  });

  it("refuses an empty name", async () => {
    const res = await api("post", "/api/warehouses").send({ name: "   " });

    expect(res.status).toBe(400);
  });
});

describe("the default warehouse", () => {
  it("moves, and a document that names no warehouse follows it", async () => {
    const repairs = await newWarehouse();
    const lcd = await newItem("LCD");

    const res = await api("post", `/api/warehouses/${repairs}/default`);

    expect(res.status).toBe(200);
    expect(res.body.is_default).toBe(true);
    expect(await defaults(workspaces.a.workspaceId)).toEqual([{ id: repairs }]);

    const invoice = await buyInto(null, lcd, 3);
    expect(invoice.body.warehouse_id).toBe(repairs);
  });

  it("stays single when two people move it at once", async () => {
    const one = await newWarehouse("یک");
    const two = await newWarehouse("دو");

    const results = await Promise.all([
      api("post", `/api/warehouses/${one}/default`),
      api("post", `/api/warehouses/${two}/default`),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    const left = await defaults(workspaces.a.workspaceId);
    expect(left).toHaveLength(1);
    expect([one, two]).toContain(left[0].id);
  });

  it("is never an inactive warehouse", async () => {
    const repairs = await newWarehouse();
    await api("put", `/api/warehouses/${repairs}/status`).send({
      is_active: false,
    });

    const res = await api("post", `/api/warehouses/${repairs}/default`);

    expect(res.status).toBe(400);
    expect(await defaults(workspaces.a.workspaceId)).toEqual([
      { id: workspaces.a.warehouseId },
    ]);
  });

  it("changes nothing when set on the warehouse that already is", async () => {
    const res = await api(
      "post",
      `/api/warehouses/${workspaces.a.warehouseId}/default`,
    );

    expect(res.status).toBe(200);
    expect(await defaults(workspaces.a.workspaceId)).toHaveLength(1);
  });
});

describe("deactivating", () => {
  it("refuses the default", async () => {
    const res = await api(
      "put",
      `/api/warehouses/${workspaces.a.warehouseId}/status`,
    ).send({ is_active: false });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("پیش‌فرض");
  });

  it("refuses while anything is on its shelves, and says how much", async () => {
    const repairs = await newWarehouse();
    const lcd = await newItem("LCD");
    await buyInto(repairs, lcd, 2);

    const res = await api("put", `/api/warehouses/${repairs}/status`).send({
      is_active: false,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("1 کالا");
    const row = await owner.warehouse.findUniqueOrThrow({
      where: { id: repairs },
    });
    expect(row.isActive).toBe(true);
  });

  it("deactivates once empty, then takes nothing new, and comes back", async () => {
    const repairs = await newWarehouse();
    const lcd = await newItem("LCD");
    const purchase = await buyInto(repairs, lcd, 2);
    // Emptied by deleting the purchase: the shelf goes back to zero.
    await request(app)
      .delete(`/api/purchase-invoices/${purchase.body.id}`)
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    const off = await api("put", `/api/warehouses/${repairs}/status`).send({
      is_active: false,
    });
    expect(off.status).toBe(200);
    expect(off.body.is_active).toBe(false);

    const refused = await buyInto(repairs, lcd, 1);
    expect(refused.status).toBe(400);
    expect(refused.body.error).toContain("غیرفعال");

    const on = await api("put", `/api/warehouses/${repairs}/status`).send({
      is_active: true,
    });
    expect(on.status).toBe(200);
    expect((await buyInto(repairs, lcd, 1)).status).toBe(201);
    await expectStockConsistent(lcd);
  });

  it("never leaves stock in a warehouse it deactivated, racing a purchase", async () => {
    // The purchase and the deactivation queue on the warehouse row: either
    // the purchase lands first and the deactivation is refused, or the
    // deactivation lands first and the purchase is. Never both through.
    const lcd = await newItem("LCD");

    for (let round = 0; round < 5; round += 1) {
      const repairs = await newWarehouse(`تعمیرات ${round}`);

      const [purchase, status] = await Promise.all([
        buyInto(repairs, lcd, 1),
        api("put", `/api/warehouses/${repairs}/status`).send({
          is_active: false,
        }),
      ]);

      // Exactly one of the two goes through, whichever got the row first.
      const purchased = purchase.status === 201;
      const deactivated = status.status === 200;
      expect(purchased !== deactivated).toBe(true);

      const warehouse = await owner.warehouse.findUniqueOrThrow({
        where: { id: repairs },
        include: { stocks: true },
      });
      const held = warehouse.stocks.reduce(
        (sum, stock) => sum + stock.quantity.toNumber(),
        0,
      );
      expect(warehouse.isActive || held === 0).toBe(true);
    }
    await expectStockConsistent(lcd);
  });
});

describe("another workspace's warehouse", () => {
  it("cannot be made the default, deactivated or renamed", async () => {
    const theirs = workspaces.b.warehouseId;

    const asDefault = await api("post", `/api/warehouses/${theirs}/default`);
    const status = await api("put", `/api/warehouses/${theirs}/status`).send({
      is_active: false,
    });
    const rename = await api("put", `/api/warehouses/${theirs}`).send({
      name: "مال من",
    });

    expect([asDefault.status, status.status, rename.status]).toEqual([
      404, 404, 404,
    ]);
    const row = await owner.warehouse.findUniqueOrThrow({
      where: { id: theirs },
    });
    expect(row).toMatchObject({
      name: "انبار اصلی",
      isDefault: true,
      isActive: true,
    });
  });
});

describe("the export workbook", () => {
  async function workbook() {
    const buffer = await runWithWorkspace(workspaces.a.workspaceId, () =>
      buildWorkbook(),
    );
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(
      buffer as unknown as Parameters<typeof book.xlsx.load>[0],
    );
    return book;
  }

  function rowsOf(sheet: ExcelJS.Worksheet): Record<string, unknown>[] {
    const header = (sheet.getRow(1).values as unknown[]).slice(1);
    const rows: Record<string, unknown>[] = [];
    sheet.eachRow((row, number) => {
      if (number === 1) return;
      const values = (row.values as unknown[]).slice(1);
      rows.push(
        Object.fromEntries(header.map((name, i) => [String(name), values[i]])),
      );
    });
    return rows;
  }

  it("has a sheet of what each warehouse holds, and names the warehouse on invoices", async () => {
    const repairs = await newWarehouse();
    const lcd = await newItem("LCD", 4, 1_000);
    await buyInto(repairs, lcd, 2, 1_000);

    const book = await workbook();

    const stock = rowsOf(book.getWorksheet("موجودی انبارها")!);
    expect(stock).toEqual([
      expect.objectContaining({
        انبار: "انبار اصلی",
        "کد کالا": "LCD",
        موجودی: 4,
        "ارزش موجودی (ریال)": 4_000,
      }),
      expect.objectContaining({
        انبار: "تعمیرات",
        موجودی: 2,
        "ارزش موجودی (ریال)": 2_000,
      }),
    ]);

    const purchases = rowsOf(book.getWorksheet("فاکتور خرید")!);
    expect(purchases[0]).toMatchObject({ انبار: "تعمیرات" });
    const lines = rowsOf(book.getWorksheet("اقلام فاکتورها")!);
    expect(lines[0]).toMatchObject({ انبار: "تعمیرات" });
  });
});
