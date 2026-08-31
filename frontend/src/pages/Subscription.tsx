import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { getPaymentHistory, getQuote, startCheckout } from "../api";
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

const PAYMENT_LABELS: Record<string, string> = {
  pending: "در انتظار پرداخت",
  paid: "پرداخت‌شده، در حال تأیید",
  verified: "موفق",
  failed: "ناموفق",
};

export default function Subscription() {
  const { status } = useSubscription();
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [discountCode, setDiscountCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [quoting, setQuoting] = useState(false);

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
      <div className="text-text-secondary text-sm">در حال بارگذاری...</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface rounded-3xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-text-primary mb-3">
          وضعیت اشتراک
        </h2>

        {status.never_expires ? (
          <p className="text-sm text-success">اشتراک این کارگاه دائمی است.</p>
        ) : (
          <div className="space-y-1 text-sm">
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
                    ? "text-danger font-medium"
                    : "text-text-secondary"
                }
              >
                {remaining > 0
                  ? `${remaining} روز باقی مانده`
                  : "اشتراک شما به پایان رسیده است"}
              </p>
            )}
          </div>
        )}

        {status.referral_applies && (
          <p className="mt-3 text-sm text-success flex items-center gap-2">
            <CheckCircleIcon className="w-5 h-5 shrink-0" />
            تخفیف ۱۰٪ دعوت روی اولین خرید شما اعمال شده است.
          </p>
        )}
      </div>

      <div className="bg-surface rounded-3xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-text-primary mb-1">
          تمدید اشتراک
        </h2>
        <p className="text-sm text-text-secondary mb-4">
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
                className={`text-right p-4 rounded-2xl border transition-colors ${
                  active
                    ? "border-primary bg-primary-soft"
                    : "border-border hover:bg-surface-alt"
                }`}
              >
                <p className="font-medium text-text-primary">{plan.name}</p>
                <p className="mt-2 text-lg font-bold text-text-primary">
                  {toToman(plan.amount_rials)}
                  <span className="text-sm font-normal"> تومان</span>
                </p>
                {discounted && (
                  <p className="text-xs text-text-secondary line-through">
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
            className="flex-1 px-4 py-2 rounded-2xl border border-border bg-surface text-text-primary disabled:opacity-50"
          />
          <button
            type="button"
            disabled={!selected || submitting}
            onClick={() => {
              const plan = status.plans.find((p) => p.code === selected);
              if (plan) void handleCheckout(plan);
            }}
            className="px-6 py-2 rounded-2xl bg-primary text-text-inverse font-medium disabled:opacity-50 hover:bg-primary-hover transition-colors"
          >
            {submitting ? "در حال انتقال..." : "پرداخت"}
          </button>
        </div>

        {selected && (
          <div className="mt-4 pt-4 border-t border-border text-sm">
            {quoting && <p className="text-text-secondary">در حال محاسبه...</p>}

            {!quoting && quote && (
              <>
                {quote.code_accepted === false && (
                  <p className="text-danger mb-2">
                    این کد تخفیف معتبر نیست یا قبلاً استفاده شده است.
                  </p>
                )}

                <div className="flex justify-between text-text-secondary">
                  <span>قیمت پلن</span>
                  <span>{toToman(quote.base_price_rials)} تومان</span>
                </div>

                {quote.discount_rials > 0 && (
                  <div className="flex justify-between text-success mt-1">
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

        <p className="mt-3 text-xs text-text-secondary">
          پرداخت از طریق درگاه امن زیبال انجام می‌شود.
        </p>
      </div>

      {payments.length > 0 && (
        <div className="bg-surface rounded-3xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-text-primary mb-4">
            تاریخچه‌ی پرداخت
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-secondary text-right">
                  <th className="pb-2 font-medium">تاریخ</th>
                  <th className="pb-2 font-medium">پلن</th>
                  <th className="pb-2 font-medium">مبلغ</th>
                  <th className="pb-2 font-medium">وضعیت</th>
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
                    <td
                      className={`py-2 ${
                        payment.status === "verified"
                          ? "text-success"
                          : payment.status === "failed"
                            ? "text-danger"
                            : "text-text-secondary"
                      }`}
                    >
                      {PAYMENT_LABELS[payment.status] ?? payment.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
