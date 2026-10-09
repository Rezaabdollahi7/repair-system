import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { PencilSquareIcon } from "@heroicons/react/24/outline";
import AuthSubmit from "./AuthSubmit";
import { transition } from "../motion";

/** Three minutes, matching OTP_TTL_MS on the server. */
const CODE_LIFETIME_SECONDS = 180;

/** Digits in the code the server sends. Drives how many boxes are drawn. */
const CODE_LENGTH = 5;

interface Props {
  /** Shown back to the user so a wrong digit is visible before they wait. */
  phone: string;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: () => void;
  /** Sends another code. Disabled until the countdown runs out. */
  onResend: () => void;
  /** Returns to the form behind this step, with its values still filled in. */
  onBack: () => void;
  loading: boolean;
  /**
   * When the current code was sent. Changing it restarts the countdown, which
   * is how a resend is noticed without a second prop for it.
   */
  sentAt: number;
  submitLabel: string;
}

/**
 * Persian and Arabic-Indic digits map to ASCII, everything else is dropped.
 * The keyboard on an Iranian phone produces ۰-۹, and an SMS pasted from it
 * carries them; without this the boxes would silently refuse a correct code.
 */
function toAsciiDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (char) => {
    const code = char.charCodeAt(0);
    const base = code >= 0x06f0 ? 0x06f0 : 0x0660;
    return String(code - base);
  });
}

function digitsOnly(value: string): string {
  return toAsciiDigits(value).replace(/\D/g, "");
}

