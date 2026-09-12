import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  ChatBubbleLeftRightIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/solid";
import {
  getSmsMessages,
  getSmsSettings,
  getSmsTopups,
  getSmsWallet,
  startSmsTopup,
  updateSmsSettings,
} from "../api";
import { errorText } from "../utils/errors";
import {
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  tr,
} from "../utils/tableClasses";
import type { SmsMessageRow, SmsTopup, SmsWalletStatus } from "../types/api";

/** Rials in the database, tomans on screen — the whole app works this way. */
function toToman(rials: number): string {
  return (rials / 10).toLocaleString("fa-IR");
}

function jalali(iso: string): string {
  return new Date(iso).toLocaleDateString("fa-IR");
}

/**
 * The presets from the brief, in tomans. A shop picks one or types its own;
 * either way the amount is checked again on the server, which is the only
 * place it counts.
 */
const PRESET_TOMANS = [20_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

const MIN_TOMAN = 20_000;

const KIND_LABELS: Record<string, string> = {
  device_accepted: "پذیرش",
  device_ready: "آماده تحویل",
  device_delivered: "تحویل",
};

/**
 * Every status a message can end in, and what it means to a shop owner.
 *
 * Four of the seven are refusals rather than failures — nothing was sent and
 * nothing was charged — and the wording keeps that distinction, because the
 * question a shop asks of this table is «چرا نرفت».
 */
const MESSAGE_STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: "ارسال شد", tone: "bg-success-soft text-success-fg" },
  pending: { label: "در حال ارسال", tone: "bg-info-soft text-info-fg" },
  failed: { label: "ناموفق", tone: "bg-danger-soft text-danger-fg" },
  refunded: { label: "ناموفق — هزینه برگشت", tone: "bg-warning-soft text-warning-fg" },
  insufficient_balance: {
    label: "اعتبار کافی نبود",
    tone: "bg-warning-soft text-warning-fg",
  },
  invalid_phone: {
    label: "شماره نامعتبر",
    tone: "bg-warning-soft text-warning-fg",
  },
  disabled: { label: "غیرفعال بود", tone: "bg-surface-alt text-text-secondary" },
};

const TOPUP_STATUS: Record<string, { label: string; tone: string }> = {
  verified: { label: "موفق", tone: "bg-success-soft text-success-fg" },
  pending: { label: "در انتظار پرداخت", tone: "bg-info-soft text-info-fg" },
  paid: { label: "در حال تأیید", tone: "bg-info-soft text-info-fg" },
  failed: { label: "ناموفق", tone: "bg-danger-soft text-danger-fg" },
};

/*
 * Two tabs, not three.
 *
 * There was a «گردش حساب» tab over `sms_wallet_transactions`, and it said
 * nothing the other two do not: every line in it is either a top-up (first
 * tab) or a message (second), restated as a signed amount. The ledger is
 * still written on every debit and credit — it is what makes the balance
 * auditable and what a refund is proved against — it just is not a screen.
 * `GET /sms/wallet/transactions` and `getSmsWalletTransactions` stay for
 * that reason: support reads them, a shop does not.
 */
type Tab = "topups" | "messages";

