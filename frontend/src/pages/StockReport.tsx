import { useCallback, useEffect, useMemo, useState } from "react";
import { getStockReport, getCategories } from "../api";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { CubeIcon } from "@heroicons/react/24/solid";
import { useModal } from "../context/ModalContext";
import {
  formatPersianCompact,
  formatPersianCurrency,
  toPersianDigits,
} from "../utils/formatters";
import { ChartCard, ChartTable } from "../components/charts/chartKit";
import BarList from "../components/charts/BarList";
import StockStatusBadge from "../components/StockStatusBadge";
import { stockStatusOfKey } from "../utils/stockStatus";
import { staggerContainer, staggerItem } from "../motion";
import {
  rowCard,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  toolbarSelect,
  trClickable,
} from "../utils/tableClasses";
import type {
  Category,
  QueryParams,
  StockReport as StockReportData,
} from "../types/api";

interface StockFilters {
  categoryId: string;
  lowStockOnly: boolean;
}

/**
 * One of the four figures above the table.
 *
 * `accent` is the brand and is used once — on the total value, which
 * is the number a shop opens this report for. The other three are neutral
 * cards with a coloured dot, rather than three fully tinted panels: a row of
 * solid warning-and-danger blocks read as an alarm even when the counts were
 * zero.
 */
function SummaryTile({
  label,
  value,
  dot,
  tone = "surface",
}: {
  label: string;
  value: React.ReactNode;
  dot?: string;
  tone?: "surface" | "accent";
}) {
  const accent = tone === "accent";
  return (
    <motion.div
      variants={staggerItem}
      className={`rounded-panel border p-5 ${
        accent
          ? "bg-accent border-accent-border shadow-accent"
          : "bg-surface border-border shadow-sm"
      }`}
    >
      <p
        className={`text-body-sm flex items-center gap-2 ${
          accent ? "text-accent-fg/70" : "text-text-secondary"
        }`}
      >
        {dot && (
          <span
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: dot }}
            aria-hidden="true"
          />
        )}
        {label}
      </p>
      <p
        className={`text-title-lg font-bold mt-1 break-words tabular-nums ${
          accent ? "text-accent-fg" : "text-text-primary"
        }`}
      >
        {value}
      </p>
    </motion.div>
  );
}

