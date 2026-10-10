import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { ArrowLeftIcon, PlusIcon, TruckIcon } from "@heroicons/react/24/solid";
import { EyeIcon } from "@heroicons/react/24/outline";
import { getStockTransfers } from "../api";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import StockTransferFormModal from "../components/StockTransferFormModal";
import StockTransferDetailModal from "../components/StockTransferDetailModal";
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
import type { Id, QueryParams, StockTransfer } from "../types/api";

const iconSize = "w-[1.15rem] h-[1.15rem]";

/** «انبار اصلی ← میز تعمیر», the arrow pointing the way the stock went. */
function Route({ row }: { row: StockTransfer }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span>{row.from_warehouse_name}</span>
      <ArrowLeftIcon
        className="w-3.5 h-3.5 text-text-muted shrink-0"
        aria-label="به"
      />
      <span>{row.to_warehouse_name}</span>
    </span>
  );
}

/**
 * Transfers between warehouses (14.16). In the sidebar only while two
 * warehouses are active; reachable by address after that, so a shop that
 * retired one can still read what it moved.
 */
export default function StockTransferList() {
  const [rows, setRows] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [warehouseFilter, setWarehouseFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [viewing, setViewing] = useState<Id | null>(null);
  const warehouses = useWarehouses();
  const canTransfer =
    warehouses.warehouses.filter((w) => w.is_active).length > 1;

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: QueryParams = { page, limit };
      if (warehouseFilter) params.warehouse_id = warehouseFilter;
      const res = await getStockTransfers(params);
      setRows(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      toast.error("خطا در دریافت اسناد انتقال");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, warehouseFilter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const closeDetail = useCallback(() => setViewing(null), []);

  const viewButton = (row: StockTransfer) => (
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

  return (
    <div dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="flex-1 min-w-0 text-body-sm text-text-secondary leading-7">
          جابه‌جایی کالا از یک انبار به انبار دیگر. موجودی کل و میانگین بها عوض
          نمی‌شود؛ سند با ثبت اعمال می‌شود و برای برگرداندنش، انتقالی در جهت عکس
          ثبت کنید.
        </p>
        <div className="flex gap-2 shrink-0">
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
          <button
            onClick={() => setFormOpen(true)}
            disabled={!canTransfer}
            title={canTransfer ? undefined : "دست‌کم دو انبار فعال لازم است"}
            className={`${primaryButton} disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            <PlusIcon className={iconSize} aria-hidden="true" />
            انتقال جدید
          </button>
        </div>
      </div>

      {!canTransfer && warehouses.warehouses.length > 0 && (
        <p className="mb-4 text-body-sm text-text-secondary bg-surface-alt rounded-field p-3">
          برای انتقال، دست‌کم دو انبار فعال لازم است.{" "}
          <Link to="/warehouses" className="text-primary font-bold underline">
            انبار تازه بسازید
          </Link>
        </p>
      )}

      {loading ? (
        <div className="animate-pulse h-64 rounded-panel border border-border bg-surface" />
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <TruckIcon className="w-7 h-7 text-text-muted" aria-hidden="true" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {warehouseFilter
              ? "این انبار انتقالی نداشته"
              : "هنوز انتقالی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            وقتی کالایی را از انبار به میز تعمیر یا از یک شعبه به دیگری می‌برید،
            با یک سند انتقال ثبتش کنید تا موجودی هر انبار درست بماند.
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
                        {formatPersianDate(row.transferred_at)}
                      </p>
                    </div>
                    <span className="text-body-xs text-text-muted shrink-0">
                      {toPersianDigits(row.line_count)} ردیف
                    </span>
                  </div>
                  <p className="text-body-sm text-text-primary mt-2">
                    <Route row={row} />
                  </p>
                  {row.description && (
                    <p className="text-body-xs text-text-secondary mt-1 line-clamp-2">
                      {row.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle text-body-xs">
                    <span className="tabular-nums">
                      {formatPersianCurrency(row.value)} ریال
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
                    <th className={th}>مسیر</th>
                    <th className={th}>ردیف‌ها</th>
                    <th className={th}>ارزش (ریال)</th>
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
                        {formatPersianDate(row.transferred_at)}
                      </td>
                      <td className={td}>
                        <Route row={row} />
                      </td>
                      <td className={`${tdMuted} tabular-nums`}>
                        {toPersianDigits(row.line_count)}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {formatPersianCurrency(row.value)}
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
        <StockTransferFormModal
          onClose={() => setFormOpen(false)}
          onSuccess={() => {
            setPage(1);
            void fetchRows();
          }}
        />
      )}

      {viewing !== null && (
        <StockTransferDetailModal transferId={viewing} onClose={closeDetail} />
      )}
    </div>
  );
}
