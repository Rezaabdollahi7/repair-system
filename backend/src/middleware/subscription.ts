import type { NextFunction, Request, Response } from "express";
import prisma from "../lib/prisma";
import { GRACE_DAYS } from "../utils/subscription";

/**
 * Paths that stay open to a workspace whose subscription has lapsed.
 *
 * Full paths, matched against baseUrl + path — see the note in
 * requireWriteAccess about why the two have to be joined.
 *
 * Deliberately short. Everything on it is either a way to pay or a way to
 * stay signed in long enough to; a shop that has stopped paying should not
 * be able to keep entering repair jobs, and this list is the only thing
 * standing between those two readings.
 *
 * Most of /api/auth needs no entry at all: sign-up, login, refresh and the
 * OTP endpoints never reach authenticate(), so this guard never runs for
 * them. change-password does, and belongs here — the owner who is trying to
 * get back in to pay must not be locked out of their own account first.
 *
 * There is no entry for editing your own profile because there is no route
 * for it: personnel is admin-only and keyed by id, so a technician cannot
 * change their own name whether the workspace has lapsed or not. If that
 * ever gets its own route, it belongs here too.
 */
const OPEN_PATHS = [
  "/api/auth/change-password",
  // Built in 8.5. Listed now so the guard is complete when it lands rather
  // than being one edit away from locking a workspace out of paying.
  "/api/subscription",
];

/**
 * Methods that change nothing. A lapsed workspace keeps every screen it had:
 * the data stays visible, past exports stay downloadable, and only writing
 * stops.
 */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * 402 rather than 403.
 *
 * A technician hitting an admin-only route is forbidden; a shop whose
 * subscription ran out is not. The frontend has to tell those apart to show
 * "renew your subscription" instead of "you do not have access", and a
 * status code is a more reliable signal than a message string.
 */
const PAYMENT_REQUIRED = {
  error:
    "اشتراک شما به پایان رسیده است. برای ثبت اطلاعات جدید، اشتراک خود را تمدید کنید",
  code: "subscription_expired",
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Whether this workspace may still write.
 *
 * Computed from expiresAt and the clock every time, never from
 * Workspace.status: a stored column is only as fresh as the last cron run,
 * and a night the job fails must not hand every expired workspace another
 * day of writes. Authorization does not get to depend on a job having
 * succeeded.
 *
 * A null expiry reads as expired. app_create_workspace leaves it null and
 * startTrial fills it in one statement later, inside the same transaction,
 * so no workspace reaches the outside world without one — but if one ever
 * did, refusing writes is the direction that fails safe.
 */
export function mayWrite(workspace: {
  neverExpires: boolean;
  expiresAt: Date | null;
}): boolean {
  if (workspace.neverExpires) {
    return true;
  }

  if (workspace.expiresAt === null) {
    return false;
  }

  // The grace period. Card payments here fail often enough that cutting a
  // shop off at the exact minute would turn someone mid-payment into someone
  // who gave up.
  const deadline = workspace.expiresAt.getTime() + GRACE_DAYS * MS_PER_DAY;

  return Date.now() < deadline;
}

/**
 * Blocks writes from a workspace whose subscription has lapsed.
 *
 * Called at the end of authenticate() rather than mounted per route.
 * Thirteen route files each remembering to add it is exactly the shape of
 * the authorization gap in phase 10: five files were missing atLeast("admin")
 * and nothing failed, because a missing guard looks like no guard at all.
 * One call site cannot be forgotten.
 */
export async function requireWriteAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (READ_METHODS.has(req.method)) {
    next();
    return;
  }

  // ⚠️ baseUrl + path, not path alone.
  //
  // This runs inside a router mounted twice over (/api, then /personnel), so
  // req.path is relative to the innermost one: the caller of
  // /api/auth/change-password arrives here with req.path === "/change-password".
  // Matching that alone would open any route in any router that ever shared
  // the name; matching the full path against req.path would match nothing at
  // all and lock every workspace out. Neither failure announces itself.
  const fullPath = `${req.baseUrl ?? ""}${req.path ?? ""}`;

  // An empty path matches nothing on the list, so a request that arrives
  // without one is checked rather than waved through. That is the direction
  // to fail: a path this middleware cannot read is not a path it can
  // declare open.
  if (fullPath !== "" && OPEN_PATHS.some((open) => fullPath.startsWith(open))) {
    next();
    return;
  }

  // A real query on every write rather than a claim carried in the token.
  // Fifteen minutes of JWT lifetime would mean a shop that has just paid
  // stays locked for up to a quarter of an hour, and a workspace disabled by
  // hand carries on writing for the same. Writes are the minority of
  // requests, and being right matters more here than one round trip.
  const workspace = await prisma.workspace.findUnique({
    where: { id: req.user!.workspaceId },
    select: { neverExpires: true, expiresAt: true },
  });

  if (!workspace) {
    // RLS returned nothing for the caller's own workspace, which should be
    // impossible: the context was set from the same token. Refusing is the
    // safe reading, and the log line is here because if this ever fires it
    // is a bug in the context chain rather than a lapsed subscription.
    console.error(
      `No workspace row for ${req.user!.workspaceId} while checking write access`,
    );
    res.status(402).json(PAYMENT_REQUIRED);
    return;
  }

  if (!mayWrite(workspace)) {
    res.status(402).json(PAYMENT_REQUIRED);
    return;
  }

  next();
}
