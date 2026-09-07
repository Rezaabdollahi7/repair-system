import prisma from "../lib/prisma";
import { runWithWorkspace } from "../lib/workspaceContext";
import { sendTemplate, SmsError } from "../lib/sms";
import { inquirePayment } from "../lib/zibal";
import { settlePayment } from "../controllers/subscriptionController";
import { errorMessage } from "./errors";
import { ownerPhone } from "./subscription";
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

  // ⚠️ Through app_all_workspaces(), the fourth SECURITY DEFINER aperture,
  // and not a plain raw query. A raw query carries no workspace context, so
  // the policy on `workspaces` answered it with zero rows — silently, since
  // an empty result reports exactly like a night with nothing to do. That is
  // what it had been doing since 8.7 (debt 42).
  //
  // The function returns ids, flags and a date: no tenant data crosses a
  // boundary here, and every read that follows opens that workspace's own
  // context.
  const workspaces = await prisma.$queryRaw<
    {
      id: number;
      never_expires: boolean;
      expires_at: Date | null;
    }[]
  >`SELECT id, never_expires, expires_at FROM app_all_workspaces()`;

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
      // ⚠️ async with an await inside, not a bare arrow returning the query.
      // A PrismaPromise is lazy: an arrow that returns one lets fn() return
      // immediately, storage.run closes the context, and the query then
      // executes outside it — which the extension answers by throwing. The
      // integration suite caught exactly this in settleAbandonedPayments.
      const updated = await runWithWorkspace(row.id, async () =>
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

  // Tombstoned workspaces are already out of the list, and one deleted in
  // this very run has nothing left to settle.
  report.settled = await settleAbandonedPayments(
    workspaces.map((row) => row.id),
    now,
  );

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
 *
 * ⚠️ Deliberately not notifyOwner(): the ledger row is claimed between
 * finding the number and sending, so the two cannot collapse into one call.
 * A workspace with no super admin would claim the row and the message would
 * never go.
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
async function settleAbandonedPayments(
  workspaceIds: number[],
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - SETTLEMENT_WINDOW_DAYS * MS_PER_DAY);

  // Deliberately NOT a second aperture. Once the workspace list exists, an
  // ordinary query inside each workspace's own context answers this — and
  // RULES.md §7 asks a new SECURITY DEFINER function to say why no ordinary
  // query could. Here one can, so there is nothing to say.
  //
  // The cost is one query per workspace instead of one in total: 500 indexed
  // queries, once a night. The benefit is one name in the aperture list
  // rather than two, and every name there has to be defended forever.
  //
  // ⚠️ A tombstoned workspace is not in this list, so a payment left pending
  // on one is never settled. Accepted: a deleted workspace is an operator's
  // problem, not a nightly job's.
  let settled = 0;

  for (const workspaceId of workspaceIds) {
    const pending = await runWithWorkspace(workspaceId, async () =>
      prisma.payment.findMany({
        where: {
          status: { in: ["pending", "paid"] },
          trackId: { not: null },
          createdAt: { gt: since },
        },
        orderBy: { id: "asc" },
        select: { trackId: true },
      }),
    );

    for (const row of pending) {
      // Narrowed here rather than with ! at each use: the where clause
      // already excludes nulls, but the type does not know that.
      const trackId = row.trackId;

      if (trackId === null) {
        continue;
      }

      try {
        // Asked before confirmed: verify answers 202 both for a customer who
        // wandered off and for a card that was declined, and only one of
        // those is worth acting on.
        const inquiry = await inquirePayment(trackId);

        if (!inquiry.paid) {
          continue;
        }

        const result = await runWithWorkspace(workspaceId, async () =>
          settlePayment(workspaceId, trackId),
        );

        if (result.extended) {
          settled += 1;
        }
      } catch (error) {
        console.error(
          `settling payment ${trackId} failed:`,
          errorMessage(error),
        );
      }
    }
  }

  return settled;
}
