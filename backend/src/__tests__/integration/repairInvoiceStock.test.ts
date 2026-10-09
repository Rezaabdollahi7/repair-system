import request from "supertest";
import app from "../../app";
import {
  disconnectOwner,
  expectAllStockConsistent,
  expectStockConsistent,
  owner,
  seedDevice,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// Roadmap 14.7: a repair invoice through the API, against Postgres. Its
// parts leave the shelf exactly once — whichever way it leaves پیش‌فاکتور —
// and come back exactly once, at the cost they left at.

let workspaces: TwoWorkspaces;
let deviceId: number;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  const device = await seedDevice(workspaces.a.workspaceId, {
    deviceName: "Galaxy A54",
  });
  deviceId = device.id;
});

// Every item in the database, after every test: a scenario cannot leave
// stock inconsistent anywhere, even on an item it never checks (14.12).
afterEach(async () => {
  await expectAllStockConsistent();
});

afterAll(async () => {
  await disconnectOwner();
});

function api(method: "post" | "put" | "delete", path: string) {
  return request(app)
    [method](path)
    .set("Authorization", `Bearer ${workspaces.a.token}`);
}

async function stockedItem(
  code: string,
  quantity: number,
  unitPrice: number,
  options: { isFractional?: boolean; sellPrice?: number } = {},
): Promise<number> {
  const item = await owner.item.create({
    data: {
      workspaceId: workspaces.a.workspaceId,
      name: `قطعه ${code}`,
      code,
      isFractional: options.isFractional ?? false,
      sellPrice: options.sellPrice ?? 0,
    },
  });
  if (quantity > 0) {
    const res = await api("post", "/api/purchase-invoices").send({
      supplier_name: null,
      paid_amount: 0,
      items: [{ item_id: item.id, quantity, unit_price: unitPrice }],
    });
    expect(res.status).toBe(201);
  }
  return item.id;
}

function partLine(itemId: number, quantity: number, unitPrice = 50000) {
  return {
    item_type: "inventory",
    item_id: itemId,
    name: "قطعه",
    quantity,
    unit_price: unitPrice,
  };
}

async function draft(items: unknown[]): Promise<number> {
  const res = await api("post", "/api/repair-invoices").send({
    device_id: deviceId,
    items,
  });
  expect(res.status).toBe(201);
  return res.body.id;
}

function setStatus(id: number, status: string) {
  return api("put", `/api/repair-invoices/${id}/status`).send({ status });
}

async function stockOf(itemId: number) {
  const item = await owner.item.findUniqueOrThrow({ where: { id: itemId } });
  return item.currentStock.toNumber();
}

describe("a پیش‌فاکتور", () => {
  it("takes nothing from the shelf", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);

    await draft([partLine(lcd, 1)]);

    expect(await stockOf(lcd)).toBe(5);
  });

  it("refuses a part it cannot find, while the form is still open", async () => {
    const res = await api("post", "/api/repair-invoices").send({
      device_id: deviceId,
      items: [partLine(999_999, 1)],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("کالا با شناسه 999999 یافت نشد");
    expect(await owner.repairInvoice.count()).toBe(0);
  });

  it("refuses another workspace's part", async () => {
    const theirs = await owner.item.create({
      data: { workspaceId: workspaces.b.workspaceId, name: "مال ب", code: "B" },
    });

    const res = await api("post", "/api/repair-invoices").send({
      device_id: deviceId,
      items: [partLine(theirs.id, 1)],
    });

    expect(res.status).toBe(400);
  });

  it("is the only status that can still be edited", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 1)]);
    await setStatus(id, "issued");

    const res = await api("put", `/api/repair-invoices/${id}`).send({
      items: [partLine(lcd, 2)],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("فقط پیش‌فاکتور قابل ویرایش است");
  });
});

