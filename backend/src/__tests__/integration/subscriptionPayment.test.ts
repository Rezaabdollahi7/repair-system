import request from "supertest";

// Zibal is mocked; everything else is real. Same line the integration suite
// already draws for lib/storage: what these tests are for is the database
// and the policies, not somebody else's HTTP endpoint.
jest.mock("../../lib/zibal", () => ({
  __esModule: true,
  requestPayment: jest.fn().mockResolvedValue({ trackId: 4242n }),
  verifyPayment: jest.fn(),
  ZibalError: class ZibalError extends Error {
    result: number | null;
    constructor(message: string, result: number | null) {
      super(message);
      this.result = result;
    }
  },
  ZIBAL_RESULT: { SUCCESS: 100, ALREADY_VERIFIED: 201, NOT_PAID: 202 },
}));

import app from "../../app";
import prisma from "../../lib/prisma";
import { verifyPayment } from "../../lib/zibal";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

let workspaces: TwoWorkspaces;

/**
 * Plans are reference data inserted by migration 8.1, and truncateAll empties
 * every table — so by the time a test runs they are gone, exactly as roles
 * are. Recreated here rather than exempted from the truncation, which would
 * leave one table carrying state between tests.
 */
async function seedPlans() {
  await owner.plan.createMany({
    data: [
      {
        code: "quarterly",
        name: "اشتراک ۳ ماهه",
        durationDays: 90,
        priceRials: 19_900_000,
        sortOrder: 1,
      },
      {
        code: "annual",
        name: "اشتراک سالانه",
        durationDays: 425,
        priceRials: 79_900_000,
        sortOrder: 3,
      },
    ],
  });
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  await seedPlans();
  jest.clearAllMocks();
  jest.mocked(verifyPayment).mockResolvedValue({
    newlyVerified: true,
    amountRials: 19_900_000,
    refNumber: "998877",
    cardNumber: "62741****44",
    paidAt: new Date(),
  } as never);
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

function post(token: string, path: string, body: object) {
  return request(app)
    .post(path)
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

describe("buying a subscription end to end", () => {
  it("records the payment and moves the expiry by the plan's duration", async () => {
    const before = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    const checkout = await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });

    expect(checkout.status).toBe(200);
    expect(checkout.body.redirect_url).toContain("gateway.zibal.ir/start/4242");

    const verified = await post(workspaces.a.token, "/api/subscription/verify", {
      track_id: "4242",
    });

    expect(verified.status).toBe(200);
    expect(verified.body.extended).toBe(true);

    const after = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true, status: true },
    });

    const daysAdded =
      (after.expiresAt!.getTime() - before.expiresAt!.getTime()) /
      (24 * 60 * 60 * 1000);

    // Added to what was left, not instead of it.
    expect(Math.round(daysAdded)).toBe(90);
    expect(after.status).toBe("active");
  });

  it("leaves an event explaining the new date", async () => {
    await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });
    await post(workspaces.a.token, "/api/subscription/verify", {
      track_id: "4242",
    });

    const events = await owner.subscriptionEvent.findMany({
      where: { workspaceId: workspaces.a.workspaceId },
      orderBy: { id: "asc" },
    });

    // The trial from sign-up is not here: this workspace came from the
    // fixture, which sets an expiry directly. The payment event is.
    const payment = events.find((event) => event.type === "payment");
    expect(payment?.days).toBe(90);
    expect(payment?.paymentId).not.toBeNull();
  });

  it("does not extend twice when the return page is refreshed", async () => {
    await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });
    await post(workspaces.a.token, "/api/subscription/verify", {
      track_id: "4242",
    });

    const first = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    const second = await post(workspaces.a.token, "/api/subscription/verify", {
      track_id: "4242",
    });

    expect(second.body.extended).toBe(false);

    const after = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    expect(after.expiresAt).toEqual(first.expiresAt);
  });
});

