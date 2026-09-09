import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowLeftIcon,
  CheckIcon,
  CreditCardIcon,
  DocumentTextIcon,
  GiftIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";
import StatusPill from "../components/StatusPill";
import { toPersianDigits } from "../utils/formatters";
import {
  actionView,
  searchField,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  tr,
} from "../utils/tableClasses";
import { getPaymentHistory, getQuote, startCheckout } from "../api";
import PaymentReceipt from "../components/PaymentReceipt";
import { useSubscription } from "../context/SubscriptionContext";
import { staggerContainer, staggerItem } from "../motion";
import type {
  QuoteResponse,
  SubscriptionPayment,
  SubscriptionPlan,
} from "../types/api";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Rials in the database, tomans on screen — the whole app works this way. */
function toToman(rials: number): string {
  return (rials / 10).toLocaleString("fa-IR");
}

/**
 * The same, for a figure that is already an average.
 *
 * A per-month rate divides by a day count and rarely lands on a whole rial,
 * so rounding it as rials and then dividing by ten produced «ماهی ۳۲۷٬۹۴۵٫۲
 * تومان» — a tenth of a toman, a unit that does not exist. Rounding happens
 * after the conversion, not before.
 */
function toTomanRounded(rials: number): string {
  return Math.round(rials / 10).toLocaleString("fa-IR");
}

function jalali(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}

/**
 * A gateway payment's state.
 *
 * Badges rather than coloured text, like every other status in the app —
 * these were bare `text-success-fg` / `text-danger-fg` spans, which read as
 * emphasis rather than as a state. Severities, so they take the reserved
 * tones: verified is good, failed is not, and the two in-between are neither
 * yet.
 */
const PAYMENT_STATES: Record<
  string,
  { label: string; color: string; tone: string }
