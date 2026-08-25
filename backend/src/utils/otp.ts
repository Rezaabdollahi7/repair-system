import crypto from "node:crypto";

/** Five digits: a hundred thousand possibilities. */
const CODE_DIGITS = 5;

/**
 * Three minutes. Short on purpose — this and the attempt ceiling are what
 * actually protect the code, not the hash it is stored under.
 */
export const OTP_TTL_MS = 3 * 60 * 1000;

/** Three wrong guesses burn the row, whether or not it is still in date. */
export const OTP_MAX_ATTEMPTS = 3;

/**
 * Three codes per phone number per hour, and the window rows are swept by.
 *
 * The window has to outlive the TTL by a long way: a code expires after three
 * minutes but must keep counting for an hour, or the ceiling means nothing.
 */
export const OTP_SEND_WINDOW_MS = 60 * 60 * 1000;
export const OTP_SEND_LIMIT = 3;

/**
 * A leading zero is a digit like any other — 00042 is a valid code. Excluding
 * it would drop the space to ninety thousand for no reason, so the value is
 * padded rather than shifted into a range that avoids zeros.
 */
export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 10 ** CODE_DIGITS)).padStart(
    CODE_DIGITS,
    "0",
  );
}

/**
 * SHA-256, and be honest about what it buys: nearly nothing. Five digits
 * unsalted is a rainbow table anyone can build in seconds, so a database
 * dump yields every live code.
 *
 * It is here because storing the code in plain text would be worse for no
 * saving, not because it makes the table safe. The real defences are the
 * three-minute expiry, the three-attempt ceiling and single use — do not
 * relax any of those on the strength of this function existing.
 *
 * Same construction as hashRefreshToken and deliberately not shared with it:
 * they hash different things for different reasons, and one helper serving
 * both would invite changing the algorithm for one and silently changing it
 * for the other.
 */
export function hashOtpCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function otpExpiry(from = Date.now()): Date {
  return new Date(from + OTP_TTL_MS);
}

/**
 * Why a code was refused. Only BURNED is told apart in the response: the
 * others all mean "try again with the right code", while a burned row means
 * trying again cannot work, and a user who is not told that will retype the
 * correct code until it expires.
 */
export type OtpFailure = "invalid" | "burned";

export interface OtpRow {
  id: number;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  consumedAt: Date | null;
}

/**
 * Whether a row may still be used, given a code.
 *
 * Pure, and deliberately so: the caller decides what to write and when,
 * because the two writes belong in different places — the attempt counter
 * outside the sign-up transaction so a rollback cannot undo it, and the
 * consumption inside it so a failed sign-up does not spend the code.
 */
export function checkOtp(
  row: OtpRow | null,
  code: string,
): { ok: true } | { ok: false; reason: OtpFailure } {
  if (!row) {
    return { ok: false, reason: "invalid" };
  }

  // Checked before the code itself: a burned row is dead whatever is typed
  // into it, and counting further attempts against it tells a guesser they
  // are still being listened to.
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    return { ok: false, reason: "burned" };
  }

  if (row.consumedAt !== null) {
    return { ok: false, reason: "invalid" };
  }

  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "invalid" };
  }

  // timingSafeEqual over the hashes, which are always the same length. The
  // guard against guessing is the attempt ceiling, not this — but a plain
  // comparison would leak a little for free, and refusing free leaks is
  // cheaper than arguing about how much they matter.
  const expected = Buffer.from(row.codeHash, "hex");
  const given = Buffer.from(hashOtpCode(code), "hex");

  if (!crypto.timingSafeEqual(expected, given)) {
    return { ok: false, reason: "invalid" };
  }

  return { ok: true };
}
