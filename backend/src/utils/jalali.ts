import jalaali from "jalaali-js";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

function toPersianDigits(value: string): string {
  return value.replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/**
 * A Jalali date for an SMS, as ۱۴۰۵-۰۹-۱۲.
 *
 * ⚠️ Dashes, not slashes. Whether sms.ir accepts a slash in a parameter was
 * never established, and finding out in production would mean an HTTP 400
 * that reads in the logs like a wrong template id — an hour spent on the
 * wrong thing, exactly as the panel's IP allowlist once cost.
 *
 * Persian digits because the whole product is Persian and a shop owner reads
 * this on their phone. If a template is ever rejected over them, the one
 * place to change is here.
 */
export function toJalaliSms(date: Date): string {
  const { jy, jm, jd } = jalaali.toJalaali(date);

  const parts = [
    String(jy),
    String(jm).padStart(2, "0"),
    String(jd).padStart(2, "0"),
  ];

  return toPersianDigits(parts.join("-"));
}

/** Month names, in order, so index 0 is فروردین. */
export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export interface JalaliMonth {
  jy: number;
  jm: number;
}

/** The Jalali year and month a date falls in. */
export function jalaliYearMonth(date: Date): JalaliMonth {
  const { jy, jm } = jalaali.toJalaali(date);
  return { jy, jm };
}

/**
 * The last `count` Jalali months, oldest first, ending with the one `now`
 * falls in.
 *
 * Walked month by month rather than by subtracting days: a Jalali month is
 * 29, 30 or 31 days depending on where it sits in the year, so «twelve
 * months ago» is not a fixed number of days and never will be.
 */
export function lastJalaliMonths(
  count: number,
  now: Date = new Date(),
): JalaliMonth[] {
  const { jy, jm } = jalaliYearMonth(now);
  const months: JalaliMonth[] = [];

  for (let back = count - 1; back >= 0; back -= 1) {
    // Zero-based so the arithmetic wraps cleanly across a year boundary.
    const index = jy * 12 + (jm - 1) - back;
    months.push({ jy: Math.floor(index / 12), jm: (index % 12) + 1 });
  }

  return months;
}

/** «مرداد ۱۴۰۵» — for a chart axis. */
export function jalaliMonthLabel({ jy, jm }: JalaliMonth): string {
  return `${JALALI_MONTHS[jm - 1]} ${toPersianDigits(String(jy))}`;
}
