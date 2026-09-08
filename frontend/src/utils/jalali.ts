import { toJalaali } from "jalaali-js";

/**
 * Jalali month names, shortened where the full name does not fit an axis.
 *
 * Only three are actually abbreviated — the ones long enough to collide with
 * their neighbour at 12px. The rest are left whole, because an abbreviation
 * the reader has to decode is worse than a name that fits anyway.
 */
const SHORT_MONTHS = [
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
];

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

function persian(value: number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * A `YYYY-MM-DD` UTC day key as a Jalali day number — `۲۳`.
 *
 * Read in UTC to match the key: the backend buckets a day by its UTC
 * boundary, so parsing the same string in Tehran time would shift a third of
 * the points onto the previous day and mislabel every one of them.
 */
export function jalaliDayOf(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  return persian(toJalaali(year, month, day).jd);
}

/** The same key as `۲۳ شهریور`, for a tooltip where there is room. */
export function jalaliDayAndMonth(dayKey: string): string {
  const [year, month, day] = dayKey.split("-").map(Number);
  const jalali = toJalaali(year, month, day);
  return `${persian(jalali.jd)} ${SHORT_MONTHS[jalali.jm - 1]}`;
}