export default function SmsWallet() {
  const [wallet, setWallet] = useState<SmsWalletStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);

  const [amount, setAmount] = useState<string>(String(PRESET_TOMANS[2]));
  const [submitting, setSubmitting] = useState(false);

  const [tab, setTab] = useState<Tab>("topups");
  const [topups, setTopups] = useState<SmsTopup[]>([]);
  const [messages, setMessages] = useState<SmsMessageRow[]>([]);

  const load = useCallback(async () => {
    const [walletRes, settingsRes] = await Promise.all([
      getSmsWallet(),
      getSmsSettings(),
    ]);

    setWallet(walletRes.data);
    setEnabled(settingsRes.data.enabled);
  }, []);

  useEffect(() => {
    load().catch((error: unknown) =>
      toast.error(errorText(error, "خطا در دریافت اطلاعات کیف پول")),
    );
  }, [load]);

  useEffect(() => {
    const fetchers: Record<Tab, () => Promise<void>> = {
      topups: () => getSmsTopups().then(({ data }) => setTopups(data.data)),
      messages: () =>
        getSmsMessages().then(({ data }) => setMessages(data.data)),
    };

    const fetcher = fetchers[tab];

    fetcher().catch((error: unknown) =>
      toast.error(errorText(error, "خطا در دریافت تاریخچه")),
    );
  }, [tab]);

  async function handleToggle() {
    setSavingToggle(true);

    try {
      const { data } = await updateSmsSettings(!enabled);
      setEnabled(data.enabled);
      toast.success(
        data.enabled
          ? "ارسال پیامک به مشتریان فعال شد"
          : "ارسال پیامک به مشتریان غیرفعال شد",
      );
    } catch (error: unknown) {
      toast.error(errorText(error, "خطا در ذخیره تنظیمات"));
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleTopup() {
    const tomans = Number(amount);

    if (!Number.isInteger(tomans) || tomans < MIN_TOMAN) {
      toast.error(`حداقل مبلغ شارژ ${MIN_TOMAN.toLocaleString("fa-IR")} تومان است`);
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await startSmsTopup(tomans * 10);

      // ⚠️ A full navigation, not fetch and not a new tab. Zibal refuses to
      // open the gateway unless the request carries a Referer matching the
      // registered domain, and only a real navigation from this origin
      // sends one.
      window.location.href = data.redirect_url;
    } catch (error: unknown) {
      toast.error(errorText(error, "ارتباط با درگاه پرداخت برقرار نشد"));
      setSubmitting(false);
    }
  }

  if (!wallet) {
    return (
      <div className="text-text-secondary text-body-sm">در حال بارگذاری...</div>
    );
  }

  const low = wallet.balance_rials < wallet.message_price_rials * 3;

  return (
    <div className="space-y-6">
      {/* ── The balance ─────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="p-2.5 rounded-2xl bg-primary-soft text-primary shrink-0">
              <WalletIcon className="w-6 h-6" />
            </span>
            <div>
              <p className="text-body-sm text-text-secondary">اعتبار پیامکی</p>
              <p
                className={`text-2xl font-bold ${
                  low ? "text-warning-fg" : "text-text-primary"
                }`}
              >
                {toToman(wallet.balance_rials)}{" "}
                <span className="text-body-sm font-normal">تومان</span>
              </p>
              {/*
                How many messages, never what one costs.
                --------------------------------------------------------
                The per-message price used to sit here. It is a number a
                shop can do nothing with — it cannot choose a cheaper
                message — and printing a tariff beside a balance invites
                arithmetic against a figure we may change. The count is
                the same fact in the form the question is actually asked
                in: «چند تا پیامک می‌تونم بفرستم».

                `message_price_rials` is still read, one line above, to
                decide when the balance is low. That is the price doing
                its job without being shown.
              */}
              <p className="mt-1 text-body-sm text-text-secondary">
                حدود {wallet.approximate_messages_left.toLocaleString("fa-IR")}{" "}
                پیامک
              </p>
            </div>
          </div>

          {/* The toggle sits beside the balance rather than on the settings
              page, because the two questions a shop has about this feature —
              "is it on" and "can I afford it" — are the same question. */}
          <SmsToggleButton
            enabled={enabled}
            saving={savingToggle}
            onToggle={handleToggle}
          />
        </div>

        {!enabled && (
          <p className="mt-4 text-body-sm text-text-secondary bg-surface-alt rounded-2xl p-3">
            ارسال پیامک به مشتریان خاموش است. تا وقتی روشنش نکنید هیچ پیامکی
            برای مشتریان ارسال نمی‌شود و هزینه‌ای کسر نمی‌گردد.
          </p>
        )}
      </div>

      {/* ── Topping up ──────────────────────────────────────── */}
      <div className="bg-surface border border-border rounded-3xl p-6">
        <h2 className="text-body font-bold text-text-primary mb-4">
          شارژ کیف پول پیامکی
        </h2>

        <div className="flex flex-wrap gap-2 mb-4">
          {PRESET_TOMANS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => setAmount(String(preset))}
              className={`px-4 py-2 rounded-2xl text-body-sm border transition-colors cursor-pointer ${
                Number(amount) === preset
                  ? "bg-primary text-text-inverse border-primary"
                  : "bg-surface-alt text-text-primary border-border hover:bg-primary-soft-hover"
              }`}
            >
              {preset.toLocaleString("fa-IR")} تومان
            </button>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <input
              type="number"
              min={MIN_TOMAN}
              step={1000}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              className="w-full px-4 py-2.5 pl-16 rounded-2xl bg-surface-alt border border-border text-text-primary focus:outline-none focus:border-border-strong"
              placeholder="مبلغ دلخواه"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-body-sm text-text-secondary pointer-events-none">
              تومان
            </span>
          </div>

          <button
            type="button"
            onClick={handleTopup}
            disabled={submitting}
            className="px-6 py-2.5 rounded-2xl bg-primary text-text-inverse font-medium hover:bg-primary-hover transition-colors disabled:opacity-60 cursor-pointer shrink-0"
          >
            {submitting ? "در حال انتقال به درگاه..." : "پرداخت"}
          </button>
        </div>

        <p className="mt-3 text-body-sm text-text-secondary">
          این مبلغ فقط برای خرید اعتبار پیامکی است و ربطی به اشتراک دوفیکسو
          ندارد.
        </p>
      </div>

      {/* ── History ─────────────────────────────────────────── */}
      <div>
        <div className="flex gap-2 mb-4">
          {(
            [
              ["topups", "تاریخچه شارژ"],
              ["messages", "پیامک‌های ارسالی"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-2xl text-body-sm transition-colors cursor-pointer ${
                tab === key
                  ? "bg-primary text-text-inverse"
                  : "bg-surface-alt text-text-secondary hover:text-text-primary"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "topups" && (
          <div className={tableCard}>
            <div className={tableScroll}>
              <table className="w-full table-shell">
                <thead className={thead}>
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>مبلغ</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>شماره پیگیری</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {topups.map((row) => (
                    <tr key={row.id} className={tr}>
                      <td className={tdMuted}>{jalali(row.created_at)}</td>
                      <td className={td}>{toToman(row.amount_rials)} تومان</td>
                      <td className={td}>
                        <StatusBadge map={TOPUP_STATUS} value={row.status} />
                      </td>
                      <td className={tdMuted}>{row.ref_number ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {topups.length === 0 && <Empty text="هنوز شارژی انجام نشده است." />}
          </div>
        )}

        {/*
          No «هزینه» column. It printed the same per-message price on every
          row — the figure the balance card no longer carries either — so
          leaving it here would put back, once per message, exactly what was
          taken off the card. What a shop asks of this table is who was
          told and whether it went.
        */}
        {tab === "messages" && (
          <div className={tableCard}>
            <div className={tableScroll}>
              <table className="w-full table-shell">
                <thead className={thead}>
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>مشتری</th>
                    <th className={th}>دستگاه</th>
                    <th className={th}>نوع پیام</th>
                    <th className={th}>وضعیت</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {messages.map((row) => (
                    <tr key={row.id} className={tr}>
                      <td className={tdMuted}>{jalali(row.created_at)}</td>
                      <td className={td}>{row.customer_name ?? "—"}</td>
                      <td className={td}>{row.device_name ?? "—"}</td>
                      <td className={td}>
                        {KIND_LABELS[row.kind] ?? row.kind}
                      </td>
                      <td className={td}>
                        <StatusBadge map={MESSAGE_STATUS} value={row.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {messages.length === 0 && (
              <Empty text="هنوز پیامکی برای مشتریان ارسال نشده است." />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The master switch, as a button rather than a checkbox.
 *
 * A checkbox states a fact and leaves you to read the label for what the
 * fact is. This is the one setting in the app that spends the shop's money
 * without anyone pressing anything afterwards, so it says its own state in
 * colour: green while it is on, red while it is off. The wording moves with
 * it — «فعال است» / «غیرفعال است» — so the control is legible without the
 * colour too, which is the part a colour-blind owner relies on.
 */
function SmsToggleButton({
  enabled,
  saving,
  onToggle,
}: {
  enabled: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={saving}
      aria-pressed={enabled}
      className={`shrink-0 inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl
                  border text-body-sm font-bold transition-colors cursor-pointer
                  disabled:opacity-60 disabled:cursor-not-allowed ${
                    enabled
                      ? "bg-success-soft text-success-fg border-success/25 hover:bg-success-soft-hover"
                      : "bg-danger-soft text-danger-fg border-danger/25 hover:bg-danger-soft-hover"
                  }`}
    >
      {enabled ? (
        <CheckCircleIcon className="w-5 h-5 shrink-0" />
      ) : (
        <XCircleIcon className="w-5 h-5 shrink-0" />
      )}
      ارسال پیامک به مشتریان {enabled ? "فعال است" : "غیرفعال است"}
    </button>
  );
}

function StatusBadge({
  map,
  value,
}: {
  map: Record<string, { label: string; tone: string }>;
  value: string;
}) {
  const entry = map[value] ?? {
    label: value,
    tone: "bg-surface-alt text-text-secondary",
  };

  return (
    <span
      className={`inline-block px-2.5 py-1 rounded-full text-body-sm ${entry.tone}`}
    >
      {entry.label}
    </span>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="py-10 text-center text-text-secondary text-body-sm">
      <ChatBubbleLeftRightIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
      {text}
    </div>
  );
}
