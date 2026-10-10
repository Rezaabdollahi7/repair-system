import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import {
  ClipboardDocumentCheckIcon,
  PlusIcon,
} from "@heroicons/react/24/solid";
import { getStockCounts } from "../api";
import Pagination, { DEFAULT_PAGE_SIZE } from "../components/Pagination";
import StatusPill from "../components/StatusPill";
import StockCountCreateModal from "../components/StockCountCreateModal";
import { formatPersianDate, toPersianDigits } from "../utils/formatters";
import { STOCK_COUNT_STATUSES } from "../utils/stockCountStatus";
import { useWarehouses } from "../utils/warehouses";
import { staggerContainer, staggerItem } from "../motion";
import {
  primaryButton,
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
import type { QueryParams, StockCount, StockCountStatus } from "../types/api";

const iconSize = "w-[1.15rem] h-[1.15rem]";

/** How far a count has got: «۱۲ از ۴۰», with a bar. */
function Progress({ count }: { count: StockCount }) {
  const share = count.line_count ? count.counted_count / count.line_count : 0;
  return (
    <div className="min-w-[7rem]">
      <p className="text-body-xs text-text-secondary tabular-nums mb-1">
        {toPersianDigits(count.counted_count)} از{" "}
        {toPersianDigits(count.line_count)}
      </p>
      <div className="h-1.5 rounded-pill bg-surface-alt overflow-hidden">
        <div
          className="h-full rounded-pill bg-primary"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: StockCountStatus }) {
  const { label, color, tone } = STOCK_COUNT_STATUSES[status];
  return <StatusPill label={label} color={color} tone={tone} size="sm" />;
}

/**
 * Stock counts (14.15). A count opens onto its own page, where the shelf is
 * counted line by line; this list is where counts are started and found
 * again.
 */
export default function StockCountList() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<StockCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const warehouses = useWarehouses();

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params: QueryParams = { page, limit };
      if (status) params.status = status;
      const res = await getStockCounts(params);
      setRows(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      toast.error("خطا در دریافت فهرست انبارگردانی‌ها");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, limit, status]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const open = (count: StockCount) => navigate(`/stock-counts/${count.id}`);

  const scope = (count: StockCount) =>
    count.category_name ? `فقط ${count.category_name}` : "همه‌ی کالاها";

  return (
    <div dir="rtl">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <p className="flex-1 min-w-0 text-body-sm text-text-secondary leading-7">
          قفسه را بشمارید، اختلاف‌ها را بررسی کنید و با یک دکمه روی موجودی اعمال
          کنید. شمارش از گوشی هم انجام می‌شود و هر ردیف همان لحظه ذخیره می‌شود.
        </p>
        <div className="flex gap-2 shrink-0">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="وضعیت"
            className={toolbarSelect}
          >
            <option value="">همه</option>
            <option value="draft">در حال شمارش</option>
            <option value="applied">اعمال‌شده</option>
            <option value="cancelled">لغو‌شده</option>
          </select>
          <button onClick={() => setCreating(true)} className={primaryButton}>
            <PlusIcon className={iconSize} aria-hidden="true" />
            انبارگردانی جدید
          </button>
        </div>
      </div>

      {loading ? (
        <div className="animate-pulse h-64 rounded-panel border border-border bg-surface" />
      ) : rows.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <ClipboardDocumentCheckIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {status
              ? "انبارگردانی‌ای با این وضعیت نیست"
              : "هنوز انبارگردانی نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            یک انبارگردانی باز کنید؛ برای هر کالا یک ردیف ساخته می‌شود تا آن را
            بشمارید.
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
            {rows.map((count) => (
              <motion.li key={count.id} variants={staggerItem}>
                <button
                  onClick={() => open(count)}
                  className={`${rowCard} w-full text-right cursor-pointer hover:border-border-strong`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-text-primary">
                        {count.number}
                        {count.blind && (
                          <span className="text-body-xs font-normal text-text-muted ms-2">
                            (کور)
                          </span>
                        )}
                      </p>
                      <p className="text-body-xs text-text-muted">
                        {formatPersianDate(count.created_at)} — {scope(count)}
                        {warehouses.showPicker
                          ? ` — ${count.warehouse_name}`
                          : ""}
                      </p>
                    </div>
                    <StatusBadge status={count.status} />
                  </div>
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <Progress count={count} />
                  </div>
                </button>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[880px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>شماره</th>
                    <th className={th}>تاریخ شروع</th>
                    {warehouses.showPicker && <th className={th}>انبار</th>}
                    <th className={th}>دامنه</th>
                    <th className={th}>پیشرفت</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>توضیح</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {rows.map((count) => (
                    <tr
                      key={count.id}
                      onClick={() => open(count)}
                      className={trClickable}
                    >
                      <td className={`${td} font-bold`}>
                        {count.number}
                        {count.blind && (
                          <span className="text-body-xs font-normal text-text-muted ms-2">
                            (کور)
                          </span>
                        )}
                      </td>
                      <td className={`${td} tabular-nums`}>
                        {formatPersianDate(count.created_at)}
                      </td>
                      {warehouses.showPicker && (
                        <td className={tdMuted}>{count.warehouse_name}</td>
                      )}
                      <td className={tdMuted}>{scope(count)}</td>
                      <td className={tdBare}>
                        <Progress count={count} />
                      </td>
                      <td className={tdBare}>
                        <StatusBadge status={count.status} />
                      </td>
                      <td className={`${tdMuted} max-w-[16rem] truncate`}>
                        {count.description ?? "—"}
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

      {creating && (
        <StockCountCreateModal
          onClose={() => setCreating(false)}
          onCreated={(count) => navigate(`/stock-counts/${count.id}`)}
        />
      )}
    </div>
  );
}
