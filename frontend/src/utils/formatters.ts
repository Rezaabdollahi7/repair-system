/**
 * فرمت شماره تماس فارسی
 * 09219811980 → ۰۹۲۱۹۸۱۱۹۸۰
 *
 * One unbroken run of digits, deliberately. The grouped form — ۰۹۲۱-۹۸۱-۱۹۸۰
 * — was assembled right-to-left from three slices, which meant the number a
 * shop read off the screen was not the number it would dial, and a number
 * copied out of a table came with separators the next field would reject.
 * A mobile number is an identifier here, not prose: it is searched for,
 * compared against another one, and read aloud. All three want it whole.
 */
export function formatPersianPhone(phone: string | null | undefined): string {
  if (!phone) return "—";

  return toPersianDigits(phone.replace(/\D/g, ""));
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
