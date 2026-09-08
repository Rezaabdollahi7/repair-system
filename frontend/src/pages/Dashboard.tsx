import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { animate, motion, useReducedMotion } from "framer-motion";
import toast from "react-hot-toast";
import {
  CubeIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  CalendarIcon,
  CogIcon,
  DocumentTextIcon,
  BanknotesIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/solid";
import { getDashboardStats } from "../api";
import { formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import { staggerContainer, staggerItem, transition } from "../motion";
import type {
  DashboardStats,
  DashboardTopItem,
  DashboardTransaction,
} from "../types/api";

/** Two more than the four the schema's default status list carries. */
const DEVICE_STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  diagnosing: "در حال بررسی",
  waiting_for_parts: "منتظر قطعه",
  repairing: "در حال تعمیر",
  repaired: "تعمیر شده",
  delivered: "تحویل شده",
  unrepairable: "غیرقابل تعمیر",
  ready_for_pickup: "آماده تحویل",
  not_repaired: "تعمیر نشد",
};

/** The four tints a tile's icon can take. Fills only — never tile text. */
type Tone = "primary" | "success" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary",
  success: "bg-success-soft text-success-fg",
  warning: "bg-warning-soft text-warning-fg",
  danger: "bg-danger-soft text-danger-fg",
};

/* ── Pieces ─────────────────────────────────────────────────────────── */

/**
 * Counts up to `value` on mount.
 *
 * Rendered through toPersianDigits like every other number on the page, and
 * skipped outright under prefers-reduced-motion — a number ticking upward is
 * exactly the kind of motion that setting is asking not to see.
 */
function CountUp({ value }: { value: number }) {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const controls = animate(0, value, {
      duration: 0.8,
      ease: "easeOut",
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, reduceMotion]);

  // Read past the counter rather than writing the final value into state:
  // setting state from an effect just to skip an animation is a render the
  // component does not need, and the lint rule against it is right.
  return <>{toPersianDigits(reduceMotion ? value : shown)}</>;
}

interface StatCardProps {
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: Tone;
  hint?: React.ReactNode;
  to?: string;
}

/**
 * Label, value, optional hint, and an icon in a soft square.
 *
 * The value deliberately does not carry tabular-nums: at this size the
 * font's proportional figures set better, and nothing here is a column that
 * needs its digits to line up vertically.
 */
function StatCard({ label, value, icon: Icon, tone = "primary", hint, to }: StatCardProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body-sm text-text-secondary">{label}</p>
          <p className="text-title-lg font-bold text-text-primary mt-1 break-words">
            {value}
          </p>
        </div>
        <span
          className={`shrink-0 w-10 h-10 rounded-field flex items-center justify-center ${TONE_CLASS[tone]}`}
        >
          <Icon className="w-5 h-5" />
        </span>
      </div>
      {hint && <p className="text-body-xs text-text-secondary mt-2">{hint}</p>}
    </>
  );

  // h-full on both: the grid stretches its cells, but without this the card
  // inside one only grows to its own content, so a tile carrying a hint
  // stands taller than the ones beside it.
  const className =
    "bg-surface border border-border rounded-card shadow-sm p-5 block h-full transition-colors" +
    (to ? " hover:border-primary-border" : "");

  return (
    <motion.div variants={staggerItem} className="h-full">
      {to ? (
        <Link to={to} className={className}>
          {body}
        </Link>
      ) : (
        <div className={className}>{body}</div>
      )}
    </motion.div>
  );
}

function Section({
  title,
  icon: Icon,
  action,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action?: { label: string; to: string };
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-title-sm font-bold text-text-primary flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-secondary" />
          {title}
        </h2>
        {action && (
          <Link
            to={action.to}
            className="text-body-sm text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            {action.label}
            <ArrowLeftIcon className="w-4 h-4" />
          </Link>
        )}
      </div>
      <motion.div variants={staggerContainer} initial="hidden" animate="visible">
        {children}
      </motion.div>
    </section>
  );
}

function Panel({
  title,
  icon: Icon,
  action,
  empty,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  action: { label: string; to: string };
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="bg-surface border border-border rounded-card shadow-sm p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-title-sm font-bold text-text-primary flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-secondary" />
          {title}
        </h2>
        <Link
          to={action.to}
          className="text-body-sm text-primary hover:underline shrink-0"
        >
          {action.label}
        </Link>
      </div>
      {children.length === 0 ? (
        <p className="text-center text-body-sm text-text-secondary py-8">
          {empty}
        </p>
      ) : (
        <div>{children}</div>
      )}
    </div>
  );
}

