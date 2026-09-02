jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
    user: { findFirst: jest.fn() },
    workspace: { updateMany: jest.fn() },
    subscriptionNotification: { create: jest.fn() },
  },
}));

jest.mock("../lib/workspaceContext", () => ({
  __esModule: true,
  // Runs the callback rather than opening a real store: what this suite is
  // about is which workspace was asked for, not AsyncLocalStorage.
  runWithWorkspace: jest.fn((_id: number, fn: () => unknown) => fn()),
}));

jest.mock("../lib/sms", () => ({
  ...jest.requireActual("../lib/sms"),
  sendTemplate: jest.fn().mockResolvedValue({ messageId: 1, cost: 1 }),
}));

jest.mock("../lib/zibal", () => ({
  __esModule: true,
  inquirePayment: jest.fn(),
}));

jest.mock("../controllers/subscriptionController", () => ({
  __esModule: true,
  settlePayment: jest.fn(),
}));

jest.mock("../utils/workspaceDeletion", () => ({
  __esModule: true,
  deleteWorkspaceData: jest.fn().mockResolvedValue(undefined),
}));

import prisma from "../lib/prisma";
import { runWithWorkspace } from "../lib/workspaceContext";
import { sendTemplate, SMS_TEMPLATES } from "../lib/sms";
import { inquirePayment } from "../lib/zibal";
import { settlePayment } from "../controllers/subscriptionController";
import { deleteWorkspaceData } from "../utils/workspaceDeletion";
import { runSubscriptionJob } from "../utils/subscriptionJob";
import { DELETION_DAYS, GRACE_DAYS } from "../utils/subscription";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-09-15T02:00:00.000Z");
const OWNER = "09120000001";

/** A workspace row as the raw query returns it. */
function workspace(id: number, daysSinceExpiry: number, neverExpires = false) {
  return {
    id,
    never_expires: neverExpires,
    expires_at: new Date(NOW.getTime() - daysSinceExpiry * DAY),
  };
}

/** The two raw queries the job runs, in order. */
function rawReturns(workspaces: unknown[], payments: unknown[] = []) {
  jest
    .mocked(prisma.$queryRaw)
    .mockResolvedValueOnce(workspaces as never)
    .mockResolvedValueOnce(payments as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(prisma.user.findFirst)
    .mockResolvedValue({ username: OWNER } as never);
  jest.mocked(prisma.workspace.updateMany).mockResolvedValue({
    count: 0,
  } as never);
  jest
    .mocked(prisma.subscriptionNotification.create)
    .mockResolvedValue({} as never);
  jest
    .mocked(sendTemplate)
    .mockResolvedValue({ messageId: 1, cost: 1 } as never);
});

