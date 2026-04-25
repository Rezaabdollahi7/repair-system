// src/utils/formatters.js
/**
 * فرمت شماره تماس فارسی
 * 09330020020 → ۰۹۳۳ ۰۰۲ ۰۰۲۰
 */
export function formatPersianPhone(phone) {
  if (!phone) return "—";

  // فقط اعداد
  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    // موبایل: 09123456789 → ۰۹۱۲ ۳۴۵ ۶۷۸۹
    return toPersianDigits(
      `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`,
    );
  } else if (digits.length === 10 && digits.startsWith("0")) {
    // ثابت: 02112345678 → ۰۲۱ ۱۲۳۴ ۵۶۷۸
    return toPersianDigits(
      `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7)}`,
    );
  }

  // فرمت پیش‌فرض
  return toPersianDigits(digits);
}

/**
 * تبدیل اعداد انگلیسی به فارسی
 */
export function toPersianDigits(num) {
  if (num === null || num === undefined) return "—";
  const str = String(num);
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return str.replace(/[0-9]/g, (d) => persianDigits[parseInt(d)]);
}

/**
 * فرمت مبلغ با اعداد فارسی
 */
export function formatPersianCurrency(amount) {
  if (!amount) return "۰ ریال";
  return `${toPersianDigits(Number(amount).toLocaleString())} ریال`;
}
