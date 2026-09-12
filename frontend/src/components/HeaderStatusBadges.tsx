import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  ChatBubbleLeftRightIcon,
  CreditCardIcon,
} from "@heroicons/react/24/solid";
import { getSmsWallet } from "../api";
import { useAuth } from "../context/AuthContext";
import { useSubscription } from "../context/SubscriptionContext";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days left, rounded up: half a day remaining still reads as one. */
function daysLeft(expiresAt: string, now: number): number {
  return Math.ceil((new Date(expiresAt).getTime() - now) / MS_PER_DAY);
}

/** Below three messages' worth, a shop is about to be surprised. */
const WARN_AT_MESSAGES = 3;

/**
 * The four tones, and what each one is reserved for.
 *
 * Semantic pairs from `index.css`, not colours picked here — `bg-*-soft`
 * with its matching `*-fg`, the combination the tokens guarantee is legible
 * on both themes.
 *
 * ⚠️ «طلایی» is `warning`. There is no gold token and there should not be:
 * the brand stopped being gold, and the note in CLAUDE.md says a gold found
 * outside the chart palette is a leftover. `--warning` is the amber the app
 * already spends on «running out» — #e08700 light, #fbbf24 dark — which is
 * the gold this wants and is one colour rather than two.
 */
const TONES = {
  good: "bg-success-soft text-success-fg border-success/25 hover:bg-success-soft-hover",
  info: "bg-info-soft text-info-fg border-info/25 hover:bg-info-soft-hover",
  warn: "bg-warning-soft text-warning-fg border-warning/25 hover:bg-warning-soft-hover",
  bad: "bg-danger-soft text-danger-fg border-danger/25 hover:bg-danger-soft-hover",
} as const;

type Tone = keyof typeof TONES;

/**
 * Subscription and SMS credit, at a glance, in the header.
 *
 * ⚠️ Admins and above only — the same line SubscriptionBanner and
 * SmsBalanceBanner already draw, and for the same reason: neither of these
 * is a technician's business, and the header is on every screen they open.
 *
 * These do not replace the two banners. A badge is a resting state that says
 * where things stand; a banner interrupts. The banners still appear when
 * either number reaches the point of actually stopping work.
 *
 * Hidden below `md`, where the header has room for the title and the
 * controls and nothing else. Nothing is lost there: the banners are the
 * channel that matters on a phone, and both still render.
 */
export default function HeaderStatusBadges() {
  const { isAtLeast } = useAuth();
  const admin = isAtLeast("admin");

  if (!admin) return null;

  return (
    <div className="hidden md:flex items-center gap-1.5">
      <SubscriptionBadge />
      <SmsBalanceBadge />
    </div>
  );
}

function SubscriptionBadge() {
  const { status } = useSubscription();

  // Read once rather than on every render — Date.now() in a render body
  // makes the output depend on when React happened to re-run it, which the
  // react-hooks/purity rule refuses outright.
  const [now] = useState(() => Date.now());

  // Nothing to say until it has loaded. A badge that appears a moment later
  // is better than one that says the wrong thing first.
  if (!status) return null;

  let tone: Tone;
  let label: string;

  if (status.never_expires) {
    tone = "good";
    label = "اشتراک دائمی";
  } else if (status.status === "expired" || !status.expires_at) {
    tone = "bad";
    label = "اشتراک منقضی";
  } else {
    const remaining = daysLeft(status.expires_at, now);
    const days = `${remaining.toLocaleString("fa-IR")} روز`;

    if (remaining <= 0) {
      tone = "bad";
      label = "اشتراک منقضی";
    } else if (remaining <= 7) {
      // Gold, whether it is a trial or a paid month: a week out, which of
      // the two it is stops being the useful fact.
      tone = "warn";
      label = `${days} تا پایان اشتراک`;
    } else if (status.status === "trial") {
      tone = "info";
      label = `آزمایشی — ${days}`;
    } else {
      tone = "good";
      label = `اشتراک فعال — ${days}`;
    }
  }

  return (
    <Badge to="/subscription" tone={tone} label={label}>
      <CreditCardIcon className="w-4 h-4 shrink-0" />
    </Badge>
  );
}

function SmsBalanceBadge() {
  const location = useLocation();
  const [messagesLeft, setMessagesLeft] = useState<number | null>(null);

  /*
   * Re-read on navigation, not on a timer.
   *
   * The Layout outlives every route, so a fetch on mount alone would leave
   * this badge showing the credit as it stood when the shop signed in — past
   * a top-up and past a day's messages. Keying it to the path costs one
   * small GET per screen change and means the number is right whenever the
   * shop has just done anything.
   *
   * It is still a badge, not a live counter: sending from the device modal
   * does not navigate, so that one send shows up on the next screen rather
   * than immediately. The place that has to be exact is the wallet page,
   * which reads the balance itself.
   */
  useEffect(() => {
    let cancelled = false;

    // A failure leaves it null and the badge stays hidden, exactly as in
    // SmsBalanceBanner: a wallet endpoint that is briefly unhappy should not
    // put a figure in the header we could not actually read.
    getSmsWallet()
      .then(({ data }) => {
        if (!cancelled) setMessagesLeft(data.approximate_messages_left);
      })
      .catch(() => {
        if (!cancelled) setMessagesLeft(null);
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  if (messagesLeft === null) return null;

  const tone: Tone =
    messagesLeft <= 0 ? "bad" : messagesLeft <= WARN_AT_MESSAGES ? "warn" : "good";

  /*
   * A count, never a price and never a balance in tomans. The wallet page
   * dropped the per-message figure for the same reason: it is a tariff a
   * shop can do nothing about, and the header is the last place to print
   * one. «چند تا پیامک مانده» is the whole question.
   */
  const label =
    messagesLeft <= 0
      ? "اعتبار پیامکی تمام شد"
      : `${messagesLeft.toLocaleString("fa-IR")} پیامک`;

  return (
    <Badge to="/sms-wallet" tone={tone} label={label}>
      <ChatBubbleLeftRightIcon className="w-4 h-4 shrink-0" />
    </Badge>
  );
}

/**
 * The shape both wear.
 *
 * A link rather than a button: each one names a number, and the screen that
 * does something about that number is one click away. `title` carries the
 * label for the width where only the icon and the figure fit.
 */
function Badge({
  to,
  tone,
  label,
  children,
}: {
  to: string;
  tone: Tone;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
      title={label}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill border
                  text-body-xs font-bold whitespace-nowrap transition-colors
                  focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-primary/40 ${TONES[tone]}`}
    >
      {children}
      {label}
    </Link>
  );
}
