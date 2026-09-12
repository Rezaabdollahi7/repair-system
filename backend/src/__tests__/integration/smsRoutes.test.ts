// Zibal is mocked; everything else is real. What these are for is the role
// boundary and the workspace boundary at the HTTP layer — the two things a
// controller can get wrong that no unit test of the controller would notice.
jest.mock("../../lib/zibal", () => ({
  __esModule: true,
  requestPayment: jest.fn().mockResolvedValue({ trackId: 7007n }),
  verifyPayment: jest.fn(),
  WALLET_CALLBACK_URL: "https://app.dofixo.test/sms-wallet/callback",
  CALLBACK_URL: "https://app.dofixo.test/subscription/callback",
  ZibalError: class ZibalError extends Error {
    result: number | null;
    constructor(message: string, result: number | null) {
      super(message);
      this.result = result;
    }
  },
  ZIBAL_RESULT: { SUCCESS: 100, ALREADY_VERIFIED: 201, NOT_PAID: 202 },
}));

import request from "supertest";
import app from "../../app";
import prisma from "../../lib/prisma";
import { MIN_TOPUP_RIALS } from "../../schemas/sms";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

let workspaces: TwoWorkspaces;

const UNIT_PRICE = 1_750;

const get = (token: string, path: string) =>
  request(app).get(path).set("Authorization", `Bearer ${token}`);

const send = (token: string, method: "post" | "patch", path: string, body: object) =>
  request(app)[method](path).set("Authorization", `Bearer ${token}`).send(body);

/** A technician in workspace A, for the role boundary. */
async function technicianToken(): Promise<string> {
  const role = await owner.role.findUniqueOrThrow({
    where: { name: "technician" },
  });

  const user = await owner.user.create({
    data: {
      workspaceId: workspaces.a.workspaceId,
      fullName: "تکنسین",
      username: "09129999999",
      password: "irrelevant",
      roleId: role.id,
    },
    select: { id: true },
  });

  const jwt = (await import("jsonwebtoken")).default;
  const { JWT_SECRET } = await import("../../middleware/auth");

  return jwt.sign(
    {
      id: user.id,
      workspaceId: workspaces.a.workspaceId,
      username: "09129999999",
      role: "technician",
      isActive: true,
    },
    JWT_SECRET,
    { expiresIn: "1h" },
  );
}

