// Zibal is mocked; everything else is real. The same line the integration
// suite already draws for lib/storage and for the subscription payment
// tests: what these are for is the database, the policies and the
// idempotency, not somebody else's HTTP endpoint.
jest.mock("../../lib/zibal", () => ({
  __esModule: true,
  requestPayment: jest.fn().mockResolvedValue({ trackId: 5150n }),
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

import prisma from "../../lib/prisma";
import { requestPayment, verifyPayment } from "../../lib/zibal";
import { runWithWorkspace } from "../../lib/workspaceContext";
import { settleTopup, startTopup } from "../../utils/smsTopup";
import {
  disconnectOwner,
  owner,
  seedTwoWorkspaces,
  truncateAll,
  type TwoWorkspaces,
} from "./helpers";

let workspaces: TwoWorkspaces;
const AMOUNT = 500_000;

async function walletBalance(workspaceId: number): Promise<number> {
  const wallet = await owner.smsWallet.findUniqueOrThrow({
    where: { workspaceId },
  });

  return wallet.balanceRials.toNumber();
}

/** What Zibal answers for a top-up that really was paid. */
function zibalPaid(amountRials = AMOUNT) {
  return {
    newlyVerified: true,
    amountRials,
    refNumber: "987654",
    cardNumber: "62741****44",
    paidAt: new Date(),
  };
}

beforeEach(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  jest.clearAllMocks();
  jest.mocked(requestPayment).mockResolvedValue({ trackId: 5150n });

  await owner.smsWallet.createMany({
    data: [
      { workspaceId: workspaces.a.workspaceId, balanceRials: 0 },
      { workspaceId: workspaces.b.workspaceId, balanceRials: 0 },
    ],
  });
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

describe("startTopup", () => {
  it("writes the row before calling the gateway", async () => {
    // A top-up that exists only in Zibal's records is one nobody here can
    // reconcile, so the order matters rather than being incidental.
    const workspaceId = workspaces.a.workspaceId;

    await runWithWorkspace(workspaceId, async () =>
      startTopup(workspaceId, { amountRials: AMOUNT }),
    );

    const row = await owner.smsTopup.findFirstOrThrow({
      where: { workspaceId },
    });

    expect(row.status).toBe("pending");
    expect(row.amountRials.toNumber()).toBe(AMOUNT);
    expect(row.trackId).toBe(5150n);
    // DFXS-, so a top-up and a subscription payment are tellable apart by
    // eye in the gateway's own panel.
    expect(row.orderId).toMatch(/^DFXS-/);
  });

  it("sends the customer back to the wallet's own page", async () => {
    // The single CALLBACK_URL constant was the reason this needed a change
    // in lib/zibal at all: landing on the subscription callback would have
    // that page verify a trackId that is not in `payments`.
    const workspaceId = workspaces.a.workspaceId;

    await runWithWorkspace(workspaceId, async () =>
      startTopup(workspaceId, { amountRials: AMOUNT }),
    );

    expect(jest.mocked(requestPayment).mock.calls[0][0].callbackUrl).toBe(
      "https://app.dofixo.test/sms-wallet/callback",
    );
  });

  it("records why the gateway refused, and credits nothing", async () => {
    const workspaceId = workspaces.a.workspaceId;
    jest.mocked(requestPayment).mockRejectedValue(new Error("gateway down"));

    await expect(
      runWithWorkspace(workspaceId, async () =>
        startTopup(workspaceId, { amountRials: AMOUNT }),
      ),
    ).rejects.toThrow(/gateway down/);

    const row = await owner.smsTopup.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(row.status).toBe("failed");
    expect(row.failureReason).toMatch(/gateway down/);
    expect(await walletBalance(workspaceId)).toBe(0);
  });

  it("refuses an amount below the floor or above the ceiling", async () => {
    const workspaceId = workspaces.a.workspaceId;

    for (const amountRials of [199_999, 100_000_001, 0, -500_000]) {
      await expect(
        runWithWorkspace(workspaceId, async () =>
          startTopup(workspaceId, { amountRials }),
        ),
      ).rejects.toThrow(/whole number of rials between/);
    }

    // Nothing was written for any of them — the check is before the row.
    expect(await owner.smsTopup.count()).toBe(0);
  });
});

describe("settleTopup", () => {
  async function pendingTopup(workspaceId: number) {
    return runWithWorkspace(workspaceId, async () =>
      startTopup(workspaceId, { amountRials: AMOUNT }),
    );
  }

  it("credits the wallet once the payment verifies", async () => {
    const workspaceId = workspaces.a.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid());

    const result = await runWithWorkspace(workspaceId, async () =>
      settleTopup(workspaceId, 5150n),
    );

    expect(result).toEqual({ credited: true, balanceAfterRials: AMOUNT });
    expect(await walletBalance(workspaceId)).toBe(AMOUNT);

    const row = await owner.smsTopup.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(row.status).toBe("verified");
    expect(row.refNumber).toBe("987654");
  });

  it("credits once however many times it is settled", async () => {
    // The customer refreshing the return page, and the nightly job reaching
    // a top-up the browser already confirmed, both arrive here.
    const workspaceId = workspaces.a.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid());

    const first = await runWithWorkspace(workspaceId, async () =>
      settleTopup(workspaceId, 5150n),
    );
    const second = await runWithWorkspace(workspaceId, async () =>
      settleTopup(workspaceId, 5150n),
    );

    expect(first.credited).toBe(true);
    expect(second.credited).toBe(false);
    expect(await walletBalance(workspaceId)).toBe(AMOUNT);

    // And exactly one ledger line, so the balance still equals its sum.
    expect(
      await owner.smsWalletTransaction.count({
        where: { workspaceId, type: "topup" },
      }),
    ).toBe(1);
  });

  it("credits once when two callbacks arrive together", async () => {
    // Result 201 means "already verified", which verifyPayment resolves
    // rather than throwing — so both callers can read a row that is still
    // unverified. The status transition is what decides, not the read.
    const workspaceId = workspaces.a.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid());

    const results = await Promise.all([
      runWithWorkspace(workspaceId, async () =>
        settleTopup(workspaceId, 5150n),
      ),
      runWithWorkspace(workspaceId, async () =>
        settleTopup(workspaceId, 5150n),
      ),
    ]);

    expect(results.filter((r) => r.credited)).toHaveLength(1);
    expect(await walletBalance(workspaceId)).toBe(AMOUNT);
  });

  it("refuses to credit an amount Zibal did not take", async () => {
    // Crediting on a mismatch would be selling credit for whatever the
    // customer decided to pay.
    const workspaceId = workspaces.a.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid(50_000));

    await expect(
      runWithWorkspace(workspaceId, async () =>
        settleTopup(workspaceId, 5150n),
      ),
    ).rejects.toThrow(/does not match/);

    expect(await walletBalance(workspaceId)).toBe(0);
    const row = await owner.smsTopup.findFirstOrThrow({
      where: { workspaceId },
    });
    expect(row.status).toBe("failed");
    expect(row.failureReason).toMatch(/amount mismatch/);
  });

  it("will not settle another workspace's top-up", async () => {
    const workspaceId = workspaces.b.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid());

    // A is asking about a trackId that belongs to B. The lookup is scoped by
    // both the policy and the explicit workspaceId, so it finds nothing —
    // and B's wallet is untouched.
    await expect(
      runWithWorkspace(workspaces.a.workspaceId, async () =>
        settleTopup(workspaces.a.workspaceId, 5150n),
      ),
    ).rejects.toThrow(/No SMS top-up/);

    expect(await walletBalance(workspaceId)).toBe(0);
    expect(jest.mocked(verifyPayment)).not.toHaveBeenCalled();
  });

  it("cannot be credited twice even by a caller that skips the status gate", async () => {
    // settleTopup gates on the status transition, which is what the test
    // above exercises. This one goes around it — writing the ledger line
    // directly, the way a second settle path or an operator script might —
    // and is refused by the unique index instead.
    const workspaceId = workspaces.a.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid());

    await runWithWorkspace(workspaceId, async () =>
      settleTopup(workspaceId, 5150n),
    );

    const topup = await owner.smsTopup.findFirstOrThrow({
      where: { workspaceId },
    });

    await expect(
      owner.smsWalletTransaction.create({
        data: {
          workspaceId,
          type: "topup",
          topupId: topup.id,
          amountRials: AMOUNT,
          balanceBeforeRials: AMOUNT,
          balanceAfterRials: AMOUNT * 2,
        },
      }),
    ).rejects.toThrow(/[Uu]nique constraint/);

    expect(await walletBalance(workspaceId)).toBe(AMOUNT);
  });

  it("does not touch the subscription ledger", async () => {
    // The whole reason sms_topups is its own table: a verified row in
    // `payments` means "this workshop has bought a subscription before", and
    // four call sites read it that way.
    const workspaceId = workspaces.a.workspaceId;
    await pendingTopup(workspaceId);
    jest.mocked(verifyPayment).mockResolvedValue(zibalPaid());

    await runWithWorkspace(workspaceId, async () =>
      settleTopup(workspaceId, 5150n),
    );

    expect(await owner.payment.count()).toBe(0);
    expect(await owner.subscriptionEvent.count()).toBe(0);
  });
});
