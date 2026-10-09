/**
 * The job against a real database, which is the only place this class of bug
 * is visible.
 *
 * Debt 42 lived for a month behind a mocked $queryRaw: the unit suite handed
 * the job whatever rows it asked for, so it never once discovered that in
 * production the query returned none. A test that builds the state it then
 * asserts on cannot ask whether the real code can reach that state.
 */
import { runSubscriptionJob } from "../../utils/subscriptionJob";
import { owner, truncateAll, seedTwoWorkspaces } from "./helpers";
import type { TwoWorkspaces } from "./helpers";

// sms.ir is the one thing here that must not be real. Everything else —
// the policies, the aperture, the context switching — is the point.
jest.mock("../../lib/sms", () => ({
  ...jest.requireActual("../../lib/sms"),
  sendTemplate: jest.fn().mockResolvedValue({ messageId: 1, cost: 1 }),
}));

jest.mock("../../lib/zibal", () => ({
  __esModule: true,
  inquirePayment: jest.fn().mockResolvedValue({ paid: false }),
}));

import { sendTemplate } from "../../lib/sms";

const DAY = 24 * 60 * 60 * 1000;

let workspaces: TwoWorkspaces;

beforeEach(async () => {
  jest.clearAllMocks();
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
});

afterAll(async () => {
  await owner.$disconnect();
});

/** Moves a workspace's expiry, as the owner: the app role cannot. */
async function setExpiry(workspaceId: number, daysFromNow: number) {
  await owner.workspace.update({
    where: { id: workspaceId },
    data: { expiresAt: new Date(Date.now() + daysFromNow * DAY) },
  });
}

describe("the job can see the workspaces at all", () => {
  it("walks every live workspace, not zero of them", async () => {
    // THE test. Before the aperture, the raw query over `workspaces` ran
    // with no context and the policy returned nothing, so the loop body
    // never executed — and the report read exactly like a quiet night.
    await setExpiry(workspaces.a.workspaceId, 7);
    await setExpiry(workspaces.b.workspaceId, 7);

    const report = await runSubscriptionJob();

    expect(report.notified).toBe(2);
    expect(report.failures).toBe(0);
  });

  it("sends to each workspace's own super admin", async () => {
    // Proof the context switching still works: the phone numbers can only
    // come from inside two different workspaces.
    await setExpiry(workspaces.a.workspaceId, 7);
    await setExpiry(workspaces.b.workspaceId, 7);

    await runSubscriptionJob();

    const recipients = jest
      .mocked(sendTemplate)
      .mock.calls.map((call) => call[0]);

    expect(new Set(recipients)).toEqual(
      new Set(["09120000001", "09120000002"]),
    );
  });

  it("writes the notification rows the ledger depends on", async () => {
    await setExpiry(workspaces.a.workspaceId, 7);

    await runSubscriptionJob();

    const rows = await owner.subscriptionNotification.findMany({
      where: { workspaceId: workspaces.a.workspaceId },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].kind).toBe("before_expiry_7");
  });

  it("sends nothing the second time it runs", async () => {
    // Idempotency against the real composite unique, not a mocked rejection.
    await setExpiry(workspaces.a.workspaceId, 7);

    await runSubscriptionJob();
    jest.clearAllMocks();
    const second = await runSubscriptionJob();

    expect(sendTemplate).not.toHaveBeenCalled();
    expect(second.notified).toBe(0);
  });

  it("skips a tombstoned workspace", async () => {
    await setExpiry(workspaces.a.workspaceId, 7);
    await setExpiry(workspaces.b.workspaceId, 7);
    await owner.workspace.update({
      where: { id: workspaces.b.workspaceId },
      data: { deletedAt: new Date(), status: "deleted" },
    });

    const report = await runSubscriptionJob();

    expect(report.notified).toBe(1);
  });

  it("leaves a never-expiring workspace alone", async () => {
    await setExpiry(workspaces.a.workspaceId, 7);
    await owner.workspace.update({
      where: { id: workspaces.a.workspaceId },
      data: { neverExpires: true },
    });

    const report = await runSubscriptionJob();

    expect(sendTemplate).not.toHaveBeenCalled();
    expect(report.notified).toBe(0);
  });

  it("updates the status column it could never reach before", async () => {
    // Reporting only — the guard computes from expiresAt — but it is the
    // half of the loop that has nothing to do with SMS, so it isolates the
    // aperture from the notification path.
    await setExpiry(workspaces.a.workspaceId, -10);

    const report = await runSubscriptionJob();

    expect(report.statusUpdated).toBeGreaterThan(0);

    const row = await owner.workspace.findUniqueOrThrow({
      where: { id: workspaces.a.workspaceId },
    });

    expect(row.status).toBe("expired");
  });
});