describe("issuing a repair invoice", () => {
  it("takes its parts and keeps what each one cost", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 2, 1_500_000)]);

    const res = await setStatus(id, "issued");

    expect(res.status).toBe(200);
    expect(await stockOf(lcd)).toBe(3);

    const line = await owner.repairInvoiceItem.findFirstOrThrow({
      where: { invoiceId: id },
    });
    expect(line.unitCost?.toNumber()).toBe(1_000_000);

    const row = await owner.inventoryTransaction.findFirstOrThrow({
      where: { itemId: lcd, type: "repair_use" },
    });
    expect(row).toMatchObject({
      referenceType: "repair_invoice",
      referenceId: id,
    });
    await expectStockConsistent(lcd);
  });

  it("takes a fraction exactly rather than rounding it away", async () => {
    // 0.4 metres used to round to nothing.
    const wire = await stockedItem("W", 10, 20_000, { isFractional: true });
    const id = await draft([partLine(wire, 0.4, 30_000)]);

    await setStatus(id, "issued");

    expect(await stockOf(wire)).toBe(9.6);
    await expectStockConsistent(wire);
  });

  it("stays a پیش‌فاکتور when a part is short, and says which", async () => {
    const lcd = await stockedItem("LCD", 1, 1_000_000);
    const id = await draft([partLine(lcd, 2)]);

    const res = await setStatus(id, "issued");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("«قطعه LCD»");
    const invoice = await owner.repairInvoice.findUniqueOrThrow({
      where: { id },
    });
    expect(invoice.status).toBe("draft");
    expect(await stockOf(lcd)).toBe(1);
  });

  it("takes the parts once when issued twice at the same moment", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 2)]);

    const results = await Promise.all([
      setStatus(id, "issued"),
      setStatus(id, "issued"),
    ]);

    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(await stockOf(lcd)).toBe(3);
    await expectStockConsistent(lcd);
  });

  it("takes the parts when a zero-total پیش‌فاکتور goes straight to paid", async () => {
    // A warranty repair, nothing to charge. It used to be paid with its
    // parts still on the shelf.
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 1, 0)]);

    const res = await setStatus(id, "paid");

    expect(res.status).toBe(200);
    expect(await stockOf(lcd)).toBe(4);
  });
});

describe("going back", () => {
  it("refuses issued → پیش‌فاکتور, which used to take the parts twice", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 2)]);
    await setStatus(id, "issued");

    const res = await setStatus(id, "draft");

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("ابطال");
    expect(await stockOf(lcd)).toBe(3);
  });

  it("returns the parts once on cancel, and not again on delete", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 2)]);
    await setStatus(id, "issued");

    expect((await setStatus(id, "cancelled")).status).toBe(200);
    expect(await stockOf(lcd)).toBe(5);

    expect((await api("delete", `/api/repair-invoices/${id}`)).status).toBe(
      200,
    );
    expect(await stockOf(lcd)).toBe(5);
    await expectStockConsistent(lcd);
  });

  it("returns the parts at the cost they left at", async () => {
    // Five at 1,000,000; two used; then three more at 1,600,000 (average
    // 1,300,000 over six). Cancelling returns the two at their 1,000,000:
    // eight worth 2,000,000 + 7,800,000, i.e. 1,225,000 each.
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 2)]);
    await setStatus(id, "issued");
    await api("post", "/api/purchase-invoices").send({
      supplier_name: null,
      paid_amount: 0,
      items: [{ item_id: lcd, quantity: 3, unit_price: 1_600_000 }],
    });

    await setStatus(id, "cancelled");

    const item = await owner.item.findUniqueOrThrow({ where: { id: lcd } });
    expect(item.currentStock.toNumber()).toBe(8);
    expect(item.avgPurchasePrice.toNumber()).toBe(1_225_000);
    await expectStockConsistent(lcd);
  });

  it("returns a paid invoice's parts when it is deleted", async () => {
    const lcd = await stockedItem("LCD", 5, 1_000_000);
    const id = await draft([partLine(lcd, 1, 0)]);
    await setStatus(id, "paid");

    const res = await api("delete", `/api/repair-invoices/${id}`);

    expect(res.status).toBe(200);
    expect(await stockOf(lcd)).toBe(5);
    await expectStockConsistent(lcd);
  });
});