async function seedWallets() {
  await owner.smsPrice.create({
    data: { unitPriceRials: UNIT_PRICE, effectiveFrom: new Date("2026-01-01") },
  });

  for (const [workspaceId, balanceRials] of [
    [workspaces.a.workspaceId, 100_000],
    [workspaces.b.workspaceId, 900_000],
  ] as const) {
    await owner.smsWallet.create({ data: { workspaceId, balanceRials } });
    await owner.settings.create({
      data: {
        workspaceId,
        companyName: `کارگاه ${workspaceId}`,
        smsCustomerNotificationsEnabled: true,
      },
    });
  }
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  await seedWallets();
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("who may see what the shop spends", () => {
  const closed = [
    "/api/sms/wallet",
    "/api/sms/wallet/transactions",
    "/api/sms/topups",
    "/api/sms/messages",
    "/api/sms/settings",
  ];

  it("refuses a technician every route that carries money", async () => {
    const token = await technicianToken();

    for (const path of closed) {
      expect((await get(token, path)).status).toBe(403);
    }

    expect(
      (await send(token, "post", "/api/sms/wallet/topup", {
        amount_rials: MIN_TOPUP_RIALS,
      })).status,
    ).toBe(403);
    expect(
      (await send(token, "patch", "/api/sms/settings", { enabled: false }))
        .status,
    ).toBe(403);
  });

  it("lets an admin through the same routes", async () => {
    for (const path of closed) {
      expect((await get(workspaces.a.token, path)).status).toBe(200);
    }
  });
});

describe("capability, the one route a technician may call", () => {
  it("answers without putting a figure in the payload", async () => {
    // The promise the endpoint exists to keep. A balance here would be money
    // in a response a technician's role is not meant to see, and hiding it
    // in the component would leave it in the network tab.
    const res = await get(await technicianToken(), "/api/sms/capability");

    expect(res.status).toBe(200);
    expect(res.body.can_send).toBe(true);

    const payload = JSON.stringify(res.body);
    expect(payload).not.toContain("100000");
    expect(payload).not.toContain("balance");
    expect(payload).not.toContain("rials");
  });

  it("says the toggle is the reason before it says the credit is", async () => {
    // Same order notifyCustomer refuses in, so the modal says what the send
    // would have recorded. A shop with notifications off is not also told
    // its credit is short.
    await owner.settings.updateMany({
      where: { workspaceId: workspaces.a.workspaceId },
      data: { smsCustomerNotificationsEnabled: false },
    });
    await owner.smsWallet.updateMany({
      where: { workspaceId: workspaces.a.workspaceId },
      data: { balanceRials: 0 },
    });

    const res = await get(await technicianToken(), "/api/sms/capability");

    expect(res.body).toMatchObject({ can_send: false, reason: "disabled" });
  });

  it("reports short credit once notifications are on", async () => {
    await owner.smsWallet.updateMany({
      where: { workspaceId: workspaces.a.workspaceId },
      data: { balanceRials: 100 },
    });

    const res = await get(await technicianToken(), "/api/sms/capability");

    expect(res.body).toMatchObject({
      can_send: false,
      reason: "insufficient_balance",
    });
  });
});

describe("one workspace's screens show one workspace's rows", () => {
  it("lists only the caller's messages, top-ups and ledger", async () => {
    for (const workspaceId of [
      workspaces.a.workspaceId,
      workspaces.b.workspaceId,
    ]) {
      await owner.smsMessage.create({
        data: {
          workspaceId,
          phone: `0912000000${workspaceId}`,
          kind: "device_ready",
          unitPriceRials: UNIT_PRICE,
        },
      });
      await owner.smsTopup.create({
        data: { workspaceId, orderId: `DFXS-${workspaceId}`, amountRials: 500_000 },
      });
      await owner.smsWalletTransaction.create({
        data: {
          workspaceId,
          type: "adjustment",
          amountRials: 1_000,
          balanceBeforeRials: 0,
          balanceAfterRials: 1_000,
        },
      });
    }

    const token = workspaces.a.token;

    const messages = await get(token, "/api/sms/messages");
    expect(messages.body.total).toBe(1);
    expect(messages.body.data[0].phone).toBe(
      `0912000000${workspaces.a.workspaceId}`,
    );

    const topups = await get(token, "/api/sms/topups");
    expect(topups.body.data.map((r: { order_id: string }) => r.order_id)).toEqual([
      `DFXS-${workspaces.a.workspaceId}`,
    ]);

    const ledger = await get(token, "/api/sms/wallet/transactions");
    expect(ledger.body.total).toBe(1);
  });

  it("shows each workspace its own balance", async () => {
    const a = await get(workspaces.a.token, "/api/sms/wallet");
    const b = await get(workspaces.b.token, "/api/sms/wallet");

    expect(a.body.balance_rials).toBe(100_000);
    expect(b.body.balance_rials).toBe(900_000);
    // 1,750 a part and two parts a message: 3,500 each, so 28 of them.
    expect(a.body.approximate_messages_left).toBe(28);
  });

  it("flips only the caller's toggle", async () => {
    const res = await send(workspaces.a.token, "patch", "/api/sms/settings", {
      enabled: false,
    });

    expect(res.status).toBe(200);
    expect((await get(workspaces.a.token, "/api/sms/settings")).body.enabled).toBe(
      false,
    );
    expect((await get(workspaces.b.token, "/api/sms/settings")).body.enabled).toBe(
      true,
    );
  });
});

describe("topping up", () => {
  it("refuses an amount under the floor before reaching the gateway", async () => {
    const res = await send(workspaces.a.token, "post", "/api/sms/wallet/topup", {
      amount_rials: MIN_TOPUP_RIALS - 1,
    });

    expect(res.status).toBe(400);
    expect(await owner.smsTopup.count()).toBe(0);
  });

  it("hands back somewhere to send the customer", async () => {
    const res = await send(workspaces.a.token, "post", "/api/sms/wallet/topup", {
      amount_rials: 500_000,
    });

    expect(res.status).toBe(200);
    expect(res.body.redirect_url).toMatch(/gateway\.zibal\.ir\/start\/7007/);

    const row = await owner.smsTopup.findFirstOrThrow({
      where: { workspaceId: workspaces.a.workspaceId },
    });
    expect(row.status).toBe("pending");
    expect(row.amountRials.toNumber()).toBe(500_000);
  });

  it("takes the workspace from the token, never the body", async () => {
    // The shape of the mistake that would let one shop bill another: a
    // workspace_id in the request that the controller believed.
    await send(workspaces.a.token, "post", "/api/sms/wallet/topup", {
      amount_rials: 500_000,
      workspace_id: workspaces.b.workspaceId,
      workspaceId: workspaces.b.workspaceId,
    });

    expect(
      await owner.smsTopup.count({
        where: { workspaceId: workspaces.b.workspaceId },
      }),
    ).toBe(0);
    expect(
      await owner.smsTopup.count({
        where: { workspaceId: workspaces.a.workspaceId },
      }),
    ).toBe(1);
  });
});
