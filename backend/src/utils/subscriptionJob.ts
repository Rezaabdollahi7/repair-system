import prisma from "../lib/prisma";
import { runWithWorkspace } from "../lib/workspaceContext";
import { sendTemplate, SmsError } from "../lib/sms";
import { inquirePayment } from "../lib/zibal";
import { settlePayment } from "../controllers/subscriptionController";
import { errorMessage } from "./errors";
import { verdictFor } from "./subscriptionSchedule";
import { deleteWorkspaceData } from "./workspaceDeletion";

/**
 * How far back the settlement sweep looks.
 *
 * A payment older than this that is still unverified is one Zibal will have
 * long since abandoned; chasing it forever would mean a query that grows
 * without bound and a customer being surprised by a subscription starting
 * weeks after they gave up.
 */
const SETTLEMENT_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface JobReport {
  notified: number;
  statusUpdated: number;
  deleted: number;
  settled: number;
  failures: number;
}

/**
 * The super admin's number. Only theirs: they own the shop and the money
 * comes out of their pocket, while an admin who happens to have the app open
 * has no business receiving a billing message — and every extra recipient is
 * another SMS bought.
 */
async function ownerPhone(workspaceId: number): Promise<string | null> {
  return runWithWorkspace(workspaceId, async () => {
    const owner = await prisma.user.findFirst({
      where: { isActive: true, role: { name: "super_admin" } },
      orderBy: { id: "asc" },
      select: { username: true },
    });

    return owner?.username ?? null;
  });
}

/**
 * Walks every workspace and does whatever its expiry calls for.
 *
 * ⚠️ One workspace failing must not stop the rest. A shop whose owner was
 * deleted, or whose number sms.ir refuses, cannot be allowed to leave every
 * later workspace unwarned — so each is wrapped, counted and carried past.
 */
export async function runSubscriptionJob(
  now: Date = new Date(),
): Promise<JobReport> {
  const report: JobReport = {
    notified: 0,
    statusUpdated: 0,
    deleted: 0,
    settled: 0,
    failures: 0,
  };

  // The owner connection is not available here: this runs as the application
  // role like everything else, and workspaces carries a policy scoped to the
  // current context. Read through a raw query for exactly that reason — it
  // is the one place a job legitimately needs to see every tenant.
  //
  // ⚠️ Safe because it selects nothing but ids and flags: no tenant data
  // crosses a boundary, and every subsequent read opens that workspace's own
  // context.
  const workspaces = await prisma.$queryRaw<
    {
      id: number;
      never_expires: boolean;
      expires_at: Date | null;
    }[]
  >`
  SELECT id, never_expires, expires_at
  FROM workspaces
  WHERE deleted_at IS NULL
  ORDER BY id
`;

  for (const row of workspaces) {
    try {
      const verdict = verdictFor(
        { neverExpires: row.never_expires, expiresAt: row.expires_at },
        now,
      );

      if (verdict.deleteData) {
        await deleteWorkspaceData(row.id);
        report.deleted += 1;
        // Nothing else applies: the workspace is a tombstone now.
        continue;
      }

      if (verdict.notify) {
        const sent = await notify(row.id, row.expires_at!, verdict.notify);
        if (sent) {
          report.notified += 1;
        }
      }

      // Written after the message, not before: reporting a workspace as
      // expired while its warning failed to send would be the wrong half to
      // have succeeded.
      const updated = await runWithWorkspace(row.id, () =>
        prisma.workspace.updateMany({
          where: { id: row.id, status: { not: verdict.status } },
          data: { status: verdict.status },
        }),
      );

      report.statusUpdated += updated.count;
    } catch (error) {
      report.failures += 1;
      console.error(`workspace ${row.id} failed:`, errorMessage(error));
    }
  }

  report.settled = await settleAbandonedPayments(now);

  return report;
}

/**
 * Sends one message, unless it has already been sent.
 *
 * The ledger is keyed on the expiry it was sent about, so a job run twice in
 * one night sends nothing twice while a renewal opens a fresh set. Written
 * BEFORE the message: a duplicate SMS costs money and looks careless, while
 * a message recorded but not sent costs one warning — and the next one is
 * days away either way.
 */
async function notify(
  workspaceId: number,
  expiresAt: Date,
  notify: NonNullable<ReturnType<typeof verdictFor>["notify"]>,
): Promise<boolean> {
  const phone = await ownerPhone(workspaceId);

  if (!phone) {
    console.error(`workspace ${workspaceId} has no active super admin`);
    return false;
  }

  const claimed = await runWithWorkspace(workspaceId, async () => {
    try {
      await prisma.subscriptionNotification.create({
        data: {
          workspaceId,
          kind: notify.kind,
          expiresAtSnapshot: expiresAt,
        },
      });
      return true;
    } catch {
      // The composite unique refused it: already sent. Not an error.
      return false;
    }
  });

  if (!claimed) {
    return false;
  }

  try {
    await sendTemplate(
      phone,
      notify.template,
      notify.days === undefined ? {} : { DAYS: String(notify.days) },
    );
    return true;
  } catch (error) {
    // Logged, not rethrown: a number sms.ir refuses is one workspace's
    // problem, and the row stays so we do not try that number nightly.
    console.error(
      `sms to workspace ${workspaceId} (${notify.kind}) failed:`,
      error instanceof SmsError
        ? `status ${String(error.providerStatus)}: ${error.message}`
        : errorMessage(error),
    );
    return false;
  }
}

/**
 * Finishes payments whose customer never came back.
 *
 * The money left their account and Zibal is holding it unverified. Without
 * this they would be phone calls — and the app has no other way to notice,
 * since the only thing that normally triggers verification is the browser
 * returning to the callback page.
 */
async function settleAbandonedPayments(now: Date): Promise<number> {
  const since = new Date(now.getTime() - SETTLEMENT_WINDOW_DAYS * MS_PER_DAY);

  // Same raw-query reasoning as above: payments carries a workspace policy,
  // and this job is looking across all of them. Only ids come back.
  type PendingRow = { workspace_id: number; track_id: bigint };

  const pending = await prisma.$queryRaw<PendingRow[]>`
    SELECT workspace_id, track_id
    FROM payments
    WHERE status IN ('pending', 'paid')
      AND track_id IS NOT NULL
      AND created_at > ${since}
    ORDER BY id
  `;

  let settled = 0;

  for (const row of pending) {
    try {
      // Asked before confirmed: verify answers 202 both for a customer who
      // wandered off and for a card that was declined, and only one of those
      // is worth acting on.
      const inquiry = await inquirePayment(row.track_id);

      if (!inquiry.paid) {
        continue;
      }

      const result = await runWithWorkspace(row.workspace_id, () =>
        settlePayment(row.workspace_id, row.track_id),
      );

      if (result.extended) {
        settled += 1;
      }
    } catch (error) {
      console.error(
        `settling payment ${row.track_id} failed:`,
        errorMessage(error),
      );
    }
  }

  return settled;
}
