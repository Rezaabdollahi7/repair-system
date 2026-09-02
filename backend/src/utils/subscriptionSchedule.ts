import { DELETION_DAYS, GRACE_DAYS } from "./subscription";
import { SMS_TEMPLATES, type SmsTemplate } from "../lib/sms";
import type { Prisma } from "../generated/prisma/client";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

type NotificationKind =
  Prisma.SubscriptionNotificationUncheckedCreateInput["kind"];

/**
 * What the nightly job should do about one workspace, worked out from its
 * expiry alone.
 *
 * Pure, and separated from the job that carries it out, because everything
 * interesting here is arithmetic on dates and the alternative is testing it
 * through a database and an SMS provider.
 */
export interface ScheduleVerdict {
  /** Null when nothing is due today. */
  notify: {
    kind: NotificationKind;
    template: SmsTemplate;
    /** #DAYS#, absent for the template that takes no parameter. */
    days?: number;
  } | null;
  /** The status column should read this. Reporting only — see 8.3. */
  status: "active" | "expired";
  /** Tenant data is past its thirty days and should be removed. */
  deleteData: boolean;
}

/**
 * ⚠️ Whole days elapsed, floored, computed from timestamps rather than from
 * calendar dates. The job runs once a night at a fixed hour, so "days since
 * expiry" is stable between runs — which is what makes the notification
 * ledger's key meaningful.
 */
function daysSince(expiresAt: Date, now: Date): number {
  return Math.floor((now.getTime() - expiresAt.getTime()) / MS_PER_DAY);
}

export function verdictFor(
  workspace: { neverExpires: boolean; expiresAt: Date | null },
  now: Date = new Date(),
): ScheduleVerdict {
  const quiet: ScheduleVerdict = {
    notify: null,
    status: "active",
    deleteData: false,
  };

  // Ours and the demo accounts. Nothing is ever sent to them and nothing is
  // ever removed.
  if (workspace.neverExpires) {
    return quiet;
  }

  // Should be unreachable — app_create_workspace and startTrial run in one
  // transaction — but this job must not delete the data of a workspace whose
  // expiry it cannot read. The read-only guard already refuses its writes,
  // which is the safe half; this is the other half.
  if (workspace.expiresAt === null) {
    return quiet;
  }

  const elapsed = daysSince(workspace.expiresAt, now);

  // Still in date. Negative elapsed is days remaining.
  if (elapsed < 0) {
    const remaining = -elapsed;

    if (remaining === 7) {
      return {
        ...quiet,
        notify: {
          kind: "before_expiry_7",
          template: SMS_TEMPLATES.BEFORE_EXPIRY,
          days: 7,
        },
      };
    }

    if (remaining === 1) {
      return {
        ...quiet,
        notify: {
          kind: "before_expiry_1",
          template: SMS_TEMPLATES.BEFORE_EXPIRY,
          days: 1,
        },
      };
    }

    return quiet;
  }

  const expired = { status: "expired" as const, deleteData: false };

  if (elapsed >= DELETION_DAYS) {
    return { notify: null, status: "expired", deleteData: true };
  }

  // The day it ran out. The app keeps working for GRACE_DAYS, and the
  // message says so — a shop that finds out by being unable to save is a
  // shop that thinks the app is broken.
  if (elapsed === 0) {
    return {
      ...expired,
      notify: { kind: "on_expiry", template: SMS_TEMPLATES.ON_EXPIRY },
    };
  }

  // The day writes actually stop. Deliberately the same day the guard starts
  // refusing, not a day either side.
  if (elapsed === GRACE_DAYS) {
    return {
      ...expired,
      notify: {
        kind: "after_expiry_3",
        template: SMS_TEMPLATES.AFTER_EXPIRY,
        days: DELETION_DAYS - GRACE_DAYS,
      },
    };
  }

  // A week before the data goes. The last message anyone gets.
  if (elapsed === DELETION_DAYS - 7) {
    return {
      ...expired,
      notify: {
        kind: "after_expiry_23",
        template: SMS_TEMPLATES.AFTER_EXPIRY,
        days: 7,
      },
    };
  }

  return { ...expired, notify: null };
}
