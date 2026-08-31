import {
  addDays,
  extendSubscription,
  startTrial,
  TRIAL_DAYS,
} from "../utils/subscription";

// A hand-rolled transaction client rather than a mock of lib/prisma:
// extendSubscription takes its tx as an argument, so there is nothing to
// intercept and the test can say exactly what the database returned.
function makeTx(currentExpiry: Date | null) {
  return {
    $queryRaw: jest.fn().mockResolvedValue(
      currentExpiry === undefined ? [] : [{ expires_at: currentExpiry }],
    ),
    workspace: { update: jest.fn().mockResolvedValue({}) },
    subscriptionEvent: { create: jest.fn().mockResolvedValue({}) },
  };
}

function emptyTx() {
  return {
    $queryRaw: jest.fn().mockResolvedValue([]),
    workspace: { update: jest.fn() },
    subscriptionEvent: { create: jest.fn() },
  };
}

describe("addDays", () => {
  it("adds whole days", () => {
    const from = new Date("2026-03-01T10:00:00.000Z");

    expect(addDays(from, 90).toISOString()).toBe("2026-05-30T10:00:00.000Z");
  });
});

describe("extendSubscription", () => {
  it("counts from the existing expiry when there is time left", async () => {
    // Bought in month two of a three-month subscription: the six months
    // bought are added to what remains, not instead of it.
    const remaining = addDays(new Date(), 30);
    const tx = makeTx(remaining);

    const result = await extendSubscription(tx as never, 1, {
      type: "payment",
      days: 180,
      paymentId: 7,
    });

    expect(result.getTime()).toBe(addDays(remaining, 180).getTime());
  });

  it("counts from today when the subscription already lapsed", async () => {
    // The referral reward case: a workspace that expired last week must not
    // have its thirty days spent in the past.
    const lapsed = addDays(new Date(), -7);
    const tx = makeTx(lapsed);

    const before = Date.now();
    const result = await extendSubscription(tx as never, 1, {
      type: "referral",
      days: 30,
    });

    expect(result.getTime()).toBeGreaterThan(before + 29 * 24 * 60 * 60 * 1000);
  });

  it("counts from today for a workspace with no expiry at all", async () => {
    const tx = makeTx(null);

    const before = Date.now();
    const result = await startTrial(tx as never, 1);

    expect(result.getTime()).toBeGreaterThanOrEqual(
      before + TRIAL_DAYS * 24 * 60 * 60 * 1000,
    );
  });

  it("records the move it made, both ends of it", async () => {
    const remaining = addDays(new Date(), 10);
    const tx = makeTx(remaining);

    await extendSubscription(tx as never, 42, {
      type: "payment",
      days: 90,
      paymentId: 3,
      note: "quarterly",
    });

    expect(tx.subscriptionEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: 42,
        type: "payment",
        days: 90,
        previousExpiresAt: remaining,
        paymentId: 3,
        note: "quarterly",
      }),
    });
  });

  it("leaves a trial reading as a trial, and anything else as active", async () => {
    const trialTx = makeTx(null);
    await startTrial(trialTx as never, 1);

    expect(trialTx.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "trial" }),
      }),
    );

    const paidTx = makeTx(null);
    await extendSubscription(paidTx as never, 1, { type: "payment", days: 90 });

    expect(paidTx.workspace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "active" }),
      }),
    );
  });

  it("takes a row lock before reading the expiry", async () => {
    // The lock is the whole reason this function reads through raw SQL. If
    // someone later swaps it for a findUnique, two payments verifying at
    // once would lose one of them — and nothing else in this file would
    // notice, because the arithmetic would still be right.
    const tx = makeTx(null);

    await startTrial(tx as never, 1);

    const sql = (tx.$queryRaw.mock.calls[0][0] as string[]).join("");
    expect(sql).toContain("FOR UPDATE");
  });

  it("refuses days that would shorten or do nothing", async () => {
    for (const days of [0, -30, 1.5]) {
      const tx = makeTx(null);

      await expect(
        extendSubscription(tx as never, 1, { type: "manual", days }),
      ).rejects.toThrow("positive whole number");

      expect(tx.workspace.update).not.toHaveBeenCalled();
    }
  });

  it("refuses a workspace the policy did not return", async () => {
    // A silent no-op here would be a payment that took the money and
    // extended nothing.
    const tx = emptyTx();

    await expect(
      extendSubscription(tx as never, 99, { type: "payment", days: 90 }),
    ).rejects.toThrow("no such row");

    expect(tx.subscriptionEvent.create).not.toHaveBeenCalled();
  });
});
