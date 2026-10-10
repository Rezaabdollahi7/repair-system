import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  expectAllStockConsistent,
  owner,
  seedDevice,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// An item entered by mistake, against Postgres: it can be deleted while no
// document names it, and every field it was created with — its opening
// balance included — can be corrected. Reported by a workshop that typed
// ۱۰۰ میلیون for ۱۰ and could do neither.

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

// Every correction goes through the stock service; none may leave the
// ledger and the stock disagreeing anywhere.
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

async function createItem(
  openingStock: number,
  openingCost: number | null,
  extra: Record<string, unknown> = {},
): Promise<number> {
  const res = await api("post", "/api/items").send({
    code: `C-${Math.random().toString(36).slice(2, 8)}`,
    name: "باتری A10",
    unit: "عدد",
    sell_price: 2_000_000,
    openingStock,
    openingCost,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function itemOf(id: number) {
  const item = await owner.item.findUniqueOrThrow({ where: { id } });
  return {
    stock: item.currentStock.toNumber(),
    avg: item.avgPurchasePrice.toNumber(),
  };
}

describe("DELETE /api/items/:id", () => {
  it("deletes an item that only has its opening stock, with its stock and ledger", async () => {
    const id = await createItem(10, 100_000_000);

    const res = await api("delete", `/api/items/${id}`);

    expect(res.status).toBe(200);
    expect(await owner.item.count({ where: { id } })).toBe(0);
    expect(await owner.itemStock.count({ where: { itemId: id } })).toBe(0);
    expect(
      await owner.inventoryTransaction.count({ where: { itemId: id } }),
    ).toBe(0);
  });

  it("deletes an item whose opening has been corrected", async () => {
    const id = await createItem(10, 100_000_000);
    await api("put", `/api/items/${id}`).send({
      openingStock: 10,
      openingCost: 10_000_000,
    });

    const res = await api("delete", `/api/items/${id}`);

    expect(res.status).toBe(200);
  });

  it("refuses an item on a sale invoice and says so", async () => {
    const id = await createItem(10, 1000);
    const sale = await api("post", "/api/sale-invoices").send({
      items: [
        {
          item_type: "inventory",
          item_id: id,
          name: "باتری",
          quantity: 1,
          unit_price: 2000,
        },
      ],
      paid_amount: 0,
    });
    expect(sale.status).toBe(201);

    const res = await api("delete", `/api/items/${id}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("۱ فاکتور فروش");
    expect(await owner.item.count({ where: { id } })).toBe(1);
  });

  it("refuses an item on a پیش‌فاکتور, which has moved no stock", async () => {
    const id = await createItem(0, null);
    const device = await seedDevice(workspaces.a.workspaceId, {
      deviceName: "Galaxy A54",
    });
    const repair = await api("post", "/api/repair-invoices").send({
      device_id: device.id,
      items: [
        {
          item_type: "inventory",
          item_id: id,
          name: "باتری",
          quantity: 1,
          unit_price: 2000,
        },
      ],
    });
    expect(repair.status).toBe(201);

    const res = await api("delete", `/api/items/${id}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("۱ فاکتور تعمیر");
  });

  it("cannot delete another workspace's item", async () => {
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });

    const res = await api("delete", `/api/items/${theirs.id}`);

    expect(res.status).toBe(404);
    expect(await owner.item.count({ where: { id: theirs.id } })).toBe(1);
  });
});

describe("PUT /api/items/:id — the opening balance", () => {
  it("corrects a mistyped cost exactly, keeping both rows on the kardex", async () => {
    const id = await createItem(10, 100_000_000);

    const res = await api("put", `/api/items/${id}`).send({
      openingStock: 10,
      openingCost: 10_000_000,
    });

    expect(res.status).toBe(200);
    expect(await itemOf(id)).toEqual({ stock: 10, avg: 10_000_000 });

    const rows = await owner.inventoryTransaction.findMany({
      where: { itemId: id },
      orderBy: { id: "asc" },
    });
    expect(rows.map((row) => [row.type, row.quantity.toNumber()])).toEqual([
      ["opening", 10],
      ["opening", 10],
      ["reversal", -10],
    ]);
    // Dated with the opening it corrects, not with today's click.
    expect(rows[2].occurredAt.toISOString()).toBe(
      rows[0].occurredAt.toISOString(),
    );
  });

  it("answers the edit form with the corrected opening", async () => {
    const id = await createItem(10, 100_000_000);
    await api("put", `/api/items/${id}`).send({
      openingStock: 8,
      openingCost: 10_000_000,
    });

    const res = await api("get", `/api/items/${id}`);

    expect(res.body.opening).toEqual({
      quantity: 8,
      unitCost: 10_000_000,
      warehouseId: workspaces.a.warehouseId,
    });
  });

  it("corrects the cost after some was sold, landing on the corrected average", async () => {
    // Ten opened at ۱۰۰ میلیون, three sold. The seven left are worth ۱۰
    // میلیون each once corrected; taking the whole old value back out
    // would have left them valued at nothing.
    const id = await createItem(10, 100_000_000);
    const sale = await api("post", `/api/items/${id}/quick-sale`).send({
      quantity: 3,
    });
    expect(sale.status).toBe(200);

    const res = await api("put", `/api/items/${id}`).send({
      openingStock: 10,
      openingCost: 10_000_000,
    });

    expect(res.status).toBe(200);
    const after = await itemOf(id);
    expect(after.stock).toBe(7);
    expect(after.avg).toBeCloseTo(10_000_000, 0);
  });

  it("corrects the quantity", async () => {
    const id = await createItem(10, 1000);

    await api("put", `/api/items/${id}`).send({
      openingStock: 4,
      openingCost: 1000,
    });

    expect(await itemOf(id)).toEqual({ stock: 4, avg: 1000 });
  });

  it("adds an opening to an item created without one", async () => {
    const id = await createItem(0, null);

    const res = await api("put", `/api/items/${id}`).send({
      openingStock: 5,
      openingCost: 2000,
    });

    expect(res.status).toBe(200);
    expect(await itemOf(id)).toEqual({ stock: 5, avg: 2000 });
  });

  it("refuses to take back opening stock that has already been sold, and explains", async () => {
    const id = await createItem(10, 1000);
    await api("post", `/api/items/${id}/quick-sale`).send({ quantity: 8 });

    const res = await api("put", `/api/items/${id}`).send({
      openingStock: 0,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("بخشی از موجودی اولیه");
    expect(await itemOf(id)).toEqual({ stock: 2, avg: 1000 });
  });

  it("saves nothing at all when the correction is refused", async () => {
    const id = await createItem(10, 1000);
    await api("post", `/api/items/${id}/quick-sale`).send({ quantity: 8 });

    await api("put", `/api/items/${id}`).send({
      name: "نام تازه",
      openingStock: 0,
    });

    const item = await owner.item.findUniqueOrThrow({ where: { id } });
    expect(item.name).toBe("باتری A10");
  });

  it("asks for a cost whenever there is opening stock", async () => {
    const id = await createItem(0, null);

    const res = await api("put", `/api/items/${id}`).send({ openingStock: 5 });

    expect(res.status).toBe(400);
  });

  it("moves nothing when the form sends the opening back unchanged", async () => {
    const id = await createItem(10, 1000);

    await api("put", `/api/items/${id}`).send({
      name: "باتری A20",
      openingStock: 10,
      openingCost: 1000,
    });

    expect(
      await owner.inventoryTransaction.count({ where: { itemId: id } }),
    ).toBe(1);
  });
});