function StockReportSkeleton() {
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

export default function StockReport() {
  const [report, setReport] = useState<StockReportData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Read from the URL rather than a route param: the dashboard's low-stock
  // warning links straight here with the filter already applied.
  const lowStockParam =
    new URLSearchParams(window.location.search).get("lowStock") === "true";

  const [filters, setFilters] = useState<StockFilters>({
    categoryId: "",
    lowStockOnly: lowStockParam,
  });

  const { openItemDetail } = useModal();

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  const fetchReport = useCallback((active: StockFilters) => {
    setLoading(true);
    const params: QueryParams = {};
    if (active.categoryId) params.categoryId = active.categoryId;
    if (active.lowStockOnly) params.lowStockOnly = true;

    getStockReport(params)
      .then((res) => setReport(res.data))
      .catch(() => toast.error("خطا در دریافت گزارش"))
      .finally(() => setLoading(false));
  }, []);

  /*
   * Refetches when a filter changes, rather than waiting for an «اعمال فیلتر»
   * button. Every other list in the app filters as you type or as you pick,
   * and the button was the only place a chosen filter did nothing until it
   * was confirmed — which reads as a broken control, not as a deliberate
   * step. There are at most a few hundred rows behind it.
   */
  useEffect(() => {
    fetchReport(filters);
  }, [filters, fetchReport]);

  // Memoised so the `byCategory` sum below is not recomputed on every render:
  // `report?.data ?? []` builds a fresh array each time and would invalidate it.
  const rows = useMemo(() => report?.data ?? [], [report]);

  /**
   * Inventory value per category, largest first.
   *
   * Derived here rather than asked of the server: the report already carries
   * every row's stock, price and category, so the sum is arithmetic on data
   * the page has. One hue for every bar — these are categories, one series of
   * nominal things, and length already carries the magnitude.
   */
  const byCategory = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const key = row.category_name || "بدون دسته‌بندی";
      const value = row.current_stock * row.avg_purchase_price;
      totals.set(key, (totals.get(key) ?? 0) + value);
    }
    return [...totals.entries()]
      .map(([label, value]) => ({
        label,
        value,
        display: `${formatPersianCompact(value)} ریال`,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [rows]);

  const filtering = filters.categoryId !== "" || filters.lowStockOnly;

  return (
    <div dir="rtl">
      <header className="mb-5">
        <div className="flex flex-wrap items-center gap-3 mt-4">
          <select
            value={filters.categoryId}
            onChange={(e) =>
              setFilters((current) => ({
                ...current,
                categoryId: e.target.value,
              }))
            }
            aria-label="دسته‌بندی"
            className={toolbarSelect}
          >
            <option value="">همه دسته‌بندی‌ها</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {/*
            Kept as one control rather than split into the items list's three
            buckets. Here the question is «what needs restocking», which is
            low and empty together — the buckets are for picking through the
            catalogue, this is for ordering.
          */}
          <button
            onClick={() =>
              setFilters((current) => ({
                ...current,
                lowStockOnly: !current.lowStockOnly,
              }))
            }
            aria-pressed={filters.lowStockOnly}
            className={`px-3.5 py-2.5 rounded-field text-body-sm font-bold border
                        transition-colors cursor-pointer ${
                          filters.lowStockOnly
                            ? "bg-warning-soft border-warning/45 text-warning-fg"
                            : "bg-surface border-border text-text-secondary hover:border-border-strong"
                        }`}
          >
            فقط کالاهای نیازمند سفارش
          </button>

          {filtering && (
            <button
              onClick={() =>
                setFilters({ categoryId: "", lowStockOnly: false })
              }
              className="text-body-sm text-text-secondary hover:text-text-primary
                         transition-colors cursor-pointer"
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <StockReportSkeleton />
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
                label="ارزش کل موجودی"
                value={`${formatPersianCurrency(report.summary.total_inventory_value)} ریال`}
                tone="accent"
              />
              <SummaryTile
                label="کل کالاها"
                value={toPersianDigits(report.summary.total_items)}
              />
              <SummaryTile
                label="کم‌موجود"
                value={toPersianDigits(report.summary.low_stock_count)}
                dot="var(--warning)"
              />
              <SummaryTile
                label="اتمام موجودی"
                value={toPersianDigits(report.summary.critical_count)}
                dot="var(--danger)"
              />
            </motion.div>
          )}

          {byCategory.length > 0 && (
            <ChartCard
              title="ارزش موجودی به تفکیک دسته‌بندی"
              subtitle={
                byCategory.length === 8
                  ? "هشت دستهٔ بزرگ‌تر، بر اساس موجودی × میانگین خرید"
                  : "بر اساس موجودی × میانگین خرید"
              }
              /*
                The card is narrower than the table below it rather than the
                bars being narrower than the card. At the page's full width a
                bar ran 1800px and put each label a screen away from its own
                number; capping the bars instead left a third of a white card
                empty, which reads as a mistake in a way that space beside a
                card does not.
              */
              className="mb-4 lg:max-w-3xl"
            >
              <BarList rows={byCategory} emptyMessage="ارزشی برای نمایش نیست" />
              <ChartTable
                caption="نمایش اعداد به‌صورت جدول"
                columns={["دسته‌بندی", "ارزش موجودی (ریال)"]}
                rows={byCategory.map((row) => [
                  row.label,
                  formatPersianCurrency(row.value),
                ])}
              />
            </ChartCard>
          )}

          {rows.length === 0 ? (
            <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
              <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
                <CubeIcon
                  className="w-7 h-7 text-text-muted"
                  aria-hidden="true"
                />
              </span>
              <p className="text-body-md font-bold text-text-primary">
                {filtering ? "کالایی با این فیلتر نیست" : "انبار خالی است"}
              </p>
              <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
                {filters.lowStockOnly
                  ? "هیچ کالایی به حداقل موجودی نرسیده — چیزی برای سفارش نیست."
                  : filtering
                    ? "دستهٔ دیگری را انتخاب کنید."
                    : "پس از افزودن کالا، موجودی هر کدام اینجا گزارش می‌شود."}
              </p>
            </div>
          ) : (
            <>
              {/* Below lg the table becomes one card per item — seven columns
                  needed 720px, which a phone had to be dragged across. */}
              <motion.ul
                variants={staggerContainer}
                initial="hidden"
                animate="visible"
                className="lg:hidden space-y-3"
              >
                {rows.map((item) => {
                  const status = stockStatusOfKey(item.stock_status);
                  return (
                    <motion.li key={item.id} variants={staggerItem}>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => openItemDetail(item.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openItemDetail(item.id);
                          }
                        }}
                        className={`${rowCard} cursor-pointer hover:border-border-strong
                                    relative overflow-hidden ps-5`}
                      >
                        <span
                          className="absolute inset-y-0 start-0 w-1.5"
                          style={{ backgroundColor: status.color }}
                          aria-hidden="true"
                        />
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-body-sm font-bold text-text-primary truncate">
                              {item.name}
                            </p>
                            <p className="text-body-xs text-text-muted">
                              {item.category_name || "بدون دسته‌بندی"}
                            </p>
                          </div>
                          <span
                            className="text-body-xs text-text-muted shrink-0 tabular-nums"
                            dir="ltr"
                          >
                            {item.code}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <StockStatusBadge
                            status={status}
                            quantity={item.current_stock}
                            unit={item.unit}
                          />
                          <span className="text-body-xs text-text-muted tabular-nums">
                            حداقل {toPersianDigits(item.min_stock)} {item.unit}
                          </span>
                        </div>

                        <div className="mt-3 pt-3 border-t border-border-subtle">
                          <span className="text-body-xs text-text-muted tabular-nums">
                            ارزش{" "}
                            {formatPersianCurrency(
                              item.current_stock * item.avg_purchase_price,
                            )}{" "}
                            ریال
                          </span>
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
                        <th className={th}>دسته‌بندی</th>
                        <th className={th}>موجودی</th>
                        <th className={th}>حداقل</th>
                        <th className={th}>ارزش موجودی (ریال)</th>
                      </tr>
                    </thead>
                    <tbody className={tbody}>
                      {rows.map((item) => {
                        const status = stockStatusOfKey(item.stock_status);
                        return (
                          <tr
                            key={item.id}
                            onClick={() => openItemDetail(item.id)}
                            className={trClickable}
                          >
                            <td
                              className={`${td} tabular-nums`}
                              dir="ltr"
                              style={{
                                boxShadow: `inset -3px 0 0 0 ${status.color}`,
                              }}
                            >
                              {item.code}
                            </td>
                            <td className={`${td} font-bold text-primary`}>
                              {item.name}
                            </td>
                            <td className={tdMuted}>
                              {item.category_name || "—"}
                            </td>
                            <td className={tdBare}>
                              <StockStatusBadge
                                status={status}
                                quantity={item.current_stock}
                                unit={item.unit}
                              />
                            </td>
                            <td className={`${tdMuted} tabular-nums`}>
                              {toPersianDigits(item.min_stock)} {item.unit}
                            </td>
                            <td className={`${td} tabular-nums`}>
                              {formatPersianCurrency(
                                item.current_stock * item.avg_purchase_price,
                              )}
                            </td>
                          </tr>
                        );
                      })}
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
