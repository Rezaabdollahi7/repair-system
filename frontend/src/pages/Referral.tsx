import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  GiftIcon,
} from "@heroicons/react/24/solid";
import { getReferral } from "../api";
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
      <div className="text-text-secondary text-sm">در حال بارگذاری...</div>
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
    <div className="space-y-6">
      <div className="bg-surface rounded-3xl p-5 shadow-sm">
        <h2 className="text-lg font-bold text-text-primary mb-1">
          دعوت از دوستان
        </h2>
        <p className="text-sm text-text-secondary mb-4">
          هر تعمیرگاهی که با کد شما ثبت‌نام کند و اشتراک بخرد،{" "}
          {data.reward_days} روز به اشتراک شما اضافه می‌شود. خودِ او هم{" "}
          {data.discount_percent}٪ تخفیف روی اولین خریدش می‌گیرد.
        </p>

        {data.code ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1">
                کد دعوت شما
              </label>
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-3 rounded-2xl bg-surface-alt font-mono text-xl tracking-widest text-center text-text-primary">
                  {data.code}
                </div>
                <button
                  type="button"
                  onClick={() => void copy(data.code!, "کد")}
                  className="px-4 rounded-2xl bg-primary-soft text-primary hover:bg-primary hover:text-text-inverse transition-colors"
                  title="کپی کد"
                >
                  <ClipboardDocumentIcon className="w-5 h-5" />
                </button>
              </div>
            </div>

            {link && (
              <div>
                <label className="block text-xs text-text-secondary mb-1">
                  لینک دعوت
                </label>
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-2 rounded-2xl bg-surface-alt text-sm text-text-secondary truncate">
                    {link}
                  </div>
                  <button
                    type="button"
                    onClick={() => void copy(link, "لینک")}
                    className="px-4 rounded-2xl bg-primary-soft text-primary hover:bg-primary hover:text-text-inverse transition-colors"
                    title="کپی لینک"
                  >
                    <ClipboardDocumentIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-text-secondary">
            کد دعوتی برای این کارگاه ثبت نشده است.
          </p>
        )}
      </div>

      <div className="bg-surface rounded-3xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <GiftIcon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-text-primary">پاداش شما</h2>
        </div>

        <div className="grid gap-2 sm:grid-cols-4">
          {LADDER.map((step) => {
            const reached = data.rewarded_count >= step.invites;

            return (
              <div
                key={step.invites}
                className={`p-3 rounded-2xl text-center ${
                  reached
                    ? "bg-success-soft text-success"
                    : "bg-surface-alt text-text-secondary"
                }`}
              >
                <p className="text-sm font-medium">
                  {step.invites} دعوت موفق
                </p>
                <p className="text-xs mt-1">{step.reward}</p>
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-sm text-text-secondary">
          تا امروز {data.invited_count} نفر با کد شما ثبت‌نام کرده‌اند و{" "}
          {data.rewarded_count} نفرشان اشتراک خریده‌اند.
        </p>
      </div>

      {data.invites.length > 0 && (
        <div className="bg-surface rounded-3xl p-5 shadow-sm">
          <h2 className="text-lg font-bold text-text-primary mb-4">
            دعوت‌های شما
          </h2>

          <table className="w-full text-sm">
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
                      <span className="text-success flex items-center gap-1">
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
