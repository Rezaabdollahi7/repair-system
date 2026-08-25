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
export function toEnglishDigits(value: string): string {
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

/**
 * Exported so personnel creation uses the identical rule. A user created
 * with a username login would reject can be signed in as by nobody — the
 * account exists, looks active, and simply never works.
 */
export const phoneSchema = z.preprocess(
  normalizePhone,
  z.string().regex(/^09\d{9}$/, "شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)"),
);

/**
 * Which flow the code is for. Required, not defaulted, because the two have
 * opposite preconditions: `register` needs the number to be unused, `reset`
 * needs it to exist. A code issued for one and spent on the other would let
 * an unverified number reach a password reset.
 */
export const otpPurposeSchema = z.enum(["register", "reset"], {
  message: "نوع درخواست معتبر نیست",
});

export const sendOtpSchema = z.object({
  phone: phoneSchema,
  purpose: otpPurposeSchema,
});

export type SendOtpBody = z.infer<typeof sendOtpSchema>;

/**
 * Five digits as typed, leading zero included — the code is generated with
 * padStart, so 00042 is a code like any other. Not coerced to a number,
 * which would eat that zero.
 */
export const otpCodeSchema = z.preprocess(
  (value) =>
    typeof value === "string" ? toEnglishDigits(value.trim()) : value,
  z.string().regex(/^\d{5}$/, "کد باید پنج رقم باشد"),
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
  username: phoneSchema,
  password,
  // The code is the proof the number is real, and it is spent in the same
  // request that creates the workspace. No intermediate token: a "verified"
  // credential handed back to the client would be one more thing to issue,
  // store and reason about, and this way there is no server-side state
  // between the two calls at all.
  code: otpCodeSchema,
});

export type RegisterBody = z.infer<typeof registerSchema>;

export const resetPasswordSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
  new_password: password,
});

export type ResetPasswordBody = z.infer<typeof resetPasswordSchema>;

export const loginSchema = z.object({
  username: phoneSchema,
  password: z.string().min(1, "نام کاربری و رمز عبور الزامی است"),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "رمز فعلی و جدید الزامی است"),
  new_password: password,
});

export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