> = {
  pending: {
    label: "در انتظار پرداخت",
    color: "var(--warning)",
    tone: "bg-warning-soft text-warning-fg",
  },
  paid: {
    label: "پرداخت‌شده، در حال تأیید",
    color: "var(--info)",
    tone: "bg-info-soft text-info-fg",
  },
  verified: {
    label: "موفق",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
  failed: {
    label: "ناموفق",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
};

function paymentStateOf(status: string) {
  return (
    PAYMENT_STATES[status] ?? {
      label: status,
      color: "var(--text-muted)",
      tone: "bg-surface-alt text-text-secondary",
    }
  );
}

/**
 * What the workspace's own subscription state is called, and how urgent it is.
 *
 * The page used to say none of this: it printed an end date and a day count
 * and left the reader to work out whether that was fine. Trial and active are
 * the same *shape* of good news and different news, and expired is the one
 * that needs answering today.
 */
const WORKSPACE_STATES: Record<
  string,
  { label: string; tone: "accent" | "success" | "danger" }
> = {
  trial: { label: "دورهٔ آزمایشی", tone: "accent" },
  active: { label: "اشتراک فعال", tone: "success" },
  expired: { label: "اشتراک پایان‌یافته", tone: "danger" },
  deleted: { label: "کارگاه حذف‌شده", tone: "danger" },
};

/**
 * A plan, with the two numbers the plan list itself does not carry.
 *
 * `perMonth` is the whole point of showing four durations at once, and the
 * page did not compute it — four prices for four different lengths of time
 * cannot be compared by looking at them, so the cards were asking the reader
 * to divide in their head. `saving` measures each plan against the most
 * expensive month in the list, which is the monthly plan by construction.
 */
interface PricedPlan extends SubscriptionPlan {
  perMonth: number;
  saving: number;
  best: boolean;
}

function price(plans: SubscriptionPlan[]): PricedPlan[] {
  const withRate = plans.map((plan) => ({
    ...plan,
    perMonth: (plan.amount_rials / plan.duration_days) * 30,
  }));

  const dearest = Math.max(...withRate.map((p) => p.perMonth), 0);
  const cheapest = Math.min(...withRate.map((p) => p.perMonth), Infinity);

  return withRate.map((plan) => ({
    ...plan,
    saving: dearest > 0 ? 1 - plan.perMonth / dearest : 0,
    // Only when something is actually cheaper — with one plan in the list,
    // or four at the same rate, nothing is "the best value".
    best: plan.perMonth === cheapest && cheapest < dearest,
  }));
}

export default function Subscription() {
  const { status } = useSubscription();
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [receipt, setReceipt] = useState<SubscriptionPayment | null>(null);
  // Read once rather than on every render. A countdown measured in days does
  // not need the clock live, and calling Date.now() during render makes the
  // component's output depend on when React happened to re-run it.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    getPaymentHistory()
      .then(({ data }) => setPayments(data))
      .catch(() => setPayments([]));
  }, []);

  // Re-priced whenever the plan or the code changes, so the customer sees
  // what they will pay before leaving for the gateway rather than after.
  //
  // Debounced: this fires on every keystroke in the code field otherwise,
  // and each one is a round trip.
  useEffect(() => {
    if (!selected) {
      setQuote(null);
      return;
    }

    const code = discountCode.trim();
    setQuoting(true);

    const timer = setTimeout(() => {
      getQuote({ plan_code: selected, discount_code: code || undefined })
        .then(({ data }) => setQuote(data))
        .catch(() => setQuote(null))
        .finally(() => setQuoting(false));
    }, 400);

    return () => {
      clearTimeout(timer);
      setQuoting(false);
    };
  }, [selected, discountCode]);

  const plans = useMemo(() => price(status?.plans ?? []), [status?.plans]);

  const remaining =
    status?.expires_at === null || status?.expires_at === undefined
      ? null
      : Math.ceil((new Date(status.expires_at).getTime() - now) / MS_PER_DAY);

  async function handleCheckout(plan: SubscriptionPlan) {
    setSubmitting(true);

    try {
      const { data } = await startCheckout({
        plan_code: plan.code,
        discount_code: discountCode.trim() || undefined,
      });

      // ⚠️ A full navigation, not fetch and not an <a> opened in a new tab.
      // Zibal refuses to open the gateway unless the request carries a
      // Referer matching the registered domain, and only a real navigation
      // from this origin sends one.
      window.location.href = data.redirect_url;
    } catch (error) {
      const message =
        typeof error === "object" &&
        error !== null &&
        "response" in error &&
        typeof (error as { response?: { data?: { error?: string } } }).response
          ?.data?.error === "string"
          ? (error as { response: { data: { error: string } } }).response.data
              .error
          : "ارتباط با درگاه پرداخت برقرار نشد. دوباره تلاش کنید";

      toast.error(message);
      setSubmitting(false);
    }
  }

  if (!status) {
    return (
      <div dir="rtl" className="animate-pulse space-y-5">
        <div className="h-40 rounded-panel bg-surface-alt" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((card) => (
            <div
              key={card}
              className="h-56 rounded-panel border border-border bg-surface"
            />
          ))}
        </div>
        <div className="h-32 rounded-panel border border-border bg-surface" />
      </div>
    );
  }

  const state = WORKSPACE_STATES[status.status] ?? {
    label: status.status,
    tone: "accent" as const,
  };
  const expired = remaining !== null && remaining <= 0;
  const chosen = plans.find((plan) => plan.code === selected) ?? null;

  return (
    <div dir="rtl" className="space-y-6">
      {/*
        The status panel.
        ------------------------------------------------------------------
        The dark card the rest of the app spends once per screen, and this
        is the screen's one figure worth that treatment: how long the shop
        has left. It was a bordered white box with the number written inline
        in a sentence, at the same size as the sentence.

        `--accent` is overridden inside it for the same reason the dashboard's
        dark chart card overrides it: the light theme's accent is a deep blue
        built to carry white text, and on near-black it measures 2.55:1.
      */}
      <section
        className="relative overflow-hidden rounded-panel border border-panel-ink-border
                   bg-panel-ink p-5 sm:p-6
                   [--accent:#6ea8fa] [--text-primary:#f1f3f8] [--text-secondary:#b4b9c6]"
      >
        {/* A wash of the state's own colour, from the corner the numbers are
            not in. Decorative, and the only decoration on the page. */}
        <div
          className="pointer-events-none absolute inset-0 -z-0"
          style={{
            background: `radial-gradient(120% 140% at 12% -20%, ${
              expired ? "var(--danger)" : "var(--accent)"
            } 0%, transparent 62%)`,
            opacity: 0.22,
          }}
          aria-hidden="true"
        />

        {/*
          Three columns with rules between them rather than two ends of a
          justify-between row. At laptop width that put the state on one edge
          and the countdown on the other with two-thirds of the panel empty
          in between — a status *bar* stretched to hero height. Each column
          now holds one fact, and they sit together.
        */}
        <div
          className="relative grid gap-5 sm:grid-cols-3 sm:gap-0
                     sm:divide-x sm:divide-x-reverse sm:divide-on-dark/10"
        >
          <div className="min-w-0 sm:pe-6">
            <p className="text-body-xs text-text-secondary">وضعیت</p>
            <div className="mt-2">
              <StatusPill
                label={state.label}
                color={
                  expired
                    ? "var(--danger)"
                    : state.tone === "success"
                      ? "var(--success)"
                      : "var(--accent)"
                }
                tone={
                  expired || state.tone === "danger"
                    ? "bg-danger-soft text-danger-fg"
                    : state.tone === "success"
                      ? "bg-success-soft text-success-fg"
                      : "bg-accent/15 text-accent"
                }
              />
            </div>
          </div>

          <div className="min-w-0 sm:px-6">
            <p className="text-body-xs text-text-secondary">تاریخ پایان</p>
            <p className="mt-2 text-body-lg font-bold text-text-primary">
              {status.never_expires
                ? "بدون محدودیت"
                : status.expires_at
                  ? jalali(status.expires_at)
                  : "ثبت نشده"}
            </p>
          </div>

          {/*
            The day count at display size, in tabular figures so it does not
            jiggle. A permanent subscription gets a word instead of a number
            rather than a zero or a dash — there is nothing to count.
          */}
          <div className="min-w-0 sm:ps-6">
            <p className="text-body-xs text-text-secondary">اعتبار</p>
            {status.never_expires || remaining === null ? (
              <p className="mt-2 text-body-lg font-bold text-text-primary">
                دائمی
              </p>
            ) : expired ? (
              <p className="mt-2 text-title-md font-bold text-danger-fg">
                به پایان رسیده
              </p>
            ) : (
              <p className="mt-1 flex items-baseline gap-2">
                <span className="text-display-sm font-bold tabular-nums text-text-primary">
                  {toPersianDigits(remaining)}
                </span>
                <span className="text-body-sm text-text-secondary">روز</span>
              </p>
            )}
          </div>
        </div>

        {status.referral_applies && (
          <p className="relative mt-5 inline-flex items-center gap-2 rounded-pill bg-success-soft px-3.5 py-1.5 text-body-sm font-bold text-success-fg">
            <GiftIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
            تخفیف ۱۰٪ دعوت روی اولین خرید اعمال شده
          </p>
        )}
      </section>

      {/* ── Plans ───────────────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-title-md font-bold text-text-primary">
              {expired ? "فعال‌سازی اشتراک" : "تمدید اشتراک"}
            </h2>
            <p className="mt-0.5 text-body-sm text-text-secondary">
              مدت خریداری‌شده به اعتبار فعلی شما اضافه می‌شود — هر پلن همان
              امکانات را دارد.
            </p>
          </div>
        </div>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate="visible"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          {plans.map((plan) => {
            const active = selected === plan.code;
            const discounted = plan.amount_rials < plan.base_price_rials;

            return (
              <motion.div key={plan.code} variants={staggerItem}>
                <button
                  type="button"
                  onClick={() => setSelected(plan.code)}
                  aria-pressed={active}
                  /*
                    A tall card rather than a squat one, so the price has room
                    to be the biggest thing in it. The whole card is the
                    control — the previous version's click target was the same
                    box, but nothing about it looked pressable.

                    The selected state is the accent border plus a ring, not a
                    tint: with four cards side by side a tinted one and its
                    three neighbours differ by about as much as two shades of
                    the same paper, and the ring reads at a glance.
                  */
                  className={`group relative flex h-full w-full flex-col rounded-panel border-2
                              p-5 text-right transition-all cursor-pointer ${
                                active
                                  ? "border-accent bg-accent-tint shadow-accent ring-4 ring-accent/15"
                                  : "border-border bg-surface hover:-translate-y-0.5 hover:border-border-strong hover:shadow-md"
                              }`}
                >
                  {/* The value ribbon, on the plan that is actually cheapest
                      per month rather than on whichever the shop wants sold. */}
                  {plan.best && (
                    <span
                      className="absolute -top-3 right-4 inline-flex items-center gap-1 rounded-pill
                                 bg-accent px-2.5 py-1 text-body-xs font-bold text-accent-fg"
                    >
                      <SparklesIcon
                        className="h-3.5 w-3.5"
                        aria-hidden="true"
                      />
                      به‌صرفه‌ترین
                    </span>
                  )}

                  <span
                    className={`absolute top-4 left-4 flex h-6 w-6 items-center justify-center
                                rounded-full border-2 transition-colors ${
                                  active
                                    ? "border-accent bg-accent text-accent-fg"
                                    : "border-border-strong text-transparent group-hover:border-accent"
                                }`}
                    aria-hidden="true"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </span>

                  <p className="text-body-md font-bold text-text-primary">
                    {plan.name}
                  </p>
                  <p className="mt-0.5 text-body-xs text-text-muted">
                    {toPersianDigits(plan.duration_days)} روز اعتبار
                  </p>

                  <p className="mt-5 flex items-baseline gap-1.5">
                    <span className="text-title-lg font-bold tabular-nums text-text-primary">
                      {toToman(plan.amount_rials)}
                    </span>
                    <span className="text-body-sm text-text-secondary">
                      تومان
                    </span>
                  </p>

                  {discounted && (
                    <p className="mt-1 text-body-xs tabular-nums text-text-secondary line-through">
                      {toToman(plan.base_price_rials)} تومان
                    </p>
                  )}

                  {/*
                    The per-month rate, which is the only figure that makes
                    four different durations comparable, and the saving it
                    represents. `mt-auto` pins them to the bottom so the four
                    cards line these up with each other even when one has a
                    struck-through price above and the others do not.
                  */}
                  <div className="mt-auto pt-5">
                    <p className="text-body-xs tabular-nums text-text-secondary">
                      ماهی {toTomanRounded(plan.perMonth)} تومان
                    </p>
                    {/*
                      The baseline plan gets a line saying so rather than
                      nothing. `mt-auto` aligns the bottom of this block
                      across the four cards, so a card with no badge pushed
                      its own rate line down to where the others' badges sit
                      and the row of rates stopped being a row.
                    */}
                    {plan.saving > 0.005 ? (
                      <p className="mt-1.5 inline-block rounded-pill bg-success-soft px-2 py-0.5 text-body-xs font-bold text-success-fg">
                        {toPersianDigits(Math.round(plan.saving * 100))}٪
                        ارزان‌تر از ماهانه
                      </p>
                    ) : (
                      <p className="mt-1.5 inline-block rounded-pill bg-surface-alt px-2 py-0.5 text-body-xs font-bold text-text-muted">
                        پایهٔ مقایسه
                      </p>
                    )}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* ── Checkout ────────────────────────────────────────────────── */}
      <section
        className={`rounded-panel border border-border bg-surface shadow-sm ${
          // A single sentence does not need a hero's padding around it.
          chosen === null ? "px-5 py-4" : "p-5 sm:p-6"
        }`}
      >
        {chosen === null ? (
          /*
            The empty state used to be a live discount field and a live «پرداخت»
            button, both disabled at 50% opacity, above a blank breakdown — three
            controls explaining nothing. One sentence does the same job.
          */
          <p className="text-center text-body-sm text-text-secondary">
            یکی از پلن‌های بالا را انتخاب کنید تا مبلغ نهایی محاسبه شود.
          </p>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <h2 className="text-title-sm font-bold text-text-primary">
                پرداخت پلن {chosen.name}
              </h2>
              <p className="mt-1 text-body-sm text-text-secondary">
                اگر کد تخفیف دارید پیش از پرداخت وارد کنید.
              </p>

              <label className="mt-4 block text-body-sm text-text-secondary">
                کد تخفیف (اختیاری)
                <input
                  type="text"
                  value={discountCode}
                  onChange={(event) => setDiscountCode(event.target.value)}
                  /* Persian only: a Latin word inside an RTL field puts
                     the bidi algorithm to work and the placeholder came out
                     with its two halves swapped. */
                  placeholder="کد را اینجا وارد کنید"
                  className={`${searchField} !pr-3.5 mt-1.5`}
                />
              </label>

              <p className="mt-3 text-body-xs text-text-muted">
                پرداخت از طریق درگاه امن زیبال انجام می‌شود.
              </p>
            </div>

            {/*
              The breakdown as its own surface rather than a strip under a
              hairline: it is the number the shop is about to be charged, and
              it was set in the same 14px grey as the note beside it.
            */}
            <div className="rounded-panel bg-surface-alt p-5">
              {quote?.code_accepted === false && (
                <p className="mb-3 rounded-field bg-danger-soft px-3 py-2 text-body-sm text-danger-fg">
                  این کد تخفیف معتبر نیست یا قبلاً استفاده شده است.
                </p>
              )}

              <dl
                className={`space-y-2 text-body-sm transition-opacity ${
                  quoting ? "opacity-50" : ""
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-text-secondary">قیمت پلن</dt>
                  <dd className="tabular-nums text-text-primary">
                    {toToman(
                      quote?.base_price_rials ?? chosen.base_price_rials,
                    )}{" "}
                    تومان
                  </dd>
                </div>

                {(quote?.discount_rials ?? 0) > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-success-fg">
                      {quote?.discount_kind === "referral"
                        ? "تخفیف دعوت"
                        : "تخفیف کد"}
                    </dt>
                    <dd className="tabular-nums text-success-fg">
                      −{toToman(quote?.discount_rials ?? 0)} تومان
                    </dd>
                  </div>
                )}

                <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
                  <dt className="font-bold text-text-primary">
                    مبلغ قابل پرداخت
                  </dt>
                  <dd className="text-title-sm font-bold tabular-nums text-text-primary">
                    {toToman(quote?.amount_rials ?? chosen.amount_rials)} تومان
                  </dd>
                </div>
              </dl>

              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleCheckout(chosen)}
                className="mt-5 flex w-full cursor-pointer items-center justify-center gap-2
                           rounded-field bg-accent px-4 py-3 text-body-md font-bold
                           text-accent-fg shadow-accent transition-colors
                           hover:bg-accent-hover disabled:cursor-not-allowed
                           disabled:opacity-60"
              >
                <CreditCardIcon className="h-5 w-5" aria-hidden="true" />
                {submitting ? "در حال انتقال به درگاه…" : "پرداخت و تمدید"}
                {!submitting && (
                  <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── History ─────────────────────────────────────────────────── */}
      {payments.length > 0 && (
        <section>
          <h2 className="mb-3 text-title-sm font-bold text-text-primary">
            تاریخچهٔ پرداخت
          </h2>

          {/*
            The app's own table classes, which this page had been reimplementing
            with its own paddings and a `font-medium` head — so the one table
            outside the list pages was also the one table that looked different.
          */}
          <div className={tableCard}>
            <div className={tableScroll}>
              <table className="w-full min-w-[600px]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>پلن</th>
                    <th className={th}>مبلغ (تومان)</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>رسید</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {payments.map((payment) => {
                    const paymentState = paymentStateOf(payment.status);
                    return (
                      <tr key={payment.id} className={tr}>
                        <td className={tdMuted}>
                          {jalali(payment.created_at)}
                        </td>
                        <td className={`${td} font-bold`}>
                          {payment.plan_name}
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {toToman(payment.amount_rials)}
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          <StatusPill
                            label={paymentState.label}
                            color={paymentState.color}
                            tone={paymentState.tone}
                            size="sm"
                          />
                        </td>
                        <td className="px-3 py-3.5 text-center">
                          {payment.status === "verified" ? (
                            <button
                              type="button"
                              onClick={() => setReceipt(payment)}
                              className={actionView}
                              title="مشاهدهٔ رسید"
                            >
                              <DocumentTextIcon className="h-[1.15rem] w-[1.15rem]" />
                            </button>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      <AnimatePresence>
        {receipt !== null && (
          <PaymentReceipt
            payment={receipt}
            isOpen
            onClose={() => setReceipt(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
