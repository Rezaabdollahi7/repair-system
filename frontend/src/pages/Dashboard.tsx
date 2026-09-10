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
import { useAuth } from "../context/AuthContext";
import {
  formatPersianCompact,
  formatPersianCurrency,
  toPersianDigits,
} from "../utils/formatters";
import { staggerContainer, staggerItem, transition } from "../motion";
import { ChartCard, ChartTable } from "../components/charts/chartKit";
import { SERIES } from "../utils/chartSeries";
import { DEVICE_STATUSES, deviceStatusOf } from "../utils/deviceStatus";
import DonutChart from "../components/charts/DonutChart";
import BarList from "../components/charts/BarList";
import PersonnelLink from "../components/PersonnelLink";
import Gauge from "../components/charts/Gauge";
import TrendChart from "../components/charts/TrendChart";
import type {
  DashboardStats,
  DashboardTopItem,
  DashboardTransaction,
} from "../types/api";

/**
 * A tile's tint.
 *
 * `accent` is the brand and is spent once per screen — on the figure the
 * shop opens the page to see. A second accent tile halves the emphasis of the
 * first, and a row of four makes the colour mean nothing at all.
 */
type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

const TONE_ICON: Record<Tone, string> = {
  neutral: "bg-surface-alt text-text-secondary",
  // On the accent fill, so both are stated against it rather than the page.
  accent: "bg-accent-fg/10 text-accent-fg",
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

/**
 * The three figures in the page header, set at display size.
 *
 * Not charts and not tiles: each is one number with no comparison to make, so
 * the form is the number itself, large, with its label under it.
 */
function HeroFigure({
  value,
  label,
  icon: Icon,
}: {
  value: number;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="text-center sm:text-right">
      <p className="text-display-sm font-bold text-text-primary leading-none tabular-nums">
        <CountUp value={value} />
      </p>
      <p className="text-body-xs text-text-secondary mt-1.5 flex items-center gap-1 justify-center sm:justify-start">
        <Icon className="w-3.5 h-3.5 text-text-muted" aria-hidden="true" />
        {label}
      </p>
    </div>
  );
}

/**
 * A share of a whole, as a pill.
 *
 * Three of these sit in the header. They are the only place a ratio appears
 * without its two amounts, so each carries the percentage as a direct label
 * inside the fill — a bar the reader has to measure against its neighbours to
 * value is decoration.
 */
function MeterPill({
  label,
  ratio,
  detail,
  color,
}: {
  label: string;
  ratio: number;
  detail: string;
  color: string;
}) {
  const reduceMotion = useReducedMotion();
  const clamped = Math.min(Math.max(ratio, 0), 1);

  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-body-xs text-text-secondary truncate">
          {label}
        </span>
        <span className="text-body-xs font-bold text-text-primary tabular-nums shrink-0">
          ٪{toPersianDigits(Math.round(clamped * 100))}
        </span>
      </div>
      <div className="h-2 rounded-pill bg-chart-track overflow-hidden">
        <motion.div
          className="h-full rounded-pill origin-right"
          style={{ backgroundColor: color }}
          initial={reduceMotion ? false : { scaleX: 0 }}
          animate={{ scaleX: Math.max(clamped, 0.01) }}
          transition={reduceMotion ? { duration: 0 } : transition.slow}
        />
      </div>
      <p className="text-body-xs text-text-muted mt-1 truncate">{detail}</p>
    </div>
  );
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
function StatCard({
  label,
  value,
  icon: Icon,
  tone = "neutral",
  hint,
  to,
}: StatCardProps) {
  const accent = tone === "accent";

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={`text-body-sm ${accent ? "text-accent-fg/70" : "text-text-secondary"}`}
          >
            {label}
          </p>
          <p
            className={`text-title-lg font-bold mt-1 break-words ${
              accent ? "text-accent-fg" : "text-text-primary"
            }`}
          >
            {value}
          </p>
        </div>
        <span
          className={`shrink-0 w-10 h-10 rounded-field flex items-center justify-center ${TONE_ICON[tone]}`}
        >
          <Icon className="w-5 h-5" aria-hidden="true" />
        </span>
      </div>
      {hint && (
        <p
          className={`text-body-xs mt-2 ${accent ? "text-accent-fg/70" : "text-text-secondary"}`}
        >
          {hint}
        </p>
      )}
    </>
  );

  // h-full on both: the grid stretches its cells, but without this the card
  // inside one only grows to its own content, so a tile carrying a hint
  // stands taller than the ones beside it.
  const className =
    `rounded-panel p-5 block h-full border transition-colors ${
      accent
        ? "bg-accent border-accent-border shadow-accent"
        : "bg-surface border-border shadow-sm"
    }` + (to ? " hover:border-border-strong" : "");

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
    <section className="mb-6">
      <div className="flex items-center justify-between gap-3 mb-3">
        <h2 className="text-title-sm font-bold text-text-primary flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-muted" aria-hidden="true" />
          {title}
        </h2>
        {action && (
          <Link
            to={action.to}
            className="text-body-sm text-primary hover:underline flex items-center gap-1 shrink-0"
          >
            {action.label}
            <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {children}
      </motion.div>
    </section>
  );
}

function RecentTransactionItem({ tx }: { tx: DashboardTransaction }) {
  const isPurchase = tx.type === "purchase";
  const label = isPurchase ? "خرید" : tx.type === "sale" ? "فروش" : "تنظیم";

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border-subtle">
      <div className="flex items-center gap-3 min-w-0">
        <span
          className={`w-2 h-2 rounded-full shrink-0 ${isPurchase ? "bg-success" : "bg-danger"}`}
          aria-hidden="true"
        />
        <div className="min-w-0">
          <p className="text-body-sm font-medium text-text-primary truncate">
            [{tx.item_code}] {tx.item_name}
          </p>
          <p className="text-body-xs text-text-muted">
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
        <p className="text-body-xs text-text-muted">{label}</p>
      </div>
    </div>
  );
}

