import prisma from "../lib/prisma";
import { runWithWorkspace } from "../lib/workspaceContext";
import { sendTemplate, SmsError } from "../lib/sms";
import type { SmsTemplate } from "../lib/sms";
import { errorMessage } from "./errors";
import type { Prisma } from "../generated/prisma/client";

/**
 * How long a new workspace gets before it has to pay. One month, no feature
 * restrictions — the trial is the product, not a reduced version of it.
 */
export const TRIAL_DAYS = 30;

/** Added to the referrer's own subscription once an invited shop pays. */
export const REFERRAL_REWARD_DAYS = 30;

/** Taken off the invited shop's first purchase. */
export const REFERRAL_DISCOUNT_PERCENT = 10;

/**
 * Writes keep working this long past expiry. Card payments in Iran fail
 * often enough that locking the shop out at the exact minute would turn
 * someone who is mid-payment into someone who has given up.
 */
export const GRACE_DAYS = 3;

/** Days after expiry before the workspace's tenant data is removed (8.7). */
export const DELETION_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Plain millisecond arithmetic rather than calendar month maths.
 *
 * Plans are sold in days (90, 180, 425), so there is no month to be
 * ambiguous about, and Iran has had no daylight saving since 2022 — nothing
 * here can land on a skipped or repeated hour.
 */
export function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * MS_PER_DAY);
}

/**
 * Derived from the generated client rather than written out, so a change to
 * the enum in schema.prisma is a compile error here rather than a string
 * that silently stops matching.
 */
type SubscriptionEventType =
  Prisma.SubscriptionEventUncheckedCreateInput["type"];

export type SubscriptionChange = {
  type: SubscriptionEventType;
  days: number;
  /** The payment that caused this, for `payment` events. */
  paymentId?: number;
  note?: string;
};

/**
 * The only place expiresAt ever changes.
 *
 * Every route in — the trial, a purchase, a referral reward, an operator
 * correction — comes through here, so every one of them leaves a
 * SubscriptionEvent behind. Without that, three of the four ways the date
 * moves would have no record at all, and "why does my subscription end then"
 * would be unanswerable.
 *
 * Takes a transaction client: reading the current expiry, writing the new
 * one and recording the event have to land together or not at all.
 */
export async function extendSubscription(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  change: SubscriptionChange,
): Promise<Date> {
  if (!Number.isInteger(change.days) || change.days <= 0) {
    // A zero would write an event that changes nothing; a negative one would
    // shorten a subscription somebody paid for. Neither is a thing any
    // caller means to do, so neither gets to happen quietly.
    throw new Error(
      `extendSubscription needs a positive whole number of days, got ${change.days}`,
    );
  }

  // FOR UPDATE, for the same reason the invoice counters take a row lock:
  // findUnique followed by update is a read and a write with a gap in
  // between, and two payments verifying at the same moment would both read
  // the old expiry and one of them would be thrown away. Rare — it needs a
  // double-click and two successful cards — but we decided both purchases
  // count, and this is what makes that true.
  //
  // Raw SQL, which carries no workspace context of its own: safe because
  // this function only ever runs inside a transaction that already set one
  // (RULES.md §7).
  const locked = await tx.$queryRaw<{ expires_at: Date | null }[]>`
    SELECT expires_at FROM workspaces WHERE id = ${workspaceId} FOR UPDATE
  `;

  if (locked.length === 0) {
    // Either the workspace is gone or the policy refused it. Both are bugs
    // in the caller rather than conditions to work around, and a silent
    // no-op here would be a payment that took money and extended nothing.
    throw new Error(
      `Cannot extend workspace ${workspaceId}: no such row in this context`,
    );
  }

  const previousExpiresAt = locked[0].expires_at;
  const now = new Date();

  // From today, or from the existing expiry when there is still time left.
  // Buying in month two of a three-month subscription adds to it rather than
  // replacing it — and a referral reward given to a workspace that lapsed
  // last week must not be spent in the past.
  const base =
    previousExpiresAt !== null && previousExpiresAt > now
      ? previousExpiresAt
      : now;

  const newExpiresAt = addDays(base, change.days);

  await tx.workspace.update({
    where: { id: workspaceId },
    data: {
      expiresAt: newExpiresAt,
      // Reporting only. The read-only guard (8.3) computes from expiresAt
      // and the clock and never reads this column, because a stored value is
      // only as fresh as the last cron run.
      status: change.type === "trial" ? "trial" : "active",
    },
  });

  await tx.subscriptionEvent.create({
    data: {
      workspaceId,
      type: change.type,
      days: change.days,
      previousExpiresAt,
      newExpiresAt,
      paymentId: change.paymentId,
      note: change.note,
    },
  });

  return newExpiresAt;
}

/**
 * The first event in a workspace's life, written by populateWorkspace so a
 * registered shop and a seeded one start identically.
 */
export function startTrial(
  tx: Prisma.TransactionClient,
  workspaceId: number,
): Promise<Date> {
  return extendSubscription(tx, workspaceId, {
    type: "trial",
    days: TRIAL_DAYS,
  });
}

/**
 * The super admin's number. Only theirs: they own the shop and the money
 * comes out of their pocket, while an admin who happens to have the app open
 * has no business receiving a billing message — and every extra recipient is
 * another SMS bought.
 *
 * Lives here rather than in subscriptionJob because it is not a property of
 * the nightly job: it is the answer to "who does a billing message go to",
 * which the payment path needs as much as the reminder path does.
 */
export async function ownerPhone(workspaceId: number): Promise<string | null> {
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
 * Sends one message to a workspace's owner, and never lets it matter.
 *
 * For the paths where the message is a courtesy rather than the point: a
 * customer whose card went through, and a referrer who has just earned
 * thirty days. Neither transaction may be undone because sms.ir was
 * unreachable, so every failure is swallowed — but every failure is also
 * LOGGED, which is the half that was missing. Debt 40 was invisible for a
 * month precisely because nothing anywhere said a word about it.
 *
 * ⚠️ Deliberately NOT used by subscriptionJob's notify(). That path writes a
 * ledger row between finding the number and sending, so it cannot collapse
 * into one call: a workspace with no super admin would claim the row and the
 * message would never go.
 */
export async function notifyOwner(
  workspaceId: number,
  template: SmsTemplate,
  parameters: Record<string, string> = {},
): Promise<boolean> {
  try {
    const phone = await ownerPhone(workspaceId);

    if (!phone) {
      console.error(
        `workspace ${workspaceId} has no active super admin; ${template} not sent`,
      );
      return false;
    }

    await sendTemplate(phone, template, parameters);
    return true;
  } catch (error) {
    console.error(
      `sms ${template} to workspace ${workspaceId} failed:`,
      error instanceof SmsError
        ? `status ${String(error.providerStatus)}: ${error.message}`
        : errorMessage(error),
    );
    return false;
  }
}
