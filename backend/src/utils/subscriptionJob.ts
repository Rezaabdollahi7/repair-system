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
 * How far back the sweep will still finish a payment.
 *
 * A payment older than this whose money did move is not settled
 * automatically: a customer surprised by a subscription starting three weeks
 * after they gave up is worse served than one who gets a phone call. It is
 * logged instead, loudly, because money that left an account and bought
 * nothing is an operator's problem and must not be silent.
 */
const SETTLEMENT_WINDOW_DAYS = 7;

/**
 * How long a payment is left alone before an unpaid one is written off.
 *
 * Zibal holds a payment session open for roughly fifteen to twenty minutes.
 * An hour clears that with room to spare, so a customer still typing a second
 * password is never told their payment failed — and since the job runs
 * nightly, in practice every row has had hours.
 */
const ABANDON_AFTER_MS = 60 * 60 * 1000;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface JobReport {
  notified: number;
  statusUpdated: number;
  deleted: number;
  settled: number;
  /** Rows written off because Zibal says the money never moved. */
  closed: number;
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
    closed: 0,
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
  const outcome = await resolveOpenPayments(
    workspaces.map((row) => row.id),
    now,
  );

  report.settled = outcome.settled;
  report.closed = outcome.closed;

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

interface PaymentOutcome {
  settled: number;
  closed: number;
}

/**
 * Gives every payment still open an ending.
 *
 * Two different problems wear the same `pending` status, and only asking
 * Zibal tells them apart. The money moved and nobody confirmed it — the
 * browser never came back to the callback page, which is otherwise the only
 * thing that triggers verification. Or the money never moved at all, because
 * the customer looked at the gateway and closed the tab.
 *
 * The first is finished. The second is written off, because a row nothing
 * ever touches again reads on the customer's payment history as a purchase
 * forever in progress.
 *
 * ⚠️ There is no date filter on the query, deliberately. The old seven-day
 * window kept it bounded, and also kept it from ever seeing the rows it most
 * needed to see. Closing the unpaid ones bounds it far better: each is
 * resolved on the first nightly run after its hour is up and never returns,
 * so on any ordinary night this reads a handful of rows from that same day.
 */
async function resolveOpenPayments(
  workspaceIds: number[],
  now: Date,
): Promise<PaymentOutcome> {
  const settlementSince = new Date(
    now.getTime() - SETTLEMENT_WINDOW_DAYS * MS_PER_DAY,
  );
  const abandonedBefore = new Date(now.getTime() - ABANDON_AFTER_MS);

  const outcome: PaymentOutcome = { settled: 0, closed: 0 };

  // Deliberately NOT a second aperture. Once the workspace list exists, an
  // ordinary query inside each workspace's own context answers this — and
  // RULES.md §7 asks a new SECURITY DEFINER function to say why no ordinary
  // query could. Here one can, so there is nothing to say.
  //
  // The cost is one query per workspace instead of one in total: 500 indexed
  // queries, once a night. The benefit is one name in the aperture list
  // rather than two, and every name there has to be defended forever.
  //
  // ⚠️ A tombstoned workspace is not in this list, so a payment left open on
  // one is never resolved. Accepted: a deleted workspace is an operator's
  // problem, not a nightly job's.
  for (const workspaceId of workspaceIds) {
    const open = await runWithWorkspace(workspaceId, async () =>
      prisma.payment.findMany({
        where: {
          status: { in: ["pending", "paid"] },
          trackId: { not: null },
        },
        orderBy: { id: "asc" },
        select: { id: true, trackId: true, createdAt: true },
      }),
    );

    for (const row of open) {
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
          // Still inside the hour. The customer may be on the gateway right
          // now, and telling them their payment failed while they are typing
          // would be both wrong and unrecoverable.
          if (row.createdAt >= abandonedBefore) {
            continue;
          }

          const written = await runWithWorkspace(workspaceId, async () =>
            prisma.payment.updateMany({
              // Status repeated in the where clause, not just the id: the
              // browser could have verified this row in the seconds since it
              // was read, and overwriting a verified payment with `failed`
              // would take away a subscription that was paid for.
              where: { id: row.id, status: { in: ["pending", "paid"] } },
              data: {
                status: "failed",
                failureReason: `abandoned: Zibal reports status ${inquiry.status}, money never moved`,
              },
            }),
          );

          outcome.closed += written.count;
          continue;
        }

        // Paid, but too old to finish quietly. Not settled and not closed:
        // the money is real, and an automatic extension weeks later is the
        // surprise the window exists to prevent. Logged every night until an
        // operator deals with it, which is the point — this is somebody's
        // money sitting against nothing.
        if (row.createdAt < settlementSince) {
          console.error(
            `payment ${row.id} (workspace ${workspaceId}, track ${trackId}) was paid ` +
              `on ${row.createdAt.toISOString()} and is past the ${SETTLEMENT_WINDOW_DAYS}-day ` +
              `settlement window — needs settling by hand`,
          );
          continue;
        }

        const result = await runWithWorkspace(workspaceId, async () =>
          settlePayment(workspaceId, trackId),
        );

        if (result.extended) {
          outcome.settled += 1;
        }
      } catch (error) {
        console.error(
          `resolving payment ${row.id} (track ${trackId}) failed:`,
          errorMessage(error),
        );
      }
    }
  }

  return outcome;
}
