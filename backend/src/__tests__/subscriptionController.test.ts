import { Prisma } from "../generated/prisma/client";
import { sendTemplate, SMS_TEMPLATES } from "../lib/sms";
import { toJalaliSms } from "../utils/jalali";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    plan: { findUnique: jest.fn(), findMany: jest.fn() },
    payment: {
      create: jest.fn(),
      update: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    referral: { findUnique: jest.fn() },
    discountCode: { findUnique: jest.fn() },
    discountCodeUse: { findUnique: jest.fn(), count: jest.fn() },
    workspace: { findUniqueOrThrow: jest.fn() },
    // ownerPhone reads this now that settlePayment sends an SMS. Without it
    // every test in the file dies in beforeEach, not just the new ones.
    user: { findFirst: jest.fn() },
  },
  // The helper must actually call its callback, or nothing inside the
  // transaction runs and the test passes while asserting nothing.
  runInWorkspaceTransaction: jest.fn(
    (_workspaceId: number, fn: (tx: unknown) => unknown) => fn(txMock),
  ),
}));

jest.mock("../lib/zibal", () => ({
  __esModule: true,
  requestPayment: jest.fn(),
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

jest.mock("../lib/sms", () => ({
  ...jest.requireActual("../lib/sms"),
  sendTemplate: jest.fn(),
}));

jest.mock("../lib/workspaceContext", () => ({
  ...jest.requireActual("../lib/workspaceContext"),
  // Runs the callback rather than opening a real store: what matters here is
  // which workspace was asked for, not AsyncLocalStorage.
  runWithWorkspace: jest.fn((_id: number, fn: () => unknown) => fn()),
}));

jest.mock("../utils/subscription", () => ({
  ...jest.requireActual("../utils/subscription"),
  extendSubscription: jest.fn().mockResolvedValue(new Date("2026-12-01")),
}));

const txMock = {
  payment: { update: jest.fn() },
  discountCodeUse: { create: jest.fn().mockResolvedValue({}) },
};

import prisma from "../lib/prisma";
import { requestPayment, verifyPayment } from "../lib/zibal";
import { extendSubscription } from "../utils/subscription";
import { checkout, settlePayment } from "../controllers/subscriptionController";

const WORKSPACE_ID = 5;
const OWNER = "09120000001";

const QUARTERLY = {
  id: 1,
  code: "quarterly",
  name: "اشتراک ۳ ماهه",
  durationDays: 90,
  priceRials: new Prisma.Decimal(19_900_000),
  isActive: true,
};

function mockRes() {
  const res = {
    headersSent: false,
    status: jest.fn(),
    json: jest.fn(),
  } as never as { status: jest.Mock; json: jest.Mock; headersSent: boolean };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockReq(body: object) {
  return {
    valid: { body },
    user: { id: 9, workspaceId: WORKSPACE_ID, username: "09120000000" },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(prisma.plan.findUnique).mockResolvedValue(QUARTERLY as never);
  jest.mocked(prisma.referral.findUnique).mockResolvedValue(null as never);
  jest.mocked(prisma.payment.count).mockResolvedValue(0 as never);
  jest.mocked(prisma.payment.create).mockResolvedValue({ id: 77 } as never);
  jest.mocked(prisma.payment.update).mockResolvedValue({} as never);
  jest.mocked(requestPayment).mockResolvedValue({ trackId: 999n } as never);
  jest
    .mocked(extendSubscription)
    .mockResolvedValue(new Date("2026-12-01") as never);

  jest
    .mocked(prisma.user.findFirst)
    .mockResolvedValue({ username: OWNER } as never);
  // Re-set every time: clearAllMocks wipes the calls, not the implementation,
  // so a rejection left behind by one test would leak into the next.
  jest
    .mocked(sendTemplate)
    .mockResolvedValue({ messageId: 1, cost: 1 } as never);
});

describe("checkout", () => {
  it("charges the plan's price, never one from the request", async () => {
    const res = mockRes();

    // A price posted from the browser is a price the customer chose. The
    // body carries a plan code and nothing else that touches money.
    await checkout(
      mockReq({ plan_code: "quarterly", amount_rials: 1000 }) as never,
      res as never,
    );

    expect(jest.mocked(requestPayment).mock.calls[0][0].amountRials).toBe(
      19_900_000,
    );
  });

  it("writes the payment row before calling the gateway", async () => {
    const res = mockRes();

    // A payment that exists only in Zibal's records is one nobody here can
    // reconcile when the customer calls about it.
    await checkout(mockReq({ plan_code: "quarterly" }) as never, res as never);

    const createOrder = jest.mocked(prisma.payment.create).mock
      .invocationCallOrder[0];
    const requestOrder =
      jest.mocked(requestPayment).mock.invocationCallOrder[0];

    expect(createOrder).toBeLessThan(requestOrder);
  });

  it("copies the price and duration onto the row", async () => {
    const res = mockRes();

    await checkout(mockReq({ plan_code: "quarterly" }) as never, res as never);

    // Read back through planId instead, and a receipt from last year renders
    // at this year's price.
    expect(
      jest.mocked(prisma.payment.create).mock.calls[0][0].data,
    ).toMatchObject({
      basePriceRials: 19_900_000,
      amountRials: 19_900_000,
      planDurationDays: 90,
      status: "pending",
    });
  });

  it("marks the row failed when the gateway refuses", async () => {
    jest.mocked(requestPayment).mockRejectedValue(new Error("result 115"));
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    const res = mockRes();

    await checkout(mockReq({ plan_code: "quarterly" }) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(
      jest.mocked(prisma.payment.update).mock.calls[0][0].data.status,
    ).toBe("failed");

    logged.mockRestore();
  });

  it("refuses a plan that is not on sale", async () => {
    jest.mocked(prisma.plan.findUnique).mockResolvedValue(null as never);
    const res = mockRes();

    await checkout(mockReq({ plan_code: "gone" }) as never, res as never);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(prisma.payment.create).not.toHaveBeenCalled();
  });

  it("says so when a discount code was typed and rejected", async () => {
    // Silently charging full price leaves the customer believing it applied.
    jest
      .mocked(prisma.discountCode.findUnique)
      .mockResolvedValue(null as never);
    const res = mockRes();

    await checkout(
      mockReq({ plan_code: "quarterly", discount_code: "NOPE" }) as never,
      res as never,
    );

    expect(res.status).toHaveBeenCalledWith(400);
    expect(requestPayment).not.toHaveBeenCalled();
  });

  it("applies the referral discount to a first purchase", async () => {
    jest
      .mocked(prisma.referral.findUnique)
      .mockResolvedValue({ id: 1 } as never);
    const res = mockRes();

    await checkout(mockReq({ plan_code: "quarterly" }) as never, res as never);

    expect(jest.mocked(requestPayment).mock.calls[0][0].amountRials).toBe(
      17_910_000,
    );
  });

  it("does not apply it to a second one", async () => {
    // The discount is owed on a first purchase; it is spent once one
    // verifies.
    jest
      .mocked(prisma.referral.findUnique)
      .mockResolvedValue({ id: 1 } as never);
    jest.mocked(prisma.payment.count).mockResolvedValue(1 as never);
    const res = mockRes();

    await checkout(mockReq({ plan_code: "quarterly" }) as never, res as never);

    expect(jest.mocked(requestPayment).mock.calls[0][0].amountRials).toBe(
      19_900_000,
    );
  });

  it("records which code was used, without spending it yet", async () => {
    // Written to the payment row rather than to discount_code_uses: a card
    // that declines three times must not burn the customer's one use on
    // money that never moved.
    jest.mocked(prisma.discountCode.findUnique).mockResolvedValue({
      id: 3,
      code: "NOWRUZ20",
      type: "percent",
      value: new Prisma.Decimal(20),
      expiresAt: null,
      maxUses: null,
      isActive: true,
    } as never);
    jest
      .mocked(prisma.discountCodeUse.findUnique)
      .mockResolvedValue(null as never);

    const res = mockRes();
    await checkout(
      mockReq({ plan_code: "quarterly", discount_code: "NOWRUZ20" }) as never,
      res as never,
    );

    expect(
      jest.mocked(prisma.payment.create).mock.calls[0][0].data,
    ).toMatchObject({ discountCodeId: 3 });
  });
});

describe("settlePayment", () => {
  const pending = {
    id: 77,
    status: "pending",
    amountRials: new Prisma.Decimal(19_900_000),
    planDurationDays: 90,
  };

  /** What Zibal answers for a card that went through. */
  function paidInFull() {
    return {
      newlyVerified: true,
      amountRials: 19_900_000,
      refNumber: "357340889094",
      cardNumber: "621986******1853",
      paidAt: new Date(),
    } as never;
  }

  it("extends the subscription by the plan's duration", async () => {
    jest.mocked(prisma.payment.findFirst).mockResolvedValue(pending as never);
    jest.mocked(verifyPayment).mockResolvedValue({
      newlyVerified: true,
      amountRials: 19_900_000,
      refNumber: "123",
      cardNumber: "62741****44",
      paidAt: new Date(),
    } as never);

    const result = await settlePayment(WORKSPACE_ID, 999n);

    expect(result.extended).toBe(true);
    expect(jest.mocked(extendSubscription).mock.calls[0][2]).toMatchObject({
      type: "payment",
      days: 90,
      paymentId: 77,
    });
  });

  it("does nothing for a payment already settled", async () => {
    // The customer refreshed the return page. One payment, one extension.
    jest
      .mocked(prisma.payment.findFirst)
      .mockResolvedValue({ ...pending, status: "verified" } as never);

    const result = await settlePayment(WORKSPACE_ID, 999n);

    expect(result.extended).toBe(false);
    expect(verifyPayment).not.toHaveBeenCalled();
    expect(extendSubscription).not.toHaveBeenCalled();
  });

  it("refuses when Zibal reports a different amount", async () => {
    // The one check that cannot be skipped: extending on a mismatch is
    // selling a subscription for whatever the customer decided to pay.
    jest.mocked(prisma.payment.findFirst).mockResolvedValue(pending as never);
    jest.mocked(verifyPayment).mockResolvedValue({
      newlyVerified: true,
      amountRials: 10_000,
      refNumber: null,
      cardNumber: null,
      paidAt: null,
    } as never);

    await expect(settlePayment(WORKSPACE_ID, 999n)).rejects.toThrow(
      "does not match",
    );

    expect(extendSubscription).not.toHaveBeenCalled();
    expect(
      jest.mocked(prisma.payment.update).mock.calls[0][0].data.status,
    ).toBe("failed");
  });

  it("will not settle a payment from another workspace", async () => {
    // findFirst is scoped by workspaceId as well as trackId, so a track id
    // learned elsewhere resolves to nothing here.
    jest.mocked(prisma.payment.findFirst).mockResolvedValue(null as never);

    await expect(settlePayment(WORKSPACE_ID, 999n)).rejects.toThrow(
      "No payment",
    );
  });

  it("spends the code when the money actually moved", async () => {
    // The bug this test exists for: discount_code_uses had a policy, a
    // REVOKE and an integration test, and nothing anywhere created a row —
    // so a code with maxUses of one could be used forever.
    jest.mocked(prisma.payment.findFirst).mockResolvedValue({
      ...pending,
      discountCodeId: 3,
    } as never);
    jest.mocked(verifyPayment).mockResolvedValue({
      newlyVerified: true,
      amountRials: 19_900_000,
      refNumber: "1",
      cardNumber: null,
      paidAt: new Date(),
    } as never);

    await settlePayment(WORKSPACE_ID, 999n);

    expect(txMock.discountCodeUse.create).toHaveBeenCalledWith({
      data: { workspaceId: WORKSPACE_ID, discountCodeId: 3, paymentId: 77 },
    });
  });

  it("writes no use row when there was no code", async () => {
    jest.mocked(prisma.payment.findFirst).mockResolvedValue({
      ...pending,
      discountCodeId: null,
    } as never);
    jest.mocked(verifyPayment).mockResolvedValue({
      newlyVerified: true,
      amountRials: 19_900_000,
      refNumber: "1",
      cardNumber: null,
      paidAt: new Date(),
    } as never);

    await settlePayment(WORKSPACE_ID, 999n);

    expect(txMock.discountCodeUse.create).not.toHaveBeenCalled();
  });

  it("tells the owner the subscription was extended", async () => {
    // The point of task 8.10. Every other signal said this was done — the
    // template was declared, present in five env files, validated at boot
    // and approved in the sms.ir panel — and 506 unit tests stayed green
    // because a call that does not exist has no test that fails.
    jest.mocked(prisma.payment.findFirst).mockResolvedValue(pending as never);
    jest.mocked(verifyPayment).mockResolvedValue(paidInFull());

    await settlePayment(WORKSPACE_ID, 999n);

    expect(jest.mocked(sendTemplate).mock.calls[0]).toEqual([
      OWNER,
      SMS_TEMPLATES.PAYMENT_OK,
      // The new expiry, not today: ۱۴۰۵-۰۹-۱۰ for the date the mocked
      // extendSubscription returns.
      { DATE: toJalaliSms(new Date("2026-12-01")) },
    ]);
  });

  it("sends nothing for a payment already settled", async () => {
    // A refreshed return page must not buy a second SMS.
    jest
      .mocked(prisma.payment.findFirst)
      .mockResolvedValue({ ...pending, status: "verified" } as never);

    await settlePayment(WORKSPACE_ID, 999n);

    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("keeps the payment settled when the SMS fails, and logs it", async () => {
    // Swallowed like deleteObject — but logged, which is the half that was
    // missing and the reason nobody noticed for a month.
    jest.mocked(prisma.payment.findFirst).mockResolvedValue(pending as never);
    jest.mocked(verifyPayment).mockResolvedValue(paidInFull());
    jest
      .mocked(sendTemplate)
      .mockRejectedValue(new Error("sms.ir returned HTTP 401"));

    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await settlePayment(WORKSPACE_ID, 999n);

    expect(result.extended).toBe(true);
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });

  it("settles normally when the workspace has no active super admin", async () => {
    jest.mocked(prisma.payment.findFirst).mockResolvedValue(pending as never);
    jest.mocked(verifyPayment).mockResolvedValue(paidInFull());
    jest.mocked(prisma.user.findFirst).mockResolvedValue(null as never);

    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await settlePayment(WORKSPACE_ID, 999n);

    expect(result.extended).toBe(true);
    expect(sendTemplate).not.toHaveBeenCalled();

    logged.mockRestore();
  });
});
