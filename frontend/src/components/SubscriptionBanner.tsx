import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { useAuth } from "../context/AuthContext";
import { useSubscription } from "../context/SubscriptionContext";
import { transition } from "../motion";

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
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={transition.base}
      role={expired ? "alert" : "status"}
      className={`flex items-center gap-3 px-4 py-3 rounded-card mb-4 border ${
        expired
          ? "bg-danger-soft border-danger/25 text-danger-fg"
          : "bg-warning-soft border-warning/25 text-warning-fg"
      }`}
    >
      <span
        className={`shrink-0 w-9 h-9 rounded-field flex items-center justify-center ${
          expired ? "bg-danger/15" : "bg-warning/15"
        }`}
      >
        <ExclamationTriangleIcon className="w-5 h-5" />
      </span>

      <span className="text-body-sm flex-1">{message}</span>

      {/*
        Inherits the banner's own text colour instead of filling with
        --danger or --warning. White on #f59e0b is 2.1:1 — the one
        combination in this file that could not be read at all.
      */}
      <Link
        to="/subscription"
        className="shrink-0 text-body-sm font-bold px-3.5 py-2 rounded-field
                   bg-surface/70 border border-current/20 hover:bg-surface transition-colors"
      >
        تمدید اشتراک
      </Link>
    </motion.div>
  );
}