describe("a payment belongs to the workspace that made it", () => {
  it("cannot be settled by another workspace's token", async () => {
    // The track id is not a secret — it is in a query string in the
    // customer's browser history. Scoping is what stops one shop confirming
    // another's payment onto their own subscription.
    await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });

    const stolen = await post(workspaces.b.token, "/api/subscription/verify", {
      track_id: "4242",
    });

    expect(stolen.status).toBe(500);
    expect(verifyPayment).not.toHaveBeenCalled();
  });

  it("does not appear in another workspace's history", async () => {
    await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });

    const theirs = await request(app)
      .get("/api/subscription/payments")
      .set("Authorization", `Bearer ${workspaces.b.token}`);

    expect(theirs.status).toBe(200);
    expect(theirs.body).toHaveLength(0);
  });
});

describe("discount codes", () => {
  async function createCode(data: {
    code: string;
    type: "percent" | "fixed";
    value: number;
    maxUses?: number;
    expiresAt?: Date;
  }) {
    // On the owner connection: discount codes are reference data and the
    // application role holds SELECT only, exactly as it does for roles.
    await owner.discountCode.create({ data });
  }

  it("takes the discount off the amount that goes to the gateway", async () => {
    await createCode({ code: "NOWRUZ20", type: "percent", value: 20 });

    const res = await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
      discount_code: "NOWRUZ20",
    });

    expect(res.body.amount_rials).toBe(15_920_000);
  });

  it("refuses one that has expired", async () => {
    await createCode({
      code: "OLD",
      type: "percent",
      value: 50,
      expiresAt: new Date(Date.now() - 1000),
    });

    const res = await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
      discount_code: "OLD",
    });

    expect(res.status).toBe(400);
  });

  it("refuses one whose total uses have run out", async () => {
    // A code shared in a Telegram group is a permanent discount without this.
    await createCode({ code: "LIMITED", type: "percent", value: 50, maxUses: 1 });

    const code = await owner.discountCode.findUniqueOrThrow({
      where: { code: "LIMITED" },
    });

    const payment = await owner.payment.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        planId: (await owner.plan.findUniqueOrThrow({ where: { code: "quarterly" } })).id,
        orderId: "DFX-B-used",
        status: "verified",
        basePriceRials: 19_900_000,
        amountRials: 9_950_000,
        planDurationDays: 90,
      },
    });

    await owner.discountCodeUse.create({
      data: {
        workspaceId: workspaces.b.workspaceId,
        discountCodeId: code.id,
        paymentId: payment.id,
      },
    });

    const res = await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
      discount_code: "LIMITED",
    });

    expect(res.status).toBe(400);
  });
});

describe("who may reach these routes", () => {
  it("keeps a technician out", async () => {
    const technicianRole = await owner.role.findUniqueOrThrow({
      where: { name: "technician" },
    });

    const user = await owner.user.create({
      data: {
        workspaceId: workspaces.a.workspaceId,
        fullName: "تکنسین",
        username: "09129999999",
        password: "irrelevant",
        roleId: technicianRole.id,
      },
      select: { id: true },
    });

    const jwt = (await import("jsonwebtoken")).default;
    const { JWT_SECRET } = await import("../../middleware/auth");

    const token = jwt.sign(
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

    // What the shop pays is not a technician's business, and these routes
    // are open to lapsed workspaces — so without the role check they would
    // be the one way in that never closes.
    const res = await post(token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });

    expect(res.status).toBe(403);
  });
});

describe("a lapsed workspace can still pay", () => {
  it("reaches checkout past the read-only guard", async () => {
    await owner.workspace.update({
      where: { id: workspaces.a.workspaceId },
      data: { expiresAt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) },
    });

    // The whole point of the exemption in 8.3. A shop locked out of paying
    // is a shop that cannot come back.
    const res = await post(workspaces.a.token, "/api/subscription/checkout", {
      plan_code: "quarterly",
    });

    expect(res.status).toBe(200);
  });
});
