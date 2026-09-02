import { useEffect, useState } from "react";

/** Three minutes, matching OTP_TTL_MS on the server. */
const CODE_LIFETIME_SECONDS = 180;

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

  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");

  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-sm text-text-secondary">
          کد پنج‌رقمی به این شماره فرستاده شد
        </p>
        <p className="font-semibold text-text-primary mt-1" dir="ltr">
          {phone}
        </p>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-primary hover:underline mt-1"
        >
          ویرایش شماره
        </button>
      </div>

      <div>
        <label className="block text-sm font-medium text-text-primary mb-1">
          کد تأیید
        </label>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // Not maxLength={5}: Persian digits are one character each, but a
          // pasted code may carry spaces the server trims anyway.
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSubmit();
            }
          }}
          dir="ltr"
          autoFocus
          placeholder="- - - - -"
          className="w-full border border-border rounded-lg px-3 py-2 text-center
                     tracking-[0.5em] text-lg focus:outline-none focus:ring-2
                     focus:ring-primary bg-surface text-text-primary"
        />
      </div>

      <button
        type="button"
        onClick={onSubmit}
        disabled={loading}
        className="w-full bg-primary hover:bg-primary-hover text-text-inverse
                   font-semibold py-2 rounded-lg transition disabled:opacity-50"
      >
        {loading ? "در حال بررسی..." : submitLabel}
      </button>

      {remaining > 0 ? (
        // The button stays disabled rather than hidden, so the wait is
        // visible: three sends an hour is the ceiling, and a user who cannot
        // see one is counting will spend all three in thirty seconds.
        <p className="text-sm text-center text-text-secondary">
          ارسال مجدد کد تا{" "}
          <span dir="ltr" className="font-mono">
            {minutes}:{seconds}
          </span>
        </p>
      ) : (
        <button
          type="button"
          onClick={onResend}
          disabled={loading}
          className="w-full text-sm text-primary hover:underline disabled:opacity-50"
        >
          ارسال دوباره‌ی کد
        </button>
      )}
    </div>
  );
}
