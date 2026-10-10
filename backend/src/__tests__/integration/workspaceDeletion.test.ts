import request from "supertest";
import app from "../../app";
import {
  DELETION_ORDER,
  deleteWorkspaceData,
} from "../../utils/workspaceDeletion";
import {
  disconnectOwner,
  owner,
  seedDevice,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

// deleteWorkspaceData end to end, as the application role, against a
// workspace with something in it (8.7, fixed 9 October).
//
// The unit test checks the order against a mock, which is why it never saw
// that the role could not delete from referral_codes: every real run stopped
// there and rolled back. This suite runs the real thing on real rows, so a
// grant, a policy or a RESTRICT foreign key out of step with DELETION_ORDER
// fails here instead of in the nightly job.

// Deletion reaches object storage first. Nothing here has objects, and the
// test bucket is not reachable from a test run.
jest.mock("../../lib/storage", () => ({
  ...jest.requireActual("../../lib/storage"),
  deleteObjects: jest.fn().mockResolvedValue(undefined),
  deleteByPrefix: jest.fn().mockResolvedValue(undefined),
}));

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await disconnectOwner();
});

/** Fills a workspace the way a shop would, through the API where it can. */
async function furnish(side: "a" | "b") {
  const { workspaceId, userId, token } = workspaces[side];
  const api = (method: "post" | "put", path: string) =>
    request(app)[method](path).set("Authorization", `Bearer ${token}`);

  const customer = await api("post", "/api/customers").send({
    name: `مشتری ${side}`,
    phone: side === "a" ? "09120000001" : "09120000002",
  });
  const device = await seedDevice(workspaceId, {
    deviceName: "Galaxy A54",
    customerId: customer.body.id,
  });
  await api("post", "/api/categories").send({ name: "قطعات" });
  const item = await api("post", "/api/items").send({
    code: "LCD",
    name: "ال‌سی‌دی",
    unit: "عدد",
    openingStock: 10,
    openingCost: 1_000,
  });
  const itemId = item.body.id;

  await api("post", "/api/purchase-invoices").send({
    supplier_name: "تامین‌کننده",
    paid_amount: 0,
    items: [{ item_id: itemId, quantity: 2, unit_price: 1_000 }],
  });
  await api("post", "/api/sale-invoices").send({
    customer_name: "مشتری",
    paid_amount: 0,
    items: [
      {
        item_type: "inventory",
        item_id: itemId,
        quantity: 1,
        unit_price: 3_000,
      },
    ],
  });
  const repair = await api("post", "/api/repair-invoices").send({
    device_id: device.id,
    items: [
      {
        item_type: "inventory",
        item_id: itemId,
        name: "ال‌سی‌دی",
        quantity: 1,
        unit_price: 3_000,
      },
    ],
  });
  await api("put", `/api/repair-invoices/${repair.body.id}/status`).send({
    status: "issued",
  });
  await api("post", "/api/stock-adjustments").send({
    lines: [
      { item_id: itemId, direction: "out", quantity: 1, reason: "damage" },
    ],
  });

  const count = await api("post", "/api/stock-counts").send({});
  await api(
    "put",
    `/api/stock-counts/${count.body.id}/lines/${count.body.lines[0].id}`,
  ).send({ counted_quantity: 7 });

  const bench = await api("post", "/api/warehouses").send({ name: "میز تعمیر" });
  await api("post", "/api/stock-transfers").send({
    from_warehouse_id: count.body.warehouse_id,
    to_warehouse_id: bench.body.id,
    lines: [{ item_id: itemId, quantity: 1 }],
  });

  await owner.referralCode.create({
    data: { workspaceId, code: `CODE-${side.toUpperCase()}` },
  });
  await owner.refreshToken.create({
    data: {
      workspaceId,
      userId,
      tokenHash: `hash-${side}`,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

/** How many rows each model on the deletion list holds for a workspace. */
async function counts(workspaceId: number) {
  const result: Record<string, number> = {};
  for (const model of DELETION_ORDER) {
    const delegate = owner[model] as unknown as {
      count: (args: { where: { workspaceId: number } }) => Promise<number>;
    };
    result[model] = await delegate.count({ where: { workspaceId } });
  }
  result.inventoryTransaction = await owner.inventoryTransaction.count({
    where: { workspaceId },
  });
  return result;
}

describe("deleteWorkspaceData", () => {
  it("empties a furnished workspace and tombstones it", async () => {
    await furnish("a");
    const before = await counts(workspaces.a.workspaceId);
    // Not a test of nothing: the fixture reached the tables that matter.
    for (const model of [
      "referralCode",
      "stockAdjustment",
      "stockCountLine",
      "stockTransferLine",
      "repairInvoice",
      "item",
      "warehouse",
      "user",
    ]) {
      expect(before[model]).toBeGreaterThan(0);
    }

    await deleteWorkspaceData(workspaces.a.workspaceId);

    const after = await counts(workspaces.a.workspaceId);
    expect(Object.values(after).every((n) => n === 0)).toBe(true);

    const workspace = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
    });
    expect(workspace.status).toBe("deleted");
    expect(workspace.deletedAt).not.toBeNull();
    expect(workspace.adjustmentSeq).toBe(0);
  });

  it("leaves the other workspace exactly as it was", async () => {
    await furnish("a");
    await furnish("b");
    const before = await counts(workspaces.b.workspaceId);

    await deleteWorkspaceData(workspaces.a.workspaceId);

    expect(await counts(workspaces.b.workspaceId)).toEqual(before);
    expect(
      await owner.referralCode.findUnique({ where: { code: "CODE-B" } }),
    ).not.toBeNull();
  });

  it("keeps a referral the deleted workshop made, without its code", async () => {
    await furnish("a");
    // b signed up through a's link.
    await owner.referral.create({
      data: {
        referrerWorkspaceId: workspaces.a.workspaceId,
        referredWorkspaceId: workspaces.b.workspaceId,
      },
    });

    await deleteWorkspaceData(workspaces.a.workspaceId);

    expect(await owner.referralCode.count({ where: { code: "CODE-A" } })).toBe(
      0,
    );
    expect(await owner.referral.count()).toBe(1);
  });
});

describe("referral codes and the application role", () => {
  it("may delete its own workspace's code and not another's", async () => {
    await owner.referralCode.create({
      data: { workspaceId: workspaces.a.workspaceId, code: "CODE-A" },
    });
    await owner.referralCode.create({
      data: { workspaceId: workspaces.b.workspaceId, code: "CODE-B" },
    });

    // As workspace a, aimed at b's code: RLS lets nothing through.
    const { runInWorkspaceTransaction } = await import("../../lib/prisma");
    const foreign = await runInWorkspaceTransaction(
      workspaces.a.workspaceId,
      (tx) => tx.$executeRaw`DELETE FROM referral_codes WHERE code = 'CODE-B'`,
    );
    const own = await runInWorkspaceTransaction(
      workspaces.a.workspaceId,
      (tx) => tx.$executeRaw`DELETE FROM referral_codes WHERE code = 'CODE-A'`,
    );

    expect([foreign, own]).toEqual([0, 1]);
    expect(await owner.referralCode.count({ where: { code: "CODE-B" } })).toBe(
      1,
    );
  });

  it("still may not change a code", async () => {
    await owner.referralCode.create({
      data: { workspaceId: workspaces.a.workspaceId, code: "CODE-A" },
    });

    const { runInWorkspaceTransaction } = await import("../../lib/prisma");
    await expect(
      runInWorkspaceTransaction(
        workspaces.a.workspaceId,
        (tx) =>
          tx.$executeRaw`UPDATE referral_codes SET code = 'NEW' WHERE code = 'CODE-A'`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
