import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/solid";
import { verifySmsTopup } from "../api";
import { errorText } from "../utils/errors";

type Outcome =
  | { kind: "checking" }
  | { kind: "done"; credited: boolean; balanceRials: number | null }
  | { kind: "failed"; message: string };

function toToman(rials: number): string {
  return (rials / 10).toLocaleString("fa-IR");
}

/**
 * Where Zibal sends the customer back to after a wallet top-up.
 *
 * The subscription's twin, and separate for the reason lib/zibal now takes a
 * callback per purchase: this trackId is in `sms_topups`, and the
 * subscription callback would ask the server to verify it against
 * `payments`, where it does not exist.
 *
 * ⚠️ A frontend route, not a backend one. A redirect from another origin
 * carries none of our SameSite=Strict cookies, so a callback handled
 * server-side would arrive with no session at all.
 *
 * ⚠️ The query string is never trusted. Anyone can type `success=1` into the
 * address bar; the only thing taken from it is the trackId, which the server
 * checks against its own row before asking Zibal.
 */
export default function SmsWalletCallback() {
  const [params] = useSearchParams();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "checking" });

  // React runs effects twice in development, and verifying twice would be a
  // second round trip for one payment. Harmless — the server credits once —
  // but it puts a confusing line in the log for no reason.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const trackId = params.get("trackId");

    if (!trackId) {
      setOutcome({
        kind: "failed",
        message: "اطلاعات بازگشت از درگاه ناقص است.",
      });
      return;
    }

    verifySmsTopup(trackId)
      .then(({ data }) =>
        setOutcome({
          kind: "done",
          credited: data.credited,
          balanceRials: data.balance_rials,
        }),
      )
      .catch((error: unknown) =>
        setOutcome({
          kind: "failed",
          message: errorText(error, "تأیید پرداخت انجام نشد."),
        }),
      );
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
      <div className="bg-surface rounded-3xl shadow-lg p-8 max-w-md w-full text-center">
        {outcome.kind === "checking" && (
          <>
            <p className="text-text-primary font-medium">
              در حال بررسی پرداخت...
            </p>
            <p className="mt-2 text-sm text-text-secondary">
              این صفحه را نبندید.
            </p>
          </>
        )}

        {outcome.kind === "done" && (
          <>
            <CheckCircleIcon className="w-14 h-14 text-success-fg mx-auto" />
            <h1 className="mt-4 text-lg font-bold text-text-primary">
              {outcome.credited
                ? "کیف پول پیامکی شما شارژ شد"
                : "این پرداخت قبلاً ثبت شده است"}
            </h1>
            {outcome.balanceRials !== null && (
              <p className="mt-2 text-sm text-text-secondary">
                اعتبار فعلی: {toToman(outcome.balanceRials)} تومان
              </p>
            )}
          </>
        )}

        {outcome.kind === "failed" && (
          <>
            <ExclamationCircleIcon className="w-14 h-14 text-danger-fg mx-auto" />
            <h1 className="mt-4 text-lg font-bold text-text-primary">
              پرداخت تکمیل نشد
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {outcome.message}
            </p>
            {/* Not "try again": if the money did leave their account, the
                settlement job credits it, and telling them to pay a second
                time is the one thing that could take it twice. */}
            <p className="mt-3 text-xs text-text-secondary">
              اگر مبلغ از حساب شما کسر شده است، اعتبار پیامکی حداکثر تا ۲۴ ساعت
              آینده به‌صورت خودکار اضافه می‌شود.
            </p>
          </>
        )}

        <Link
          to="/sms-wallet"
          className="mt-6 inline-block px-6 py-2 rounded-2xl bg-primary text-text-inverse font-medium hover:bg-primary-hover transition-colors"
        >
          بازگشت به کیف پول پیامکی
        </Link>
      </div>
    </div>
  );
}
