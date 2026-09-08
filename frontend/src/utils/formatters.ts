/**
 * فرمت شماره تماس فارسی
 * 09330020020 → ۰۹۳۳ ۰۰۲ ۰۰۲۰
 */
export function formatPersianPhone(phone: string | null | undefined): string {
  if (!phone) return "—";

  const digits = phone.replace(/\D/g, "");

  if (digits.length === 11) {
    // 09123456789 → ۰۹۱۲ ۳۴۵ ۶۷۸۹
    return `${toPersianDigits(digits.slice(7))} - ${toPersianDigits(digits.slice(4, 7))} - ${toPersianDigits(digits.slice(0, 4))} `;
  } else if (digits.length === 10 && digits.startsWith("0")) {
    // 02112345678 → ۰۲۱ ۱۲۳۴ ۵۶۷۸
    return `${toPersianDigits(digits.slice(7))} - ${toPersianDigits(digits.slice(3, 7))} -  ${toPersianDigits(digits.slice(0, 3))}`;
  }

  return toPersianDigits(digits);
}

/**
 * تبدیل اعداد انگلیسی به فارسی
 */
export function toPersianDigits(
  num: string | number | null | undefined,
): string {
  if (num === null || num === undefined) return "—";
  const str = String(num);
  const persianDigits = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return str.replace(/[0-9]/g, (d) => persianDigits[parseInt(d)]);
}

/**
 * فرمت مبلغ با اعداد فارسی
 */
export function formatPersianCurrency(
  amount: string | number | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = Math.round(Number(amount));
  if (isNaN(num)) return "—";

  /*
   * The sign is written out rather than left to toLocaleString, so a negative
   * amount reads the same here as it does from formatPersianCompact beside
   * it: a real minus (U+2212) in front of the digits, not the hyphen that
   * bidi reorders around a Persian number. Losses show up in the profit
   * report and in the dashboard's net figure, so this is not hypothetical.
   */
  const sign = num < 0 ? "−" : "";
  return sign + toPersianDigits(Math.abs(num).toLocaleString("en-US"));
}

/**
 * A rial amount shortened to three significant characters plus a unit.
 *
 * Chart axes and legends cannot carry `۱۲٬۴۵۰٬۰۰۰` — at the size an axis
 * label is set, a nine-character number either overlaps its neighbour or
 * forces the plot area down to nothing. The full figure still appears in the
 * tooltip and in the stat tiles, so nothing is lost by abbreviating here.
 *
 * The decimal separator is the Persian one (٫ U+066B), not a Latin dot: the
 * digits around it are Persian, and mixing the two makes the number read as
 * two numbers.
 */
export function formatPersianCompact(
  amount: string | number | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";

  const sign = num < 0 ? "−" : "";
  const abs = Math.abs(num);

  const units: { limit: number; suffix: string }[] = [
    { limit: 1_000_000_000_000, suffix: " هزار میلیارد" },
    { limit: 1_000_000_000, suffix: " میلیارد" },
    { limit: 1_000_000, suffix: " میلیون" },
    { limit: 1_000, suffix: " هزار" },
  ];

  for (const { limit, suffix } of units) {
    if (abs >= limit) {
      const scaled = abs / limit;
      // One decimal below ten, none above: ۹٫۴ میلیون is worth the extra
      // character, ۹۴٫۲ میلیون is not.
      const text =
        scaled < 10
          ? scaled.toFixed(1).replace(/\.0$/, "")
          : String(Math.round(scaled));
      return sign + toPersianDigits(text).replace(".", "٫") + suffix;
    }
  }

  return sign + toPersianDigits(Math.round(abs));
}

/**
 * A timestamp as a Jalali date — `۱۴۰۵/۰۶/۱۷`.
 *
 * Six pages were each carrying their own two-line copy of this, all calling
 * toLocaleDateString("fa-IR") and all handling null slightly differently.
 * The em dash for a missing date is the app's convention for "no value".
 */
export function formatPersianDate(date: string | null | undefined): string {
  if (!date) return "—";
  const parsed = new Date(date);
  if (isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("fa-IR");
}

/**
 * A percentage with Persian digits and the Persian percent sign — `٪۱۲٫۵`.
 *
 * The profit report was printing `12.5%`: Latin digits, a Latin decimal
 * point, and the sign on the wrong side of the number for the direction the
 * page reads in. One decimal, because the second is noise on a margin.
 */
export function formatPersianPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const sign = value < 0 ? "−" : "";
  const text = Math.abs(value).toFixed(1).replace(/\.0$/, "");
  return `${sign}٪${toPersianDigits(text).replace(".", "٫")}`;
}
