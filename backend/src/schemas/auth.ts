import { z } from "zod";

/**
 * Both digit sets that reach an Iranian phone field.
 *
 * They look alike but are different code points: Persian (U+06F0–06F9) comes
 * from a Persian keyboard, Arabic-Indic (U+0660–0669) from an Arabic layout
 * or some Android keyboards. Handled here rather than through
 * persianToEnglish, which only covers the first — and which other callers
 * rely on for search, so widening it would change behaviour well beyond
 * this field.
 */
function toEnglishDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * Brings a phone number to the one shape stored in the database.
 *
 * Shared by sign-up and login on purpose: normalising in only one of them
 * would let someone register as ۰۹۱۲۳۴۵۶۷۸۹ and then be unable to sign in as
 * 09123456789, with nothing in the logs to explain why.
 */
function normalizePhone(value: unknown): unknown {
  if (typeof value !== "string") {
    return value;
  }

  // Digits first: a phone typed on a Persian keyboard is the normal case
  // here, not the exception.
  let phone = toEnglishDigits(value);

  phone = phone.replace(/[\s\-()]/g, "");

  phone = phone
    .replace(/^\+98/, "0")
    .replace(/^0098/, "0")
    .replace(/^98(?=9)/, "0");

  return phone;
}

const phone = z.preprocess(
  normalizePhone,
  z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)"),
);

const password = z
  .string()
  .min(8, "رمز عبور باید حداقل ۸ کاراکتر باشد")
  .max(72, "رمز عبور بیش از حد طولانی است");

export const registerSchema = z.object({
  workspace_name: z
    .string()
    .trim()
    .min(2, "نام کارگاه باید حداقل ۲ کاراکتر باشد")
    .max(100, "نام کارگاه بیش از حد طولانی است"),
  username: phone,
  password,
});

export type RegisterBody = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  username: phone,
  password: z.string().min(1, "نام کاربری و رمز عبور الزامی است"),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "رمز فعلی و جدید الزامی است"),
  new_password: password,
});

export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
