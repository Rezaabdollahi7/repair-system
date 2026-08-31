import { useState } from "react";
import { Link } from "react-router-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { useAuth } from "../context/AuthContext";
import { useSubscription } from "../context/SubscriptionContext";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up: half a day remaining still reads as one. */
function daysLeft(expiresAt: string, now: number): number {
  return Math.ceil((new Date(expiresAt).getTime() - now) / MS_PER_DAY);
}

/**
 * The countdown that sits above every page.
 *
 * ⚠️ Shown only to admins and above. A technician has nothing to do with
 * what the shop pays, and putting a bill in front of an employee every day
 * is neither useful nor their business — the read-only guard already tells
 * them plainly enough when writing stops.
 */
export default function SubscriptionBanner() {
  const { isAtLeast } = useAuth();
  const { status } = useSubscription();

  // ⚠️ Before the early returns: hooks cannot be called conditionally, and
  // every branch below returns without one otherwise.
  //
  // Read once rather than on every render — Date.now() in a render body
  // makes the output depend on when React happened to re-run it, which the
  // react-hooks/purity rule refuses outright.
  const [now] = useState(() => Date.now());

  if (!isAtLeast("admin") || !status || status.never_expires) {
    return null;
  }

  if (!status.expires_at) {
    return null;
  }

  const remaining = daysLeft(status.expires_at, now);

  // Quiet until the last week. A banner that is always there is a banner
  // nobody reads by the time it matters.
  if (remaining > 7) {
    return null;
  }

  const expired = remaining <= 0;

  const message = expired
    ? "اشتراک شما به پایان رسیده است. برای ادامه‌ی کار، اشتراک خود را تمدید کنید."
    : `${remaining} روز تا پایان اشتراک شما باقی مانده است.`;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl mb-4 ${
        expired
          ? "bg-danger-soft text-danger"
          : "bg-warning-soft text-text-primary"
      }`}
    >
      <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />
      <span className="text-sm flex-1">{message}</span>
      <Link
        to="/subscription"
        className="text-sm font-medium underline shrink-0"
      >
        تمدید اشتراک
      </Link>
    </div>
  );
}
