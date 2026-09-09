import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { CheckCircleIcon, CreditCardIcon } from "@heroicons/react/24/solid";
import StatusPill from "../components/StatusPill";
import { toPersianDigits } from "../utils/formatters";
import { primaryButton, searchField } from "../utils/tableClasses";
import { getPaymentHistory, getQuote, startCheckout } from "../api";
import PaymentReceipt from "../components/PaymentReceipt";
import { useSubscription } from "../context/SubscriptionContext";
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
      <div dir="rtl" className="animate-pulse space-y-4">
        <div className="h-9 w-40 rounded-field bg-surface-alt" />
        <div className="h-32 rounded-panel border border-border bg-surface" />
        <div className="h-72 rounded-panel border border-border bg-surface" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-4">
      <header>
        <p className="text-body-sm text-text-secondary">
          وضعیت اعتبار کارگاه و تمدید آن
        </p>
      </header>

      <div className="bg-surface border border-border rounded-panel shadow-sm p-5">
        <h2 className="text-title-sm font-bold text-text-primary mb-3">
          وضعیت اشتراک
        </h2>

        {status.never_expires ? (
          <p className="text-body-sm text-success-fg">
            اشتراک این کارگاه دائمی است.
          </p>
        ) : (
          <div className="space-y-1 text-body-sm">
            <p className="text-text-secondary">
              تاریخ پایان:{" "}
              <span className="text-text-primary font-medium">
                {status.expires_at ? jalali(status.expires_at) : "نامشخص"}
              </span>
            </p>
            {remaining !== null && (
              <p
                className={
                  remaining <= 0
                    ? "text-danger-fg font-medium"
                    : "text-text-secondary"
                }
              >
                {remaining > 0
                  ? `${toPersianDigits(remaining)} روز باقی مانده`
                  : "اشتراک شما به پایان رسیده است"}
              </p>
            )}
          </div>
        )}

        {status.referral_applies && (
          <p className="mt-3 text-body-sm text-success-fg flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            تخفیف ۱۰٪ دعوت روی اولین خرید شما اعمال شده است.
          </p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-panel shadow-sm p-5">
        <h2 className="text-title-sm font-bold text-text-primary mb-1">
          تمدید اشتراک
        </h2>
        <p className="text-body-sm text-text-secondary mb-4">
          مدت خریداری‌شده به اعتبار فعلی شما اضافه می‌شود.
        </p>

        <div className="grid gap-3 sm:grid-cols-3 mb-4">
          {status.plans.map((plan) => {
            const active = selected === plan.code;
            const discounted = plan.amount_rials < plan.base_price_rials;

            return (
              <button
                key={plan.code}
                type="button"
                onClick={() => setSelected(plan.code)}
                /*
                  The chosen plan wears the accent.
                  ---------------------------------------------------------
                  It was `border-primary bg-primary-soft`, and the palette
                  turned those into an ink hairline over warm off-white — a
                  selection you had to look for. Picking one of three cards is
                  precisely the kind of single, unambiguous state the brand
                  colour exists to mark, and this page has exactly one.
                */
                className={`relative text-right p-4 rounded-card border-2 transition-colors cursor-pointer ${
                  active
                    ? "border-accent bg-accent-tint"
                    : "border-border hover:border-border-strong hover:bg-surface-alt"
                }`}
              >
                {active && (
                  <span
                    className="absolute top-3 left-3 w-5 h-5 rounded-full bg-accent
                               text-accent-fg flex items-center justify-center"
                    aria-hidden="true"
                  >
                    <CheckCircleIcon className="w-4 h-4" />
                  </span>
                )}
                <p className="font-bold text-text-primary">{plan.name}</p>
                <p className="mt-2 text-lg font-bold text-text-primary">
                  {toToman(plan.amount_rials)}
                  <span className="text-body-sm font-normal"> تومان</span>
                </p>
                {discounted && (
                  <p className="text-body-xs text-text-secondary line-through">
                    {toToman(plan.base_price_rials)} تومان
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={discountCode}
            onChange={(event) => setDiscountCode(event.target.value)}
            placeholder="کد تخفیف (اختیاری)"
            disabled={!selected}
            className={`${searchField} !pr-3.5 flex-1 disabled:opacity-50`}
          />
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={() => {
              const plan = status.plans.find((p) => p.code === selected);
              if (plan) void handleCheckout(plan);
            }}
            className={`${primaryButton} flex-none disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <CreditCardIcon
              className="w-[1.15rem] h-[1.15rem]"
              aria-hidden="true"
            />
            {submitting ? "در حال انتقال…" : "پرداخت"}
          </button>
        </div>

        {selected && (
          <div className="mt-4 pt-4 border-t border-border text-body-sm">
            {quoting && <p className="text-text-secondary">در حال محاسبه...</p>}

            {!quoting && quote && (
              <>
                {quote.code_accepted === false && (
                  <p className="text-danger-fg mb-2">
                    این کد تخفیف معتبر نیست یا قبلاً استفاده شده است.
                  </p>
                )}

                <div className="flex justify-between text-text-secondary">
                  <span>قیمت پلن</span>
                  <span>{toToman(quote.base_price_rials)} تومان</span>
                </div>

                {quote.discount_rials > 0 && (
                  <div className="flex justify-between text-success-fg mt-1">
                    <span>
                      {quote.discount_kind === "referral"
                        ? "تخفیف دعوت"
                        : "تخفیف کد"}
                    </span>
                    <span>−{toToman(quote.discount_rials)} تومان</span>
                  </div>
                )}

                <div className="flex justify-between font-bold text-text-primary mt-2 pt-2 border-t border-border">
                  <span>مبلغ قابل پرداخت</span>
                  <span>{toToman(quote.amount_rials)} تومان</span>
                </div>
              </>
            )}
          </div>
        )}

        <p className="mt-3 text-body-xs text-text-secondary">
          پرداخت از طریق درگاه امن زیبال انجام می‌شود.
        </p>
      </div>

      {payments.length > 0 && (
        <div className="bg-surface border border-border rounded-panel shadow-sm p-5">
          <h2 className="text-title-sm font-bold text-text-primary mb-4">
            تاریخچه‌ی پرداخت
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-body-sm">
              <thead>
                <tr className="text-text-secondary text-right">
                  <th className="pb-2 font-medium">تاریخ</th>
                  <th className="pb-2 font-medium">پلن</th>
                  <th className="pb-2 font-medium">مبلغ</th>
                  <th className="pb-2 font-medium">وضعیت</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-t border-border">
                    <td className="py-2">{jalali(payment.created_at)}</td>
                    <td className="py-2">{payment.plan_name}</td>
                    <td className="py-2">
                      {toToman(payment.amount_rials)} تومان
                    </td>
                    <td className="py-2">
                      <StatusPill
                        label={paymentStateOf(payment.status).label}
                        color={paymentStateOf(payment.status).color}
                        tone={paymentStateOf(payment.status).tone}
                        size="sm"
                      />
                    </td>
                    <td className="py-2 text-left">
                      {payment.status === "verified" && (
                        <button
                          type="button"
                          onClick={() => setReceipt(payment)}
                          className="text-primary text-body-xs underline"
                        >
                          رسید
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
