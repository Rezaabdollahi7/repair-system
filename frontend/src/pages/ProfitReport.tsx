import { useCallback, useEffect, useMemo, useState } from "react";
import { getProfitReport } from "../api";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ChartBarIcon,
} from "@heroicons/react/24/solid";
import PersianDatePicker from "../components/PersianDatePicker";
import { useModal } from "../context/ModalContext";
import {
  formatPersianCompact,
  formatPersianCurrency,
  formatPersianPercent,
  toPersianDigits,
} from "../utils/formatters";
import { ChartCard, ChartTable } from "../components/charts/chartKit";
import DivergingBarList from "../components/charts/DivergingBarList";
import { staggerContainer, staggerItem } from "../motion";
import {
  rowCard,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  trClickable,
} from "../utils/tableClasses";
import type {
  ProfitReport as ProfitReportData,
  QueryParams,
} from "../types/api";

interface DateRange {
  from_date: string;
  to_date: string;
}

/**
 * One of the four figures above the table.
 *
 * `accent` is the brand and is spent once — on net profit, which is
 * what the page is called. The others are neutral cards; a row of four fully
 * tinted panels (which is what this was) reads as an alarm whatever the
 * numbers say, and two of them were `bg-primary-soft text-primary`, so after
 * the palette change «کل فروش» and «حاشیه سود» became the same sand card.
 *
 * Net profit is the one that can go negative, so it is also the only one that
 * changes tone: a loss is not something to print on the brand colour.
 */
function SummaryTile({
  label,
  value,
  hint,
  tone = "surface",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "surface" | "accent" | "danger";
}) {
  const accent = tone === "accent";
  const danger = tone === "danger";

  return (
    <motion.div
      variants={staggerItem}
      className={`rounded-panel border p-5 ${
        accent
          ? "bg-accent border-accent-border shadow-accent"
          : danger
            ? "bg-danger-soft border-danger/30"
            : "bg-surface border-border shadow-sm"
      }`}
    >
      <p
        className={`text-body-sm ${
          accent
            ? "text-accent-fg/70"
            : danger
              ? "text-danger-fg/80"
              : "text-text-secondary"
        }`}
      >
        {label}
      </p>
      <p
        className={`text-title-lg font-bold mt-1 break-words tabular-nums ${
          accent
            ? "text-accent-fg"
            : danger
              ? "text-danger-fg"
              : "text-text-primary"
        }`}
      >
        {value}
      </p>
      {hint && (
        <p
          className={`text-body-xs mt-2 ${
            accent
              ? "text-accent-fg/70"
              : danger
                ? "text-danger-fg/80"
                : "text-text-muted"
          }`}
        >
          {hint}
        </p>
      )}
    </motion.div>
  );
}

function ProfitReportSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {[0, 1, 2, 3].map((tile) => (
          <div
            key={tile}
            className="h-[6.5rem] rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
      <div className="h-64 rounded-panel border border-border bg-surface mb-4" />
      <div className="h-80 rounded-panel border border-border bg-surface" />
    </div>
  );
}

/** Margin, with an arrow that points the way the number actually goes. */
function MarginCell({ margin }: { margin: number }) {
  const positive = margin >= 0;
  const Icon = positive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon;

  return (
    <span
      className={`inline-flex items-center gap-1 justify-center tabular-nums ${
        positive ? "text-success-fg" : "text-danger-fg"
      }`}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
      {formatPersianPercent(margin)}
    </span>
  );
}

export default function ProfitReport() {
  const [report, setReport] = useState<ProfitReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const { openItemDetail } = useModal();
  const [dateRange, setDateRange] = useState<DateRange>({
    from_date: "",
    to_date: "",
  });

  const fetchReport = useCallback((range: DateRange) => {
    setLoading(true);
    const params: QueryParams = {};
    if (range.from_date) params.from_date = range.from_date;
    if (range.to_date) params.to_date = range.to_date;

    getProfitReport(params)
      .then((res) => setReport(res.data))
      .catch(() => toast.error("خطا در دریافت گزارش"))
      .finally(() => setLoading(false));
  }, []);

  /*
   * Refetches when a date changes, rather than waiting for an «اعمال فیلتر»
   * button — the same change the stock report needed. Every other list in the
   * app filters as you pick, and a control that does nothing until confirmed
   * reads as broken.
   */
  useEffect(() => {
    fetchReport(dateRange);
  }, [dateRange, fetchReport]);

  const rows = useMemo(() => report?.data ?? [], [report]);

  /**
   * Profit per item, largest magnitude first, positive and negative together.
   *
   * The eight that moved the needle most in either direction — a big loss
   * matters as much as a big gain, which is why this is sorted by magnitude
   * rather than by value, and why it is drawn diverging rather than as a
   * ranking.
   */
  const byProfit = useMemo(
    () =>
      [...rows]
        .sort((a, b) => Math.abs(b.profit) - Math.abs(a.profit))
        .slice(0, 8)
        .map((row) => ({
          label: row.item_name ?? "—",
          value: row.profit,
          display: `${formatPersianCompact(row.profit)} ریال`,
        })),
    [rows],
  );

  const filtering = dateRange.from_date !== "" || dateRange.to_date !== "";
  const profitable = (report?.summary.total_profit ?? 0) >= 0;

  return (
    <div dir="rtl">
      <header className="mb-5">
        <p className="text-body-sm text-text-secondary">
          {loading
            ? "در حال بارگذاری…"
            : filtering
              ? `${toPersianDigits(rows.length)} کالا در بازهٔ انتخابی`
              : `${toPersianDigits(rows.length)} کالای فروش‌رفته، از ابتدا تا امروز`}
        </p>

        <div className="flex flex-wrap items-end gap-3 mt-4">
          <div>
            <label className="block text-body-xs text-text-secondary mb-1.5">
              از تاریخ
            </label>
            <PersianDatePicker
              value={dateRange.from_date}
              onChange={(val) =>
                setDateRange((prev) => ({ ...prev, from_date: val }))
              }
              placeholder="از تاریخ"
            />
          </div>
          <div>
            <label className="block text-body-xs text-text-secondary mb-1.5">
              تا تاریخ
            </label>
            <PersianDatePicker
              value={dateRange.to_date}
              onChange={(val) =>
                setDateRange((prev) => ({ ...prev, to_date: val }))
              }
              placeholder="تا تاریخ"
            />
          </div>
          {filtering && (
            <button
              onClick={() => setDateRange({ from_date: "", to_date: "" })}
              className={`${secondaryButton} flex-none`}
            >
              کل دوره
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <ProfitReportSkeleton />
      ) : (
        <>
          {report && (
            <motion.div
              variants={staggerContainer}
              initial="hidden"
              animate="visible"
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4"
            >
              <SummaryTile
                label={profitable ? "سود خالص" : "زیان خالص"}
                value={`${formatPersianCurrency(report.summary.total_profit)} ریال`}
                hint={`حاشیه ${formatPersianPercent(report.summary.profit_margin)}`}
                tone={profitable ? "accent" : "danger"}
              />
              <SummaryTile
                label="کل فروش"
                value={`${formatPersianCurrency(report.summary.total_revenue)} ریال`}
              />
              <SummaryTile
                label="بهای تمام‌شده"
                value={`${formatPersianCurrency(report.summary.total_cost)} ریال`}
              />
              <SummaryTile
                label="حاشیه سود"
                value={formatPersianPercent(report.summary.profit_margin)}
                hint="سود خالص به کل فروش"
              />
            </motion.div>
          )}

          {byProfit.length > 0 && (
            <ChartCard
              title="سود و زیان به تفکیک کالا"
              subtitle="هشت کالای مؤثرتر، در هر دو جهت"
              /* Narrower than the table below it: at the page's full width a
                 bar ran the length of the screen and put each label far from
                 its own number. */
              className="mb-4 lg:max-w-3xl"
            >
              <DivergingBarList
                rows={byProfit}
                emptyMessage="سودی برای نمایش نیست"
              />
              <ChartTable
                caption="نمایش اعداد به‌صورت جدول"
                columns={["کالا", "سود (ریال)"]}
                rows={byProfit.map((row) => [
                  row.label,
                  formatPersianCurrency(row.value),
                ])}
              />
            </ChartCard>
          )}

          {rows.length === 0 ? (
            <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
              <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
                <ChartBarIcon
                  className="w-7 h-7 text-text-muted"
                  aria-hidden="true"
                />
              </span>
              <p className="text-body-md font-bold text-text-primary">
                {filtering ? "در این بازه فروشی نبوده" : "هنوز فروشی ثبت نشده"}
              </p>
              <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
                {filtering
                  ? "بازهٔ دیگری را انتخاب کنید یا فیلتر تاریخ را بردارید."
                  : "پس از اولین فاکتور فروش، سود هر کالا اینجا محاسبه می‌شود."}
              </p>
              {filtering && (
                <button
                  onClick={() => setDateRange({ from_date: "", to_date: "" })}
                  className={`${secondaryButton} mt-5 flex-none`}
                >
                  نمایش کل دوره
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Below lg the table becomes one card per item — seven columns
                  needed 640px, which a phone had to be dragged across. */}
              <motion.ul
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="lg:hidden space-y-3"
              >
                {rows.map((item) => {
                  const positive = item.profit >= 0;
                  return (
                    <motion.li
                      key={item.item_id ?? item.item_code}
                      variants={staggerItem}
                    >
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          if (item.item_id) openItemDetail(item.item_id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            if (item.item_id) openItemDetail(item.item_id);
                          }
                        }}
                        className={`${rowCard} cursor-pointer hover:border-border-strong
                                    relative overflow-hidden ps-5`}
                      >
                        {/* Green or red down the leading edge, so a stack of
                            cards can be skimmed for what is losing money. */}
                        <span
                          className="absolute inset-y-0 start-0 w-1.5"
                          style={{
                            backgroundColor: positive
                              ? "var(--success)"
                              : "var(--danger)",
                          }}
                          aria-hidden="true"
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-body-sm font-bold text-text-primary truncate">
                              {item.item_name ?? "—"}
                            </p>
                            <p className="text-body-xs text-text-muted tabular-nums">
                              {toPersianDigits(item.total_quantity)} فروش‌رفته
                            </p>
                          </div>
                          <span
                            className="text-body-xs text-text-muted shrink-0 tabular-nums"
                            dir="ltr"
                          >
                            {item.item_code ?? "—"}
                          </span>
                        </div>

                        <dl className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-subtle">
                          <div>
                            <dt className="text-body-xs text-text-muted">
                              درآمد
                            </dt>
                            <dd className="text-body-sm font-bold text-text-primary tabular-nums">
                              {formatPersianCurrency(item.total_revenue)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-body-xs text-text-muted">
                              هزینه
                            </dt>
                            <dd className="text-body-sm font-bold text-text-secondary tabular-nums">
                              {formatPersianCurrency(item.total_cost)}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-body-xs text-text-muted">
                              سود
                            </dt>
                            <dd
                              className={`text-body-sm font-bold tabular-nums ${
                                positive ? "text-success-fg" : "text-danger-fg"
                              }`}
                            >
                              {formatPersianCurrency(item.profit)}
                            </dd>
                          </div>
                        </dl>

                        <div className="flex justify-end mt-2">
                          <MarginCell margin={item.profit_margin} />
                        </div>
                      </div>
                    </motion.li>
                  );
                })}
              </motion.ul>

              <div className={`hidden lg:block ${tableCard}`}>
                <div className={tableScroll}>
                  <table className="min-w-[880px] w-full">
                    <thead className={thead}>
                      <tr>
                        <th className={th}>کد</th>
                        <th className={th}>نام کالا</th>
                        <th className={th}>تعداد فروش</th>
                        <th className={th}>درآمد (ریال)</th>
                        <th className={th}>هزینه (ریال)</th>
                        <th className={th}>سود (ریال)</th>
                        <th className={th}>حاشیه سود</th>
                      </tr>
                    </thead>
                    <tbody className={tbody}>
                      {rows.map((item) => (
                        <tr
                          key={item.item_id ?? item.item_code}
                          onClick={() => {
                            if (item.item_id) openItemDetail(item.item_id);
                          }}
                          className={trClickable}
                        >
                          <td
                            className={`${td} tabular-nums`}
                            dir="ltr"
                            style={{
                              boxShadow: `inset -3px 0 0 0 ${
                                item.profit >= 0
                                  ? "var(--success)"
                                  : "var(--danger)"
                              }`,
                            }}
                          >
                            {item.item_code ?? "—"}
                          </td>
                          <td className={`${td} font-bold text-primary`}>
                            {item.item_name ?? "—"}
                          </td>
                          <td className={`${tdMuted} tabular-nums`}>
                            {toPersianDigits(item.total_quantity)}
                          </td>
                          <td className={`${td} tabular-nums`}>
                            {formatPersianCurrency(item.total_revenue)}
                          </td>
                          <td className={`${tdMuted} tabular-nums`}>
                            {formatPersianCurrency(item.total_cost)}
                          </td>
                          <td
                            className={`${tdBare} font-bold tabular-nums ${
                              item.profit >= 0
                                ? "text-success-fg"
                                : "text-danger-fg"
                            }`}
                          >
                            {formatPersianCurrency(item.profit)}
                          </td>
                          <td className="px-3 py-3 text-center text-body-sm">
                            <MarginCell margin={item.profit_margin} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
