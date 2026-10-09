import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { getSmsWallet } from "../api";
import { useAuth } from "../context/AuthContext";

/** Below three messages' worth, a shop is about to be surprised. */
const WARN_AT_MESSAGES = 3;

const DISMISS_KEY = "dofixo:sms-balance-dismissed";

/**
 * A quiet warning that the SMS credit is running out.
 *
 * ⚠️ Shown only to admins and above, like SubscriptionBanner and for the
 * same reason: a technician has nothing to do with what the shop pays, and
 * the figure is money. They get the checkbox's own «اعتبار کافی نیست»
 * instead, which carries no amount.
 *
 * ⚠️ Rendered on the devices page rather than in the layout. That is where a
 * shop is standing when it would send a message, and a banner above every
 * screen is one nobody reads by the time it matters — the lesson
 * SubscriptionBanner already encodes by staying quiet until the last week.
 * The wallet page does not need it: the balance is the first thing on it.
 *
 * Dismissible for the session. Not forever: the credit running out is a
 * recurring fact, not a notice to be acknowledged once.
 */
export default function SmsBalanceBanner() {
  const { isAtLeast } = useAuth();
  const [messagesLeft, setMessagesLeft] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === "1",
  );

  const admin = isAtLeast("admin");

  useEffect(() => {
    if (!admin || dismissed) return;

    // A failure leaves it null and the banner stays hidden. A shop whose
    // wallet endpoint is briefly unhappy should not be shown a warning about
    // credit we could not read.
    getSmsWallet()
      .then(({ data }) => setMessagesLeft(data.approximate_messages_left))
      .catch(() => setMessagesLeft(null));
  }, [admin, dismissed]);

  if (
    !admin ||
    dismissed ||
    messagesLeft === null ||
    messagesLeft > WARN_AT_MESSAGES
  ) {
    return null;
  }

  const empty = messagesLeft <= 0;

  return (
    <div
      className={`mb-4 flex flex-wrap items-center gap-2 rounded-2xl px-4 py-3 ${
        empty
          ? "bg-danger-soft text-danger-fg"
          : "bg-warning-soft text-warning-fg"
      }`}
    >
      <ExclamationTriangleIcon className="w-5 h-5 shrink-0" />

      <span className="text-body-sm">
        {empty
          ? "اعتبار پیامکی شما تمام شده است."
          : "اعتبار پیامکی شما رو به اتمام است."}
      </span>

      <Link
        to="/sms-wallet"
        className="text-body-sm font-medium underline underline-offset-4"
      >
        شارژ کیف پول
      </Link>

      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem(DISMISS_KEY, "1");
          setDismissed(true);
        }}
        className="mr-auto text-body-sm opacity-70 hover:opacity-100 cursor-pointer"
      >
        بستن
      </button>
    </div>
  );
}
