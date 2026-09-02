jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    payment: { count: jest.fn() },
    referral: { findUnique: jest.fn(), updateMany: jest.fn() },
  },
  runInWorkspaceTransaction: jest.fn(
    (_workspaceId: number, fn: (tx: unknown) => unknown) => fn({}),
  ),
}));

jest.mock("../utils/subscription", () => ({
  ...jest.requireActual("../utils/subscription"),
  extendSubscription: jest.fn().mockResolvedValue(new Date("2026-12-01")),
}));

import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import { linkReferral, rewardReferrer } from "../utils/referral";
import { extendSubscription } from "../utils/subscription";

const REFERRER = 3;
const REFERRED = 9;
const PAYMENT_ID = 77;

describe("linkReferral", () => {
  function mockTx(ownerWorkspaceId: number | null) {
    return {
      referralCode: {
        findUnique: jest
          .fn()
          .mockResolvedValue(
            ownerWorkspaceId === null
              ? null
              : { workspaceId: ownerWorkspaceId },
          ),
      },
      referral: { create: jest.fn().mockResolvedValue({}) },
    };
  }

  it("records who brought the new workspace", async () => {
    const tx = mockTx(REFERRER);

    await expect(linkReferral(tx as never, REFERRED, "AB23CD")).resolves.toBe(
      true,
    );

    expect(tx.referral.create).toHaveBeenCalledWith({
      data: {
        referrerWorkspaceId: REFERRER,
        referredWorkspaceId: REFERRED,
      },
    });
  });

  it("says so for a code nobody owns, without failing the sign-up", async () => {
    // Turning someone away at the last step of a form over one mistyped
    // character costs a customer. The caller reports it instead.
    const tx = mockTx(null);

    await expect(linkReferral(tx as never, REFERRED, "WRONG1")).resolves.toBe(
      false,
    );

    expect(tx.referral.create).not.toHaveBeenCalled();
  });

  it("refuses a workspace referring itself", async () => {
    const tx = mockTx(REFERRED);

    await expect(linkReferral(tx as never, REFERRED, "SELF01")).resolves.toBe(
      false,
    );

    expect(tx.referral.create).not.toHaveBeenCalled();
  });
});

describe("rewardReferrer", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(prisma.payment.count).mockResolvedValue(1 as never);
    jest.mocked(prisma.referral.findUnique).mockResolvedValue({
      id: 5,
      referrerWorkspaceId: REFERRER,
      rewardedAt: null,
    } as never);
    jest.mocked(prisma.referral.updateMany).mockResolvedValue({
      count: 1,
    } as never);
    jest
      .mocked(extendSubscription)
      .mockResolvedValue(new Date("2026-12-01") as never);
  });

  it("adds thirty days to the referrer, in their own workspace", async () => {
    await rewardReferrer(REFERRED, PAYMENT_ID);

    // The reward is written to a DIFFERENT workspace than the one that paid,
    // so it goes through its own transaction with its own context.
    expect(jest.mocked(runInWorkspaceTransaction).mock.calls[0][0]).toBe(
      REFERRER,
    );

    expect(jest.mocked(extendSubscription).mock.calls[0][2]).toMatchObject({
      type: "referral",
      days: 30,
    });
  });

  it("pays only for a first purchase", async () => {
    // A renewal is the shop paying for itself. Rewarding it would turn one
    // introduction into an annuity.
    jest.mocked(prisma.payment.count).mockResolvedValue(2 as never);

    await rewardReferrer(REFERRED, PAYMENT_ID);

    expect(extendSubscription).not.toHaveBeenCalled();
  });

  it("does nothing for a workspace nobody referred", async () => {
    jest.mocked(prisma.referral.findUnique).mockResolvedValue(null as never);

    await rewardReferrer(REFERRED, PAYMENT_ID);

    expect(extendSubscription).not.toHaveBeenCalled();
  });

  it("does nothing for a referral already paid", async () => {
    jest.mocked(prisma.referral.findUnique).mockResolvedValue({
      id: 5,
      referrerWorkspaceId: REFERRER,
      rewardedAt: new Date(),
    } as never);

    await rewardReferrer(REFERRED, PAYMENT_ID);

    expect(extendSubscription).not.toHaveBeenCalled();
  });

  it("claims the referral before writing the reward", async () => {
    // Two settlements racing — the return page and the nightly job reaching
    // the same payment — would otherwise both pay out.
    await rewardReferrer(REFERRED, PAYMENT_ID);

    const claimOrder = jest.mocked(prisma.referral.updateMany).mock
      .invocationCallOrder[0];
    const rewardOrder = jest.mocked(extendSubscription).mock
      .invocationCallOrder[0];

    expect(claimOrder).toBeLessThan(rewardOrder);
    expect(jest.mocked(prisma.referral.updateMany).mock.calls[0][0]).toMatchObject(
      { where: { id: 5, rewardedAt: null } },
    );
  });

  it("stands down when another caller claimed it first", async () => {
    jest.mocked(prisma.referral.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    await rewardReferrer(REFERRED, PAYMENT_ID);

    expect(extendSubscription).not.toHaveBeenCalled();
  });

  it("puts the claim back when the reward cannot be written", async () => {
    // Otherwise the referral reads as paid while no days were added, and
    // nothing would ever try again — the one failure that short-changes
    // somebody quietly.
    jest.mocked(extendSubscription).mockRejectedValue(new Error("db down"));
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    await rewardReferrer(REFERRED, PAYMENT_ID);

    expect(jest.mocked(prisma.referral.updateMany).mock.calls[1][0]).toMatchObject(
      { data: { rewardedAt: null, paymentId: null } },
    );

    logged.mockRestore();
  });

  it("never throws, whatever goes wrong", async () => {
    // A customer who has just paid must not see a 500 because somebody
    // else's thirty days could not be written.
    jest.mocked(prisma.payment.count).mockRejectedValue(new Error("boom"));
    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    await expect(rewardReferrer(REFERRED, PAYMENT_ID)).resolves.toBeUndefined();
    expect(logged).toHaveBeenCalled();

    logged.mockRestore();
  });
});
