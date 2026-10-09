import type { DeviceSmsOutcome } from "../types/api";

/**
 * What the shop is told about a customer notification, by what became of it.
 *
 * Shared rather than written where it is shown: the device form and the
 * status picker in the device list both report the same six outcomes, and a
 * shop that reads «اعتبار پیامکی کافی نبود» on one screen and something else
 * on the other has to work out whether they mean the same thing.
 *
 * Every entry says what happened to the *message*, never what happened to
 * the device — the device saved either way, and the two are reported as two
 * separate pieces of news.
 */
export const SMS_OUTCOME_TEXT: Record<string, string> = {
  sent: "پیامک برای مشتری ارسال شد",
  insufficient_balance: "اعتبار پیامکی کافی نبود؛ پیامکی ارسال نشد",
  invalid_phone: "شماره موبایل مشتری معتبر نیست؛ پیامکی ارسال نشد",
  disabled: "ارسال پیامک به مشتریان غیرفعال است",
  refunded: "ارسال پیامک ناموفق بود؛ هزینه به کیف پول برگشت",
  failed: "ارسال پیامک ناموفق بود",
};

/** The sentence for one outcome, with a fallback for a status added later. */
export function smsOutcomeText(outcome: DeviceSmsOutcome): string {
  return SMS_OUTCOME_TEXT[outcome.status] ?? "وضعیت پیامک نامشخص است";
}
