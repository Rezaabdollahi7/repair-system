import request from "supertest";

jest.mock("../../lib/zibal", () => ({
  __esModule: true,
  requestPayment: jest.fn().mockResolvedValue({ trackId: 5150n }),
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
  issueCode,
  owner,
  seedTwoWorkspaces,
  TEST_OTP_CODE,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

const DAY = 24 * 60 * 60 * 1000;

let workspaces: TwoWorkspaces;

/**
 * The referrer's code. Fixture workspaces come from helpers.ts, which writes
 * rows directly and does not call populateWorkspace — so the code has to be
 * created here.
 */
async function giveCodeTo(workspaceId: number, code: string) {
  await owner.referralCode.create({ data: { workspaceId, code } });
}

async function seedPlan() {
  await owner.plan.create({
    data: {
      code: "quarterly",
      name: "اشتراک ۳ ماهه",
      durationDays: 90,
      priceRials: 19_900_000,
      sortOrder: 1,
    },
  });
}

const signUp = {
  workspace_name: "تعمیرگاه دعوت‌شده",
  username: "09351112233",
  password: "testpass123",
  code: TEST_OTP_CODE,
};

async function register(body: Record<string, unknown>) {
  await issueCode(String(body.username));
  return request(app).post("/api/auth/register").send(body);
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  await seedPlan();
  await giveCodeTo(workspaces.a.workspaceId, "AB23CD");
  jest.clearAllMocks();
  jest.mocked(verifyPayment).mockResolvedValue({
    newlyVerified: true,
    amountRials: 17_910_000,
    refNumber: "1",
    cardNumber: null,
    paidAt: new Date(),
  } as never);
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("signing up with an invite code", () => {
  it("records the relationship", async () => {
    const res = await register({ ...signUp, referral_code: "AB23CD" });

    expect(res.status).toBe(201);
    expect(res.body.referral_applied).toBe(true);

    const referral = await owner.referral.findUniqueOrThrow({
      where: { referredWorkspaceId: res.body.user.workspace_id },
    });

    expect(referral.referrerWorkspaceId).toBe(workspaces.a.workspaceId);
    expect(referral.rewardedAt).toBeNull();
  });

  it("still registers when the code is wrong, and says so", async () => {
    const res = await register({ ...signUp, referral_code: "NOSUCH" });

    expect(res.status).toBe(201);
    expect(res.body.referral_applied).toBe(false);
    expect(await owner.referral.count()).toBe(0);
  });

  it("leaves no referral behind when the sign-up fails", async () => {
    // Written inside the transaction, so a rollback takes it with it.
    await register({ ...signUp, referral_code: "AB23CD" });

    const second = await register({
      ...signUp,
      workspace_name: "تعمیرگاه دیگر",
      referral_code: "AB23CD",
    });

    expect(second.status).toBe(409);
    expect(await owner.referral.count()).toBe(1);
  });
});

describe("the discount the invited workshop gets", () => {
  it("is ten percent off the first purchase", async () => {
    const registered = await register({ ...signUp, referral_code: "AB23CD" });

    const checkout = await request(app)
      .post("/api/subscription/checkout")
      .set("Authorization", `Bearer ${registered.body.token}`)
      .send({ plan_code: "quarterly" });

    expect(checkout.body.amount_rials).toBe(17_910_000);
  });
});

describe("the reward the referrer gets", () => {
  async function inviteAndPay() {
    const registered = await register({ ...signUp, referral_code: "AB23CD" });
    const token = registered.body.token;

    await request(app)
      .post("/api/subscription/checkout")
      .set("Authorization", `Bearer ${token}`)
      .send({ plan_code: "quarterly" });

    await request(app)
      .post("/api/subscription/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "5150" });

    return token;
  }

  it("arrives only after the invited workshop pays", async () => {
    await register({ ...signUp, referral_code: "AB23CD" });

    const referral = await owner.referral.findFirstOrThrow();
    expect(referral.rewardedAt).toBeNull();
  });

  it("adds thirty days to the referrer's own subscription", async () => {
    const before = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    await inviteAndPay();

    const after = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    const added =
      (after.expiresAt!.getTime() - before.expiresAt!.getTime()) / DAY;

    // Written across a workspace boundary, which only runWithWorkspace can
    // do — RLS refuses it from the paying workspace's context.
    expect(Math.round(added)).toBe(30);
  });

  it("leaves an event on the referrer explaining the extra month", async () => {
    await inviteAndPay();

    const event = await owner.subscriptionEvent.findFirstOrThrow({
      where: { workspaceId: workspaces.a.workspaceId, type: "referral" },
    });

    expect(event.days).toBe(30);
  });

  it("marks the referral paid and points it at the payment", async () => {
    await inviteAndPay();

    const referral = await owner.referral.findFirstOrThrow();

    expect(referral.rewardedAt).not.toBeNull();
    expect(referral.paymentId).not.toBeNull();
  });

  it("is not paid twice when the return page is refreshed", async () => {
    const token = await inviteAndPay();

    const before = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    await request(app)
      .post("/api/subscription/verify")
      .set("Authorization", `Bearer ${token}`)
      .send({ track_id: "5150" });

    const after = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
      select: { expiresAt: true },
    });

    expect(after.expiresAt).toEqual(before.expiresAt);
  });
});

describe("the invite page", () => {
  it("shows the workspace its own code and how the invites went", async () => {
    const res = await request(app)
      .get("/api/subscription/referral")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.status).toBe(200);
    expect(res.body.code).toBe("AB23CD");
    expect(res.body.reward_days).toBe(30);
    expect(res.body.invited_count).toBe(0);
  });

  it("counts an invite once it is made", async () => {
    await register({ ...signUp, referral_code: "AB23CD" });

    const res = await request(app)
      .get("/api/subscription/referral")
      .set("Authorization", `Bearer ${workspaces.a.token}`);

    expect(res.body.invited_count).toBe(1);
    expect(res.body.rewarded_count).toBe(0);
  });

  it("tells the neighbouring workspace nothing about it", async () => {
    await register({ ...signUp, referral_code: "AB23CD" });

    const res = await request(app)
      .get("/api/subscription/referral")
      .set("Authorization", `Bearer ${workspaces.b.token}`);

    expect(res.body.code).toBeNull();
    expect(res.body.invited_count).toBe(0);
  });
});