describe("runSubscriptionJob", () => {
  it("warns the owner a week before the subscription ends", async () => {
    rawReturns([workspace(1, -7)]);

    const report = await runSubscriptionJob(NOW);

    expect(report.notified).toBe(1);
    expect(jest.mocked(sendTemplate).mock.calls[0]).toEqual([
      OWNER,
      SMS_TEMPLATES.BEFORE_EXPIRY,
      { DAYS: "7" },
    ]);
  });

  it("sends to the super admin and nobody else", async () => {
    // The money comes out of the owner's pocket. An admin who happens to
    // have the app open has no business getting a billing message, and every
    // extra recipient is another SMS bought.
    rawReturns([workspace(1, -7)]);

    await runSubscriptionJob(NOW);

    expect(jest.mocked(prisma.user.findFirst).mock.calls[0][0]).toMatchObject({
      where: { isActive: true, role: { name: "super_admin" } },
    });
  });

  it("records the message before sending it", async () => {
    // A duplicate SMS costs money and looks careless; a message recorded but
    // not sent costs one warning, and the next is days away either way.
    rawReturns([workspace(1, -7)]);

    await runSubscriptionJob(NOW);

    const recorded = jest.mocked(prisma.subscriptionNotification.create).mock
      .invocationCallOrder[0];
    const sent = jest.mocked(sendTemplate).mock.invocationCallOrder[0];

    expect(recorded).toBeLessThan(sent);
  });

  it("sends nothing when the ledger already has it", async () => {
    // The composite unique refusing the insert is how a second run in one
    // night stays quiet.
    jest
      .mocked(prisma.subscriptionNotification.create)
      .mockRejectedValue(new Error("unique violation"));
    rawReturns([workspace(1, -7)]);

    const report = await runSubscriptionJob(NOW);

    expect(sendTemplate).not.toHaveBeenCalled();
    expect(report.notified).toBe(0);
  });

  it("says nothing at all on a quiet day", async () => {
    rawReturns([workspace(1, -20)]);

    const report = await runSubscriptionJob(NOW);

    expect(sendTemplate).not.toHaveBeenCalled();
    expect(report.notified).toBe(0);
  });

  it("tells them the day writes stop", async () => {
    rawReturns([workspace(1, GRACE_DAYS)]);

    await runSubscriptionJob(NOW);

    expect(jest.mocked(sendTemplate).mock.calls[0][1]).toBe(
      SMS_TEMPLATES.AFTER_EXPIRY,
    );
  });

  it("deletes the data once the thirty days are up", async () => {
    rawReturns([workspace(1, DELETION_DAYS)]);

    const report = await runSubscriptionJob(NOW);

    expect(deleteWorkspaceData).toHaveBeenCalledWith(1);
    expect(report.deleted).toBe(1);
    // Nothing else applies: it is a tombstone now.
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it("leaves a never-expiring workspace completely alone", async () => {
    rawReturns([workspace(1, 900, true)]);

    const report = await runSubscriptionJob(NOW);

    expect(deleteWorkspaceData).not.toHaveBeenCalled();
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(report.deleted).toBe(0);
  });

  it("carries on past a workspace that fails", async () => {
    // A shop whose data cannot be removed must not leave every later
    // workspace unwarned — the whole point of wrapping each one.
    jest
      .mocked(deleteWorkspaceData)
      .mockRejectedValueOnce(new Error("db down"));

    const logged = jest.spyOn(console, "error").mockImplementation(() => {});
    rawReturns([workspace(1, DELETION_DAYS), workspace(2, -7)]);

    const report = await runSubscriptionJob(NOW);

    expect(report.failures).toBe(1);
    // The second workspace was still warned, which is what this is for.
    expect(report.notified).toBe(1);
    expect(report.deleted).toBe(0);

    logged.mockRestore();
  });

  it("opens each workspace's own context", async () => {
    rawReturns([workspace(1, -7), workspace(2, -1)]);

    await runSubscriptionJob(NOW);

    const ids = jest.mocked(runWithWorkspace).mock.calls.map((call) => call[0]);

    expect(new Set(ids)).toEqual(new Set([1, 2]));
  });
});

describe("settling payments the customer abandoned", () => {
  const abandoned = { workspace_id: 4, track_id: 999n };

  it("finishes one Zibal says was paid", async () => {
    rawReturns([], [abandoned]);
    jest.mocked(inquirePayment).mockResolvedValue({
      status: 2,
      amountRials: 19_900_000,
      paid: true,
    } as never);
    jest
      .mocked(settlePayment)
      .mockResolvedValue({ extended: true, expiresAt: new Date() } as never);

    const report = await runSubscriptionJob(NOW);

    expect(report.settled).toBe(1);
    expect(settlePayment).toHaveBeenCalledWith(4, 999n);
  });

  it("leaves a declined card alone", async () => {
    // Verify answers 202 both for a customer who wandered off and for a card
    // that failed, so the inquiry is what tells them apart.
    rawReturns([], [abandoned]);
    jest.mocked(inquirePayment).mockResolvedValue({
      status: 3,
      amountRials: 0,
      paid: false,
    } as never);

    const report = await runSubscriptionJob(NOW);

    expect(settlePayment).not.toHaveBeenCalled();
    expect(report.settled).toBe(0);
  });

  it("counts nothing for one already settled", async () => {
    rawReturns([], [abandoned]);
    jest.mocked(inquirePayment).mockResolvedValue({
      status: 1,
      amountRials: 19_900_000,
      paid: true,
    } as never);
    jest
      .mocked(settlePayment)
      .mockResolvedValue({ extended: false, expiresAt: null } as never);

    expect((await runSubscriptionJob(NOW)).settled).toBe(0);
  });

  it("carries on past one that throws", async () => {
    rawReturns([], [abandoned, { workspace_id: 5, track_id: 1000n }]);
    jest.mocked(inquirePayment).mockResolvedValue({
      status: 2,
      amountRials: 1,
      paid: true,
    } as never);
    jest
      .mocked(settlePayment)
      .mockRejectedValueOnce(new Error("gateway"))
      .mockResolvedValue({ extended: true, expiresAt: new Date() } as never);

    const logged = jest.spyOn(console, "error").mockImplementation(() => {});

    expect((await runSubscriptionJob(NOW)).settled).toBe(1);

    logged.mockRestore();
  });
});