/** Mirrors the real layout so the page does not jump when the data lands. */
function DashboardSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="h-9 w-64 rounded-field bg-surface-alt mb-3" />
      <div className="h-4 w-40 rounded-field bg-surface-alt mb-8" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 h-80 rounded-panel border border-border bg-surface" />
        <div className="h-80 rounded-panel border border-border bg-surface" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[0, 1, 2, 3].map((tile) => (
          <div
            key={tile}
            className="h-[7rem] rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="h-72 rounded-panel border border-border bg-surface" />
        <div className="h-72 rounded-panel border border-border bg-surface" />
      </div>
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────── */

const TILE_GRID = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4";

export default function Dashboard() {
  const { user } = useAuth();
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

  const todayNetPositive = stats.today.net >= 0;
  const monthNetPositive = stats.month.net >= 0;

  const billed =
    stats.repair_invoices.month_paid + stats.repair_invoices.month_unpaid;
  const collectedRatio =
    billed > 0 ? stats.repair_invoices.month_paid / billed : 0;

  /*
   * The ring is built by walking the workflow in its own order and looking
   * each status up in the response, rather than by mapping over the response.
   *
   * That is what pins a colour to a status instead of to its position in a
   * list the server sorted by count: the second-busiest state one week is the
   * fourth-busiest the next, and mapping the response would have repainted
   * both. It also fixes which segments end up adjacent, which is the pairing
   * the palette was validated on.
   */
  const counts = new Map(
    stats.devices.by_status.map((row) => [row.status, row.count]),
  );
  const statusSlices = DEVICE_STATUSES.map((status) => ({
    label: status.label,
    value: counts.get(status.key) ?? 0,
    color: status.color,
  }));

  // Anything the response carries that this build does not know about, summed
  // rather than dropped — the ring's total has to match the device count
  // beside it, and a silently missing status would make it not.
  const knownKeys = new Set(DEVICE_STATUSES.map((status) => status.key));
  const unknown = stats.devices.by_status.filter(
    (row) => !knownKeys.has(row.status),
  );
  if (unknown.length > 0) {
    statusSlices.push({
      label:
        unknown.length === 1 ? deviceStatusOf(unknown[0].status).label : "سایر",
      value: unknown.reduce((sum, row) => sum + row.count, 0),
      color: "var(--text-muted)",
    });
  }

  const topItemRows = stats.top_items.map((item: DashboardTopItem) => ({
    label: item.name ?? "—",
    meta: item.code ?? undefined,
    value: item.revenue,
    display: `${formatPersianCompact(item.revenue)} ریال`,
  }));

  /*
   * The technicians, then the work nobody owns.
   *
   * «تخصیص‌نیافته» goes last and in the warning tone rather than sorted in
   * among the people by its count: it is the only row on the list that is a
   * problem rather than a fact, and a shop reading down the list should find
   * it at the bottom whether it holds one device or twenty.
   *
   * It is dropped entirely at zero. A row saying «۰ دستگاه» is an answer to
   * a question nobody asked, and a bar of length zero in a list of bars
   * reads as a rendering fault.
   */
  const workloadRows = [
    ...stats.technician_load.technicians.map((technician) => ({
      label: technician.name,
      labelNode: (
        <PersonnelLink
          id={technician.id}
          name={technician.name}
          tone="inherit"
        />
      ),
      value: technician.count,
      display: `${toPersianDigits(technician.count)} دستگاه`,
    })),
    ...(stats.technician_load.unassigned > 0
      ? [
          {
            label: "تخصیص‌نیافته",
            value: stats.technician_load.unassigned,
            display: `${toPersianDigits(stats.technician_load.unassigned)} دستگاه`,
            color: "var(--warning)",
          },
        ]
      : []),
  ];

  return (
    <div dir="rtl">
      {/*
        The header sits on the page rather than in a card, with a soft wash of
        the brand behind it. The wash is the one purely decorative thing on
        the screen and is kept to the header for that reason — under a chart
        it would tint the marks and quietly break their contrast.

        Its opacity dropped from 0.5 to 0.18 when the brand went from a pale
        yellow to a saturated blue: the same wash that read as a warm hint
        behind the greeting became a blue field with text sitting in it.
      */}
      <header className="relative mb-6 overflow-hidden rounded-panel">
        <div
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background:
              "radial-gradient(110% 150% at 90% -30%, var(--accent) 0%, var(--accent-soft) 34%, transparent 68%)",
            opacity: 0.18,
          }}
          aria-hidden="true"
        />
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6 py-2">
          <div className="min-w-0">
            {/*
              A greeting, not a heading — the shell's header carries the one
              <h1> on the screen now, and it says «داشبورد». This said
              «خوش آمدید، …», which is not the page's name, so it stays as
              text at heading size rather than becoming a second <h1>.

              The date used to be repeated here. It is in the header of every
              screen now, so saying it again three centimetres away was the
              kind of duplication this pass exists to remove.
            */}
            <p className="text-headline-md sm:text-display-sm font-bold text-text-primary">
              خوش آمدید، {user?.full_name ?? "مدیر"}
            </p>
            <p className="text-body-sm text-text-secondary mt-1">
              خلاصهٔ وضعیت تعمیرگاه
            </p>
          </div>
          <div className="flex items-end gap-6 sm:gap-9 shrink-0">
            <HeroFigure
              value={stats.devices?.total || 0}
              label="کل دستگاه‌ها"
              icon={WrenchScrewdriverIcon}
            />
            <HeroFigure
              value={stats.devices?.repairing || 0}
              label="در حال تعمیر"
              icon={CogIcon}
            />
            <HeroFigure
              value={stats.items.total}
              label="کل کالاها"
              icon={CubeIcon}
            />
          </div>
        </div>

        {/*
          Three ratios that exist in the data, rather than four bars invented
          to fill the row — one per module, in the order the page below runs.

          The first one borrows its colour from the device status it counts
          instead of taking the next series slot. It used to take slot 1,
          which meant the bar labelled «در حال تعمیر» and the donut arc
          labelled «در حال تعمیر» three centimetres below it were different
          colours on the same screen.
        */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 mt-6 pt-5 border-t border-border">
          <MeterPill
            label="در حال تعمیر"
            ratio={
              stats.devices.total > 0
                ? stats.devices.repairing / stats.devices.total
                : 0
            }
            detail={`${toPersianDigits(stats.devices.repairing)} از ${toPersianDigits(stats.devices.total)} دستگاه`}
            color={deviceStatusOf("repairing").color}
          />
          <MeterPill
            label="وصول این ماه"
            ratio={collectedRatio}
            detail={`${formatPersianCompact(stats.repair_invoices.month_paid)} از ${formatPersianCompact(billed)} ریال`}
            color={SERIES[2]}
          />
          <MeterPill
            label="کالاهای کم‌موجود"
            ratio={
              stats.items.total > 0
                ? stats.items.low_stock / stats.items.total
                : 0
            }
            detail={`${toPersianDigits(stats.items.low_stock)} از ${toPersianDigits(stats.items.total)} کالا`}
            color={SERIES[3]}
          />
        </div>
      </header>

      {/*
        Below the header the page is one block per module, in the order a
        shop thinks about them: the devices on the bench, the invoices they
        produce, the trade those settle, and the parts they consume.

        It used to interleave them. The revenue trend came before the
        invoice tiles it summarised, the device donut shared a row with the
        top-selling-goods bar, and the low-stock warning opened the page
        three screens above the stock content it was about — so reading it
        meant holding four subjects at once.
      */}

      <Section
        title="دستگاه‌ها"
        icon={WrenchScrewdriverIcon}
        action={{ label: "همهٔ دستگاه‌ها", to: "/devices" }}
      >
        {/*
          Two cards, not one. The donut had the row to itself and a ring plus
          its legend does not need nine hundred pixels — most of the card was
          empty, and a chart with that much air around it reads as unfinished
          rather than as spacious.

          The pair answers two halves of one question: the ring says what
          state the work is in, the list says whose bench it is on.
        */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard
            title="توزیع وضعیت دستگاه‌ها"
            subtitle={`${toPersianDigits(stats.devices.total)} دستگاه در کارگاه`}
          >
            <DonutChart
              slices={statusSlices}
              centreLabel="کل دستگاه‌ها"
              emptyMessage="هنوز دستگاهی ثبت نشده"
            />
            <ChartTable
              caption="نمایش اعداد به‌صورت جدول"
              columns={["وضعیت", "تعداد"]}
              rows={statusSlices.map((slice) => [
                slice.label,
                toPersianDigits(slice.value),
              ])}
            />
          </ChartCard>

          <ChartCard
            title="بار کاری تعمیرکارها"
            subtitle={`${toPersianDigits(stats.technician_load.open_devices)} دستگاه در جریان`}
            aside={
              <Link
                to="/personnel"
                className="text-body-sm text-primary hover:underline"
              >
                پرسنل
              </Link>
            }
          >
            <BarList rows={workloadRows} emptyMessage="دستگاهی در جریان نیست" />
            {workloadRows.length > 0 && (
              <ChartTable
                caption="نمایش اعداد به‌صورت جدول"
                columns={["تعمیرکار", "دستگاه در جریان"]}
                rows={workloadRows.map((row) => [row.label, row.display])}
              />
            )}
          </ChartCard>
        </div>
      </Section>

      <Section
        title="فاکتورهای تعمیر"
        icon={DocumentTextIcon}
        action={{ label: "همهٔ فاکتورها", to: "/repair-invoices" }}
      >
        <div className={TILE_GRID}>
          {/* The one accent tile on the screen. */}
          <StatCard
            label="درآمد این ماه"
            value={`${formatPersianCurrency(stats.repair_invoices?.month_revenue || 0)} ریال`}
            icon={CalendarIcon}
            tone="accent"
          />
          <StatCard
            label="درآمد امروز"
            value={`${formatPersianCurrency(stats.repair_invoices?.today_revenue || 0)} ریال`}
            icon={BanknotesIcon}
            tone="success"
          />
          <StatCard
            label="فاکتورهای امروز"
            value={<CountUp value={stats.repair_invoices?.today_count || 0} />}
            icon={DocumentTextIcon}
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

        {/*
          The trend beside the collection ring: the first says how the month
          has been going, the second how much of it has actually been paid
          for.

          `mt-6`, a step wider than the grid's own `gap-4`. Without it the two
          rows sat exactly one gap apart and read as one eight-cell block
          rather than four tiles and two charts.
        */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ChartCard
            title="روند درآمد روزانه"
            subtitle="۱۴ روز گذشته — محور زمان از راست به چپ"
            className="lg:col-span-2"
          >
            <TrendChart series={stats.revenue_series} />
          </ChartCard>

          <ChartCard
            tone="ink"
            title="وصول مطالبات"
            subtitle="فاکتورهای تعمیر این ماه"
          >
            <Gauge
              ratio={collectedRatio}
              caption="از مبلغ صورت‌حساب‌شده وصول شده"
            />
            <dl className="mt-5 space-y-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-body-xs text-text-secondary">وصول‌شده</dt>
                <dd className="text-body-sm font-bold text-accent tabular-nums">
                  {formatPersianCurrency(stats.repair_invoices.month_paid)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-body-xs text-text-secondary">باقی‌مانده</dt>
                <dd className="text-body-sm font-bold text-text-primary tabular-nums">
                  {formatPersianCurrency(stats.repair_invoices.month_unpaid)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 pt-2.5 border-t border-on-dark/10">
                <dt className="text-body-xs text-text-secondary">
                  در انتظار پرداخت
                </dt>
                <dd className="text-body-sm font-bold text-text-primary tabular-nums">
                  {toPersianDigits(stats.repair_invoices.pending_payment_count)}{" "}
                  فاکتور
                </dd>
              </div>
            </dl>
            <Link
              to="/repair-invoices"
              className="mt-4 w-full flex items-center justify-center gap-1.5 text-body-sm font-bold
                         px-4 py-2.5 rounded-field bg-accent text-accent-fg
                         hover:bg-accent-hover transition-colors"
            >
              فاکتورهای تعمیر
              <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
            </Link>
          </ChartCard>
        </div>
      </Section>

      <Section
        title="فروش و خرید"
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
            label="سود این ماه"
            value={`${formatPersianCurrency(stats.month.net)} ریال`}
            hint={`فروش ${formatPersianCompact(stats.month.sale)} — خرید ${formatPersianCompact(stats.month.purchase)}`}
            icon={CurrencyDollarIcon}
            tone={monthNetPositive ? "success" : "danger"}
          />
        </div>
      </Section>

      <Section
        title="انبار و کالاها"
        icon={CubeIcon}
        action={{ label: "همهٔ کالاها", to: "/items" }}
      >
        {stats.items.low_stock > 0 && (
          <div className="flex items-center gap-3 bg-warning-soft border border-warning/25 rounded-panel p-4 mb-4">
            <span className="shrink-0 w-9 h-9 rounded-field bg-warning/15 flex items-center justify-center">
              <ExclamationTriangleIcon
                className="w-5 h-5 text-warning-fg"
                aria-hidden="true"
              />
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

        {/* What is running out, what earns its shelf space, and what moved —
            the three questions a shop asks about its parts, together. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ChartCard
            title="پرفروش‌ترین کالاها"
            subtitle="بر اساس مبلغ فروش"
            aside={
              <Link
                to="/reports/profit"
                className="text-body-sm text-primary hover:underline"
              >
                گزارش کامل
              </Link>
            }
          >
            <BarList rows={topItemRows} emptyMessage="هنوز فروشی ثبت نشده" />
            {stats.top_items.length > 0 && (
              <ChartTable
                caption="نمایش اعداد به‌صورت جدول"
                columns={["کالا", "مبلغ فروش (ریال)", "تعداد فروش"]}
                rows={stats.top_items.map((item) => [
                  item.name ?? "—",
                  formatPersianCurrency(item.revenue),
                  toPersianDigits(item.sold_quantity),
                ])}
              />
            )}
          </ChartCard>
          <ChartCard
            title="آخرین تراکنش‌های انبار"
            subtitle="ده مورد اخیر"
            aside={
              <Link
                to="/reports/transactions"
                className="text-body-sm text-primary hover:underline"
              >
                مشاهده همه
              </Link>
            }
          >
            {stats.recent_transactions.length === 0 ? (
              <p className="text-center text-body-sm text-text-muted py-8">
                هنوز تراکنشی ثبت نشده
              </p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8">
                {stats.recent_transactions.map((tx) => (
                  <RecentTransactionItem key={tx.id} tx={tx} />
                ))}
              </div>
            )}
          </ChartCard>
        </div>
      </Section>
    </div>
  );
}
