import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/solid";
import { verifyPayment } from "../api";
import { useSubscription } from "../context/SubscriptionContext";

type Outcome =
  | { kind: "checking" }
  | { kind: "done"; expiresAt: string | null; extended: boolean }
  | { kind: "failed"; message: string };

function jalali(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}

/**
 * Where Zibal sends the customer back to.
 *
 * ⚠️ A frontend route, not a backend one, and deliberately. A redirect from
 * another origin does not carry our SameSite=Strict refresh cookie, so a
 * callback handled server-side would arrive with no session at all — and
 * closing that gap would mean a fourth SECURITY DEFINER aperture. Here the
 * page loads normally, the session is already in memory, and the browser
 * asks the API to verify.
 *
 * ⚠️ The query string is never trusted. `success=1` is something anyone can
 * type into the address bar; the only thing taken from it is the trackId,
 * which the server checks against its own row before asking Zibal.
 */
export default function PaymentCallback() {
  const [params] = useSearchParams();
  const { reload } = useSubscription();
  const [outcome, setOutcome] = useState<Outcome>({ kind: "checking" });

  // React runs effects twice in development, and verifying twice would be a
  // second round trip for one payment. Harmless — the server answers "already
  // settled" — but it puts a confusing line in the log for no reason.
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

    verifyPayment(trackId)
      .then(async ({ data }) => {
        setOutcome({
          kind: "done",
          expiresAt: data.expires_at,
          extended: data.extended,
        });

        // So the banner and the subscription page show the new date rather
        // than the countdown that was just paid off.
        await reload();
      })
      .catch((error: unknown) => {
        const message =
          typeof error === "object" &&
          error !== null &&
          "response" in error &&
          typeof (error as { response?: { data?: { error?: string } } })
            .response?.data?.error === "string"
            ? (error as { response: { data: { error: string } } }).response.data
                .error
            : "تأیید پرداخت انجام نشد.";

        setOutcome({ kind: "failed", message });
      });
  }, [params, reload]);

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
            <CheckCircleIcon className="w-14 h-14 text-success mx-auto" />
            <h1 className="mt-4 text-lg font-bold text-text-primary">
              {outcome.extended
                ? "پرداخت شما با موفقیت انجام شد"
                : "این پرداخت قبلاً ثبت شده است"}
            </h1>
            {outcome.expiresAt && (
              <p className="mt-2 text-sm text-text-secondary">
                اشتراک شما تا تاریخ {jalali(outcome.expiresAt)} فعال است.
              </p>
            )}
          </>
        )}

        {outcome.kind === "failed" && (
          <>
            <ExclamationCircleIcon className="w-14 h-14 text-danger mx-auto" />
            <h1 className="mt-4 text-lg font-bold text-text-primary">
              پرداخت تکمیل نشد
            </h1>
            <p className="mt-2 text-sm text-text-secondary">
              {outcome.message}
            </p>
            {/* Not "try again": if the money did leave their account, the
                nightly job settles it within a day, and telling them to pay
                a second time is the one thing that could take it twice. */}
            <p className="mt-3 text-xs text-text-secondary">
              اگر مبلغ از حساب شما کسر شده است، اشتراکتان حداکثر تا ۲۴ ساعت
              آینده به‌صورت خودکار فعال می‌شود.
            </p>
          </>
        )}

        <Link
          to="/subscription"
          className="mt-6 inline-block px-6 py-2 rounded-2xl bg-primary text-text-inverse font-medium hover:bg-primary-hover transition-colors"
        >
          بازگشت به صفحه‌ی اشتراک
        </Link>
      </div>
    </div>
  );
}