export default function OtpCodeStep({
  phone,
  code,
  onCodeChange,
  onSubmit,
  onResend,
  onBack,
  loading,
  sentAt,
  submitLabel,
}: Props) {
  const [remaining, setRemaining] = useState(CODE_LIFETIME_SECONDS);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Counted from sentAt rather than decremented from a fixed number: a
    // backgrounded tab throttles setInterval, and a phone that slept for a
    // minute would come back still showing two minutes left.
    const tick = () => {
      const elapsed = Math.floor((Date.now() - sentAt) / 1000);
      setRemaining(Math.max(0, CODE_LIFETIME_SECONDS - elapsed));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [sentAt]);

  // A resend clears the code upstream; moving focus back to the first box
  // saves the user reaching for it before typing the new one.
  useEffect(() => {
    inputs.current[0]?.focus();
  }, [sentAt]);

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  const progress = remaining / CODE_LIFETIME_SECONDS;

  /** The parent still owns one string; the boxes are a view over it. */
  const digits = useMemo(() => {
    const clean = digitsOnly(code).slice(0, CODE_LENGTH);
    return Array.from({ length: CODE_LENGTH }, (_, i) => clean[i] ?? "");
  }, [code]);

  const filled = digits.filter(Boolean).length;

  const writeDigits = (next: string[]) => {
    onCodeChange(next.join(""));
  };

  /** Writes `source` across the boxes from `start`, then parks the caret. */
  const spread = (start: number, source: string) => {
    const next = [...digits];
    for (let i = 0; i < source.length && start + i < CODE_LENGTH; i += 1) {
      next[start + i] = source[i];
    }
    writeDigits(next);
    inputs.current[Math.min(start + source.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleChange = (index: number, raw: string) => {
    const typed = digitsOnly(raw);

    if (!typed) {
      const next = [...digits];
      next[index] = "";
      writeDigits(next);
      return;
    }

    // A browser autofilling the SMS code drops all five digits into the first
    // box through onChange, never through onPaste — so a full-length value
    // here is a fill to spread, not something the user typed.
    if (typed.length >= CODE_LENGTH) {
      spread(0, typed.slice(0, CODE_LENGTH));
      return;
    }

    // Otherwise the last character wins. Typing over a box that already holds
    // a digit yields "57" rather than "7", and keeping the first character
    // would make the box ignore what was just pressed.
    const next = [...digits];
    next[index] = typed[typed.length - 1];
    writeDigits(next);
    if (index < CODE_LENGTH - 1) inputs.current[index + 1]?.focus();
  };

  const handlePaste = (
    index: number,
    event: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    const pasted = digitsOnly(event.clipboardData.getData("text"));
    if (!pasted) return;
    event.preventDefault();
    // A code pasted whole starts at the first box wherever it was dropped;
    // a shorter fragment fills forward from the box that received it.
    spread(
      pasted.length >= CODE_LENGTH ? 0 : index,
      pasted.slice(0, CODE_LENGTH),
    );
  };

  const handleKeyDown = (
    index: number,
    event: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (filled === CODE_LENGTH) onSubmit();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];
      // Backspace in an empty box steps back and clears the one before it,
      // which is what every OTP field does and what the thumb expects.
      if (next[index]) {
        next[index] = "";
        writeDigits(next);
      } else if (index > 0) {
        next[index - 1] = "";
        writeDigits(next);
        inputs.current[index - 1]?.focus();
      }
      return;
    }

    // The boxes are laid out right-to-left with the document, so the arrow
    // that moves to the next box is the left one.
    if (event.key === "ArrowLeft" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      inputs.current[index + 1]?.focus();
    }
    if (event.key === "ArrowRight" && index > 0) {
      event.preventDefault();
      inputs.current[index - 1]?.focus();
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-card bg-surface-alt/60 border border-border p-4 text-center">
        <p className="text-body-sm text-text-secondary">
          کد پنج‌رقمی به این شماره فرستاده شد
        </p>
        <p
          className="font-bold text-text-primary text-title-sm mt-1 tracking-wide"
          dir="ltr"
        >
          {phone}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-body-sm text-primary hover:underline mt-2 cursor-pointer"
        >
          <PencilSquareIcon className="w-4 h-4" />
          ویرایش شماره
        </button>
      </div>

      <div>
        <span
          id="otp-label"
          className="block text-body-sm font-bold text-text-primary mb-2 text-center"
        >
          کد تأیید
        </span>

        {/*
          dir="ltr" on the row: a numeric code reads left-to-right even in a
          right-to-left page, so box one has to sit on the left. Without it
          the first digit typed appears at the right-hand end.
        */}
        <div dir="ltr" className="flex justify-center gap-2 sm:gap-2.5">
          {digits.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                inputs.current[index] = el;
              }}
              type="text"
              inputMode="numeric"
              // Only the first box claims the SMS code, so the browser fills
              // one field and the paste handler spreads it.
              autoComplete={index === 0 ? "one-time-code" : "off"}
              aria-labelledby="otp-label"
              aria-label={`رقم ${index + 1}`}
              // Not maxLength={1}: a pasted five-digit code has to reach
              // onChange intact for the spread above to see it.
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onPaste={(e) => handlePaste(index, e)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onFocus={(e) => e.target.select()}
              autoFocus={index === 0}
              // Green once a digit lands, per the design guideline: five
              // greens is the "code is complete" signal, read before the
              // button below it changes state.
              className={`w-12 h-14 sm:w-[3.25rem] text-center text-title-lg font-bold
                          bg-surface text-text-primary rounded-field border
                          transition-[border-color,box-shadow] duration-150 focus:outline-none
                          ${
                            digit
                              ? "border-success"
                              : "border-border-field hover:border-border-strong"
                          }
                          focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]`}
            />
          ))}
        </div>
      </div>

      <AuthSubmit
        type="button"
        onClick={onSubmit}
        loading={loading}
        // Enabled only on a complete code: a four-digit submit can only fail,
        // and each failure costs one of the three attempts the server allows.
        disabled={filled < CODE_LENGTH}
      >
        {loading ? "در حال بررسی" : submitLabel}
      </AuthSubmit>

      {remaining > 0 ? (
        // The wait stays visible rather than hidden: three sends an hour is
        // the ceiling, and a user who cannot see a clock will spend all three
        // in thirty seconds.
        <div className="space-y-2">
          <p className="text-body-sm text-center text-text-secondary">
            ارسال مجدد کد تا{" "}
            <span dir="ltr" className="font-medium text-text-primary">
              {minutes}:{seconds}
            </span>
          </p>
          <div className="h-1 rounded-pill bg-surface-alt overflow-hidden">
            <motion.div
              className="h-full rounded-pill bg-primary"
              animate={{ scaleX: progress }}
              initial={false}
              style={{ transformOrigin: "right" }}
              transition={reduceMotion ? { duration: 0 } : transition.base}
            />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className="w-full text-body-sm font-bold text-primary hover:underline
                     disabled:opacity-50 disabled:no-underline cursor-pointer"
        >
          ارسال دوباره‌ی کد
        </button>
      )}
    </div>
  );
}
