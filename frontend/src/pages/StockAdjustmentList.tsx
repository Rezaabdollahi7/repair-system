import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { AdjustmentsHorizontalIcon, PlusIcon } from "@heroicons/react/24/solid";
import { EyeIcon } from "@heroicons/react/24/outline";
import { getStockAdjustments } from "../api";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import StockAdjustmentFormModal from "../components/StockAdjustmentFormModal";
import StockAdjustmentDetailModal from "../components/StockAdjustmentDetailModal";
import {
  formatPersianCurrency,
  formatPersianDate,
  toPersianDigits,
} from "../utils/formatters";
import { useWarehouses } from "../utils/warehouses";
import { staggerContainer, staggerItem } from "../motion";
import {
  actionView,
  primaryButton,
  rowCard,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdActions,
  tdMuted,
  th,
  thead,
  toolbarSelect,
  trClickable,
} from "../utils/tableClasses";
import type { Id, QueryParams, StockAdjustment } from "../types/api";
import { currencyLabel } from "../utils/currency";

const iconSize = "w-[1.15rem] h-[1.15rem]";

/** «۱۲,۰۰۰» in green, or a dash: an adjustment often moves one way only. */
function Value({ amount, tone }: { amount: number; tone: "in" | "out" }) {
  if (!amount) return <span className="text-text-muted">—</span>;
  return (
    <span
      className={`tabular-nums ${tone === "in" ? "text-success-fg" : "text-danger-fg"}`}
    >
      {formatPersianCurrency(amount)}
    </span>
  );
}

/**
 * Stock adjustments (14.14): the shelf corrected by hand, each with a
 * reason, applied the moment it is saved. A list to read back what was
 * corrected and why, and the one button to make a new correction — there is
 * no edit and no delete, so the rows carry only «view».
 */
export default function StockAdjustmentList() {
  const [rows, setRows] = useState<StockAdjustment[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<Id | null>(null);
  const warehouses = useWarehouses();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: QueryParams = { page, limit };
      if (warehouseFilter) params.warehouse_id = warehouseFilter;
      const res = await getStockAdjustments(params);
      setRows(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      toast.error("خطا در دریافت اسناد اصلاح موجودی");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, warehouseFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const closeDetail = useCallback(() => setViewing(null), []);

  const viewButton = (row: StockAdjustment) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        setViewing(row.id);
      }}
      className={actionView}
      title="جزئیات"
      aria-label={`جزئیات ${row.number}`}
    >
      <EyeIcon className={iconSize} />
    </button>
  );

  const skeleton = (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 5 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[2, 2, 2, 1, 2, 2, 3].map((span, cell) => (
              <div
                key={cell}
                className="h-4 rounded-field bg-surface-alt"
                style={{ flexGrow: span, flexBasis: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="lg:hidden space-y-3">
        {[0, 1, 2].map((card) => (
          <div
            key={card}
            className="h-28 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="flex-1 min-w-0 text-body-sm text-text-secondary leading-7">
          کالای خراب، گم‌شده یا پیدا‌شده، و هر اشتباهی در موجودی، با یک سند و
          دلیلش اصلاح می‌شود. سند با ثبت اعمال می‌شود و ویرایش نمی‌شود.
        </p>
        <div className="flex gap-2 shrink-0">
          {warehouses.showPicker && (
            <select
              value={warehouseFilter}
              onChange={(e) => {
                setWarehouseFilter(e.target.value);
                setPage(1);
              }}
              aria-label="انبار"
              className={toolbarSelect}
            >
              <option value="">همه انبارها</option>
              {warehouses.warehouses.map((warehouse) => (
                <option key={warehouse.id} value={warehouse.id}>
                  {warehouse.name}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => setFormOpen(true)} className={primaryButton}>
            <PlusIcon className={iconSize} aria-hidden="true" />
            سند اصلاح جدید
          </button>
        </div>
      </div>

      {loading ? (
        skeleton
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <AdjustmentsHorizontalIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {warehouseFilter
              ? "در این انبار سندی ثبت نشده"
              : "هنوز موجودی‌ای اصلاح نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            وقتی قطعه‌ای خراب شد یا شمارش قفسه با موجودی نخواند، از دکمه‌ی بالا
            یک سند اصلاح ثبت کنید.
          </p>
        </div>
      ) : (
        <>
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {rows.map((row) => (
              <motion.li key={row.id} variants={staggerItem}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setViewing(row.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setViewing(row.id);
                    }
                  }}
                  className={`${rowCard} cursor-pointer hover:border-border-strong`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-text-primary">
                        {row.number}
                      </p>
                      <p className="text-body-xs text-text-muted">
                        {formatPersianDate(row.adjusted_at)}
                        {warehouses.showPicker
                          ? ` — ${row.warehouse_name}`
                          : ""}
                      </p>
                    </div>
                    <span className="text-body-xs text-text-muted shrink-0">
                      {toPersianDigits(row.line_count)} ردیف
                    </span>
                  </div>
                  {row.description && (
                    <p className="text-body-xs text-text-secondary mt-2 line-clamp-2">
                      {row.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle text-body-xs">
                    <span>
                      ورود <Value amount={row.value_in} tone="in" /> · خروج{" "}
                      <Value amount={row.value_out} tone="out" />
                    </span>
                    <span className="text-text-muted">
                      {row.created_by_name ?? "—"}
                    </span>
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[880px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>شماره</th>
                    <th className={th}>تاریخ</th>
                    {warehouses.showPicker && <th className={th}>انبار</th>}
                    <th className={th}>ردیف‌ها</th>
                    <th className={th}>ورود ({currencyLabel()})</th>
                    <th className={th}>خروج ({currencyLabel()})</th>
                    <th className={th}>توضیح</th>
                    <th className={th}>ثبت‌کننده</th>
                    <th className={th}>عملیات</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {rows.map((row) => (
                    <tr
                      key={row.id}
                      onClick={() => setViewing(row.id)}
                      className={trClickable}
                    >
                      <td className={`${td} font-bold`}>{row.number}</td>
                      <td className={`${td} tabular-nums`}>
                        {formatPersianDate(row.adjusted_at)}
                      </td>
                      {warehouses.showPicker && (
                        <td className={tdMuted}>{row.warehouse_name}</td>
                      )}
                      <td className={`${tdMuted} tabular-nums`}>
                        {toPersianDigits(row.line_count)}
                      </td>
                      <td className={td}>
                        <Value amount={row.value_in} tone="in" />
                      </td>
                      <td className={td}>
                        <Value amount={row.value_out} tone="out" />
                      </td>
                      <td className={`${tdMuted} max-w-[16rem] truncate`}>
                        {row.description ?? "—"}
                      </td>
                      <td className={tdMuted}>{row.created_by_name ?? "—"}</td>
                      <td className={tdActions}>
                        <div className="flex justify-end">
                          {viewButton(row)}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </>
      )}

      {formOpen && (
        <StockAdjustmentFormModal
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            setPage(1);
            void fetchRows();
          }}
        />
      )}

      {viewing !== null && (
        <StockAdjustmentDetailModal
          adjustmentId={viewing}
          onClose={closeDetail}
        />
      )}
    </div>
  );
}