function RecentTransactionItem({ tx }: { tx: DashboardTransaction }) {
  const isPurchase = tx.type === "purchase";
  const label = isPurchase ? "خرید" : tx.type === "sale" ? "فروش" : "تنظیم";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${isPurchase ? "bg-success" : "bg-danger"}`}
        />
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-text-primary truncate">
            [{tx.item_code}] {tx.item_name}
          </p>
          <p className="text-body-xs text-text-secondary">
            {new Date(tx.created_at).toLocaleDateString("fa-IR")}
          </p>
        </div>
      </div>
      <div className="text-left shrink-0">
        <p
          className={`text-body-sm font-bold ${isPurchase ? "text-success-fg" : "text-danger-fg"}`}
        >
          {isPurchase ? "+" : "−"}
          {toPersianDigits(Math.abs(tx.quantity))} عدد
        </p>
        <p className="text-body-xs text-text-secondary">{label}</p>
      </div>
    </div>
  );
}

function TopItemItem({
  item,
  index,
}: {
  item: DashboardTopItem;
  index: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        <span className="shrink-0 w-6 h-6 rounded-field bg-surface-alt text-text-secondary text-body-xs font-bold flex items-center justify-center">
          {toPersianDigits(index + 1)}
        </span>
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-text-primary truncate">
            {item.name}
          </p>
          <p className="text-body-xs text-text-secondary">{item.code}</p>
        </div>
      </div>
      <div className="text-left shrink-0">
        <p className="text-body-sm font-bold text-text-primary">
          {formatPersianCurrency(item.revenue)} ریال
        </p>
        <p className="text-body-xs text-text-secondary">
          {toPersianDigits(item.sold_quantity)} عدد فروش
        </p>
      </div>
    </div>
  );
}

/**
 * Device counts by status, as a bar per status rather than the row of pills
 * this used to be — pills gave every status the same visual weight, which is
 * the one thing a distribution is supposed to show.
 *
 * Every bar is the same hue. Length carries the magnitude; shading the bars
 * by rank would encode the ordering twice and mean nothing when two statuses
 * tie. Colouring them by status instead would spend the reserved good/warning
 * /danger palette on nine workflow states that are not severities.
 */
function StatusDistribution({
  rows,
}: {
  rows: { status: string; count: number }[];
}) {
  const reduceMotion = useReducedMotion();
  const sorted = [...rows].sort((a, b) => b.count - a.count);
  const max = Math.max(...sorted.map((r) => r.count), 1);
  const total = sorted.reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="bg-surface border border-border rounded-card shadow-sm p-5">
      <div className="flex items-baseline justify-between gap-3 mb-4">
        <h2 className="text-title-sm font-bold text-text-primary">
          توزیع وضعیت دستگاه‌ها
        </h2>
        <span className="text-body-xs text-text-secondary shrink-0">
          {toPersianDigits(total)} دستگاه
        </span>
      </div>

      <ul className="space-y-2.5">
        {sorted.map((row) => {
          const label = DEVICE_STATUS_LABELS[row.status] || row.status;
          const share = (row.count / max) * 100;

          return (
            <li
              key={row.status}
              className="grid grid-cols-[7.5rem_1fr_2.5rem] items-center gap-3"
              title={`${label}: ${toPersianDigits(row.count)}`}
            >
              <span className="text-body-sm text-text-secondary truncate">
                {label}
              </span>
              {/* Track is a lighter step of the bar's own hue, so an empty
                  bar still reads as part of the same scale. */}
              <span className="h-2 rounded-pill bg-primary-soft overflow-hidden">
                <motion.span
                  className="block h-full rounded-pill bg-primary origin-right"
                  initial={reduceMotion ? false : { scaleX: 0 }}
                  animate={{ scaleX: share / 100 }}
                  transition={
                    reduceMotion ? { duration: 0 } : { ...transition.slow, delay: 0.1 }
                  }
                />
              </span>
              <span className="text-body-sm font-bold text-text-primary text-left tabular-nums">
                {toPersianDigits(row.count)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Mirrors the tile grid so the page does not jump when the data lands. */
function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      {[0, 1].map((section) => (
        <section key={section} className="mb-8">
          <div className="h-5 w-40 rounded-field bg-surface-alt mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((tile) => (
              <div
                key={tile}
                className="h-[6.5rem] rounded-card border border-border bg-surface"
              />
            ))}
          </div>
        </section>
      ))}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-64 rounded-card border border-border bg-surface" />
        <div className="h-64 rounded-card border border-border bg-surface" />
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

const TILE_GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((res) => setStats(res.data))
      .catch(() => toast.error("خطا در دریافت آمار"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <DashboardSkeleton />;
  if (!stats) return null;

  const monthNetPositive = stats.month.net >= 0;
  const todayNetPositive = stats.today.net >= 0;

  return (
    <div dir="rtl">
      {stats.items.low_stock > 0 && (
        <div className="flex items-center gap-3 bg-warning-soft border border-warning/25 rounded-card p-4 mb-6">
          <span className="shrink-0 w-9 h-9 rounded-field bg-warning/15 flex items-center justify-center">
            <ExclamationTriangleIcon className="w-5 h-5 text-warning-fg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-bold text-warning-fg">
              هشدار کم‌موجودی
            </p>
            <p className="text-body-sm text-warning-fg/80">
              {toPersianDigits(stats.items.low_stock)} کالا به حداقل موجودی
              رسیده یا کمتر از آن است
            </p>
          </div>
          <Link
            to="/reports/stock?lowStock=true"
            className="shrink-0 text-body-sm font-bold px-3.5 py-2 rounded-field
                       bg-surface/70 border border-current/20 text-warning-fg
                       hover:bg-surface transition-colors"
          >
            مشاهده
          </Link>
        </div>
      )}

      <Section
        title="دستگاه‌ها"
        icon={WrenchScrewdriverIcon}
        action={{ label: "همهٔ دستگاه‌ها", to: "/devices" }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <StatCard
            label="کل دستگاه‌ها"
            value={<CountUp value={stats.devices?.total || 0} />}
            icon={WrenchScrewdriverIcon}
          />
          <StatCard
            label="پذیرش امروز"
            value={<CountUp value={stats.devices?.today || 0} />}
            icon={CalendarIcon}
          />
          <StatCard
            label="در حال تعمیر"
            value={<CountUp value={stats.devices?.repairing || 0} />}
            icon={CogIcon}
            tone="warning"
          />
        </div>

        {stats.devices.by_status.length > 0 && (
          <StatusDistribution rows={stats.devices.by_status} />
        )}
      </Section>

      <Section
        title="فاکتورهای تعمیر"
        icon={DocumentTextIcon}
        action={{ label: "همهٔ فاکتورها", to: "/repair-invoices" }}
      >
        <div className={TILE_GRID}>
          <StatCard
            label="فاکتورهای امروز"
            value={<CountUp value={stats.repair_invoices?.today_count || 0} />}
            icon={DocumentTextIcon}
          />
          <StatCard
            label="درآمد امروز"
            value={`${formatPersianCurrency(stats.repair_invoices?.today_revenue || 0)} ریال`}
            icon={BanknotesIcon}
            tone="success"
          />
          <StatCard
            label="درآمد این ماه"
            value={`${formatPersianCurrency(stats.repair_invoices?.month_revenue || 0)} ریال`}
            icon={CalendarIcon}
            tone="success"
          />
          <StatCard
            label="در انتظار پرداخت"
            value={
              <CountUp
                value={stats.repair_invoices?.pending_payment_count || 0}
              />
            }
            hint={
              stats.repair_invoices?.issued_unpaid_amount
                ? `${formatPersianCurrency(stats.repair_invoices.issued_unpaid_amount)} ریال وصول‌نشده`
                : undefined
            }
            icon={ClockIcon}
            tone="warning"
          />
        </div>
      </Section>

      <Section
        title="فروش و خرید امروز"
        icon={CurrencyDollarIcon}
        action={{ label: "گزارش سود و زیان", to: "/reports/profit" }}
      >
        <div className={TILE_GRID}>
          <StatCard
            label="فروش امروز"
            value={`${formatPersianCurrency(stats.today.sale)} ریال`}
            icon={ArrowTrendingUpIcon}
            tone="success"
          />
          <StatCard
            label="خرید امروز"
            value={`${formatPersianCurrency(stats.today.purchase)} ریال`}
            icon={ArrowTrendingDownIcon}
            tone="warning"
          />
          <StatCard
            label="سود خالص امروز"
            value={`${formatPersianCurrency(stats.today.net)} ریال`}
            icon={CurrencyDollarIcon}
            tone={todayNetPositive ? "success" : "danger"}
          />
          <StatCard
            label="کل کالاها"
            value={<CountUp value={stats.items.total} />}
            hint={`${toPersianDigits(stats.items.low_stock)} کالا کم‌موجود`}
            icon={CubeIcon}
            to="/items"
          />
        </div>
      </Section>

      <Section title="این ماه" icon={CalendarIcon}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="فروش این ماه"
            value={`${formatPersianCurrency(stats.month.sale)} ریال`}
            icon={ArrowTrendingUpIcon}
            tone="success"
          />
          <StatCard
            label="خرید این ماه"
            value={`${formatPersianCurrency(stats.month.purchase)} ریال`}
            icon={ArrowTrendingDownIcon}
            tone="warning"
          />
          <StatCard
            label="سود این ماه"
            value={`${formatPersianCurrency(stats.month.net)} ریال`}
            icon={CurrencyDollarIcon}
            tone={monthNetPositive ? "success" : "danger"}
          />
        </div>
      </Section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel
          title="آخرین تراکنش‌ها"
          icon={ClockIcon}
          action={{ label: "مشاهده همه", to: "/reports/transactions" }}
          empty="هنوز تراکنشی ثبت نشده"
        >
          {stats.recent_transactions.map((tx) => (
            <RecentTransactionItem key={tx.id} tx={tx} />
          ))}
        </Panel>

        <Panel
          title="پرفروش‌ترین کالاها"
          icon={ArrowTrendingUpIcon}
          action={{ label: "گزارش کامل", to: "/reports/profit" }}
          empty="هنوز فروشی ثبت نشده"
        >
          {stats.top_items.map((item, index) => (
            <TopItemItem key={item.id} item={item} index={index} />
          ))}
        </Panel>
      </div>
    </div>
  );
}
