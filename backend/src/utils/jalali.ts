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
