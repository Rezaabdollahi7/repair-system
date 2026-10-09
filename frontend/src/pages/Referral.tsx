import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  GiftIcon,
} from "@heroicons/react/24/solid";
import { getReferral } from "../api";
import { toPersianDigits } from "../utils/formatters";
import { secondaryButton } from "../utils/tableClasses";
import type { ReferralResponse } from "../types/api";

/**
 * The ladder shown on the invite page.
 *
 * Presentation only — there is no tiered logic behind it. Every successful
 * invite adds the same thirty days, and these are what that adds up to.
 * Written as a table because "one year free" reads as a goal in a way that
 * "twelve invites × 30 days" does not.
 */
const LADDER = [
  { invites: 1, reward: "۱ ماه رایگان" },
  { invites: 3, reward: "یک فصل رایگان" },
  { invites: 6, reward: "نیم سال رایگان" },
  { invites: 12, reward: "یک سال کامل رایگان" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}

export default function Referral() {
  const [data, setData] = useState<ReferralResponse | null>(null);

  useEffect(() => {
    getReferral()
      .then((res) => setData(res.data))
      .catch(() => setData(null));
  }, []);

  if (!data) {
    return (
      <div dir="rtl" className="animate-pulse space-y-4">
        <div className="h-9 w-48 rounded-field bg-surface-alt" />
        <div className="h-56 rounded-panel border border-border bg-surface" />
        <div className="h-40 rounded-panel border border-border bg-surface" />
      </div>
    );
  }

  const link = data.code
    ? `https://app.dofixo.ir/register?ref=${data.code}`
    : null;

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} کپی شد`);
    } catch {
      // Clipboard access is refused outside a secure context, which is what
      // http://localhost is in some browsers. The code is on screen either
      // way, so this is an inconvenience rather than a failure.
      toast.error("کپی نشد. متن را دستی انتخاب کنید");
    }
  }

  return (
    <div dir="rtl" className="space-y-4">
      <header>
        <p className="text-body-sm text-text-secondary">
          {/* Persian digits, like every other figure in the app — these three
              counts and the two below were the last Latin numerals left. */}
          هر تعمیرگاهی که با کد شما ثبت‌نام کند و اشتراک بخرد،{" "}
          {toPersianDigits(data.reward_days)} روز به اشتراک شما اضافه می‌شود.
          خودِ او هم ٪{toPersianDigits(data.discount_percent)} تخفیف روی اولین
          خریدش می‌گیرد.
        </p>
      </header>

      <div className="bg-surface border border-border rounded-panel shadow-sm p-5">
        <h2 className="text-title-sm font-bold text-text-primary mb-4">
          کد و لینک شما
        </h2>

        {data.code ? (
          <div className="space-y-3">
            <div>
              <label className="block text-body-xs text-text-secondary mb-1">
                کد دعوت شما
              </label>
              <div className="flex gap-2">
                {/* The accent, once: the code is the whole point of the
                    page and the one thing on it to be copied. */}
                <div className="flex-1 px-4 py-3 rounded-field bg-accent-tint border border-accent-border font-mono text-xl tracking-widest text-center text-text-primary">
                  {data.code}
                </div>
                <button
                  type="button"
                  onClick={() => void copy(data.code!, "کد")}
                  className={`${secondaryButton} flex-none px-4`}
                  title="کپی کد"
                >
                  <ClipboardDocumentIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {link && (
              <div>
                <label className="block text-body-xs text-text-secondary mb-1">
                  لینک دعوت
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-2 rounded-card bg-surface-alt text-body-sm text-text-secondary truncate">
                    {link}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy(link, "لینک")}
                    className={`${secondaryButton} flex-none px-4`}
                    title="کپی لینک"
                  >
                    <ClipboardDocumentIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-body-sm text-text-secondary">
            کد دعوتی برای این کارگاه ثبت نشده است.
          </p>
        )}
      </div>

      <div className="bg-surface border border-border rounded-panel shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <GiftIcon className="w-5 h-5 text-text-muted" aria-hidden="true" />
          <h2 className="text-title-sm font-bold text-text-primary">
            پاداش شما
          </h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {LADDER.map((step) => {
            const reached = data.rewarded_count >= step.invites;

            return (
              <div
                key={step.invites}
                className={`p-3 rounded-field text-center border ${
                  reached
                    ? "bg-success-soft border-success/25 text-success-fg"
                    : "bg-surface-alt border-transparent text-text-secondary"
                }`}
              >
                <p className="text-body-sm font-bold">
                  {toPersianDigits(step.invites)} دعوت موفق
                </p>
                <p className="text-body-xs mt-1">{step.reward}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-body-sm text-text-secondary">
          تا امروز {toPersianDigits(data.invited_count)} نفر با کد شما ثبت‌نام
          کرده‌اند و {toPersianDigits(data.rewarded_count)} نفرشان اشتراک
          خریده‌اند.
        </p>
      </div>

      {data.invites.length > 0 && (
        <div className="bg-surface border border-border rounded-panel shadow-sm p-5">
          <h2 className="text-title-sm font-bold text-text-primary mb-4">
            دعوت‌های شما
          </h2>

          <table className="w-full text-body-sm">
            <thead>
              <tr className="text-text-secondary text-right">
                <th className="pb-2 font-medium">تاریخ ثبت‌نام</th>
                <th className="pb-2 font-medium">وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {/* Nothing identifying about the workshops that took the link:
                  who accepted an invitation is their business, and the
                  referrer only needs to know that it counted. */}
              {data.invites.map((invite, index) => (
                <tr key={index} className="border-t border-border">
                  <td className="py-2 text-text-primary">
                    {formatDate(invite.created_at)}
                  </td>
                  <td className="py-2">
                    {invite.rewarded_at ? (
                      <span className="text-success-fg flex items-center gap-1">
                        <CheckCircleIcon className="w-4 h-4" />
                        پاداش دریافت شد
                      </span>
                    ) : (
                      <span className="text-text-secondary">
                        در انتظار خرید اشتراک
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
