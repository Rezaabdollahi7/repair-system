import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { getItemKardex } from "../api";
import { useModal } from "../context/ModalContext";
import Pagination from "./Pagination";
import PersianDatePicker from "./PersianDatePicker";
import StatusPill from "./StatusPill";
import StockAdjustmentDetailModal from "./StockAdjustmentDetailModal";
import StockTransferDetailModal from "./StockTransferDetailModal";
import { reasonLabel } from "../utils/adjustmentReason";
import { errorText } from "../utils/errors";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatQuantity,
} from "../utils/formatters";
import { movementTypeOf } from "../utils/movementType";
import {
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  toolbarSelect,
  tr,
} from "../utils/tableClasses";
import type {
  ItemKardex as ItemKardexData,
  KardexRow,
  QueryParams,
} from "../types/api";

interface ItemKardexProps {
  itemId: number;
  unit: string;
  /** Changes when the item's stock does, so a quick sale reloads the list. */
  version: number;
  /** Warehouse id → name, or null for a shop that has met only one. */
  warehouseNames: Map<number, string> | null;
}

function Figure({
  label,
  value,
  tone = "text-text-primary",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-field px-3 py-2.5">
      <p className="text-body-xs text-text-secondary">{label}</p>
      <p className={`text-body-md font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/**
 * An item's kardex (14.19): every movement in the order it was entered,
 * newest first, with its document's date, what came in, what went out and
 * the balance after it. Each document number opens that document.
 *
 * In and out are two columns rather than one signed figure: a «−» beside
 * Persian digits lands on the wrong side of them, and a column of one
 * colour reads faster than a sign.
 */
export default function ItemKardex({
  itemId,
  unit,
  version,
  warehouseNames,
}: ItemKardexProps) {
  const navigate = useNavigate();
  const {
    openPurchaseInvoiceDetail,
    openSaleInvoiceDetail,
    openRepairInvoiceDetail,
  } = useModal();
  const [data, setData] = useState<ItemKardexData | null>(null);
  const [warehouseId, setWarehouseId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [adjustmentId, setAdjustmentId] = useState<number | null>(null);
  const [transferId, setTransferId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const params: QueryParams = { page, limit };
    if (warehouseId) params.warehouse_id = warehouseId;
    if (fromDate) params.from_date = fromDate;
    if (toDate) params.to_date = toDate;
    getItemKardex(itemId, params)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((error) => {
        if (!cancelled) toast.error(errorText(error, "خطا در دریافت کاردکس"));
      });
    return () => {
      cancelled = true;
    };
  }, [itemId, version, warehouseId, fromDate, toDate, page, limit]);

  const closeAdjustment = useCallback(() => setAdjustmentId(null), []);
  const closeTransfer = useCallback(() => setTransferId(null), []);

  const openDocument = (row: KardexRow) => {
    const id = row.reference_id;
    if (id === null) return;
    switch (row.reference_type) {
      case "purchase_invoice":
        return openPurchaseInvoiceDetail(id);
      case "sale_invoice":
        return openSaleInvoiceDetail(id);
      case "repair_invoice":
        return openRepairInvoiceDetail(id);
      case "stock_adjustment":
        return setAdjustmentId(id);
      case "stock_transfer":
        return setTransferId(id);
      case "stock_count":
        return navigate(`/stock-counts/${id}`);
    }
  };

  const filtered = Boolean(warehouseId || fromDate || toDate);
  const quantity = (value: number) => `${formatQuantity(value)} ${unit}`;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-3">
        {warehouseNames && (
          <div className="sm:w-48">
            <label className="block text-body-xs text-text-secondary mb-1">
              انبار
            </label>
            <select
              value={warehouseId}
              onChange={(e) => {
                setWarehouseId(e.target.value);
                setPage(1);
              }}
              aria-label="انبار"
              className={`${toolbarSelect} w-full`}
            >
              <option value="">همه انبارها</option>
              {[...warehouseNames].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="sm:w-44">
          <label className="block text-body-xs text-text-secondary mb-1">
            از تاریخ
          </label>
          <PersianDatePicker
            value={fromDate}
            onChange={(value) => {
              setFromDate(value);
              setPage(1);
            }}
            placeholder="از ابتدا"
            clearable
          />
        </div>
        <div className="sm:w-44">
          <label className="block text-body-xs text-text-secondary mb-1">
            تا تاریخ
          </label>
          <PersianDatePicker
            value={toDate}
            onChange={(value) => {
              setToDate(value);
              setPage(1);
            }}
            placeholder="تا امروز"
            clearable
          />
        </div>
      </div>

      {data === null ? (
        <div className="animate-pulse h-64 rounded-panel bg-surface" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Figure
              label={filtered ? "مانده ابتدای بازه" : "مانده ابتدا"}
              value={quantity(data.summary.opening)}
            />
            <Figure
              label="جمع ورود"
              value={quantity(data.summary.total_in)}
              tone="text-success-fg"
            />
            <Figure
              label="جمع خروج"
              value={quantity(data.summary.total_out)}
              tone="text-danger-fg"
            />
            <Figure
              label={filtered ? "مانده پایان بازه" : "مانده فعلی"}
              value={quantity(data.summary.closing)}
            />
          </div>

          {data.data.length === 0 ? (
            <p className="text-body-sm text-text-muted text-center py-10">
              {filtered
                ? "در این بازه حرکتی ثبت نشده است."
                : "هنوز حرکتی برای این کالا ثبت نشده است."}
            </p>
          ) : (
            <div className={tableCard}>
              <div className={tableScroll}>
                <table className="w-full min-w-[56rem]">
                  <thead className={thead}>
                    <tr>
                      <th className={th}>تاریخ سند</th>
                      <th className={th}>نوع</th>
                      <th className={th}>سند</th>
                      {warehouseNames && <th className={th}>انبار</th>}
                      <th className={th}>ورود</th>
                      <th className={th}>خروج</th>
                      <th className={th}>مانده</th>
                      <th className={th}>بهای واحد (ریال)</th>
                      <th className={th}>شرح</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {data.data.map((row) => {
                      const type = movementTypeOf(row.type);
                      const note = [
                        row.reason && row.type === "adjustment"
                          ? reasonLabel(row.reason)
                          : null,
                        row.note,
                      ]
                        .filter(Boolean)
                        .join(" — ");
                      return (
                        <tr
                          key={row.id}
                          className={tr}
                          title={`ثبت: ${formatPersianDate(row.created_at)}${row.created_by_name ? ` — ${row.created_by_name}` : ""}`}
                        >
                          <td className={`${tdMuted} tabular-nums`}>
                            {formatPersianDate(row.occurred_at)}
                          </td>
                          <td className={tdBare}>
                            <StatusPill
                              label={type.label}
                              color={type.color}
                              tone={type.tone}
                              size="sm"
                            />
                          </td>
                          <td className={td}>
                            {row.document_number ? (
                              <button
                                onClick={() => openDocument(row)}
                                className="text-primary font-bold hover:underline cursor-pointer tabular-nums"
                              >
                                {row.document_number}
                              </button>
                            ) : (
                              <span className="text-text-muted">—</span>
                            )}
                          </td>
                          {warehouseNames && (
                            <td className={tdMuted}>{row.warehouse_name}</td>
                          )}
                          <td className={`${td} tabular-nums text-success-fg`}>
                            {row.quantity > 0
                              ? formatQuantity(row.quantity)
                              : ""}
                          </td>
                          <td className={`${td} tabular-nums text-danger-fg`}>
                            {row.quantity < 0
                              ? formatQuantity(Math.abs(row.quantity))
                              : ""}
                          </td>
                          <td className={`${td} font-bold tabular-nums`}>
                            {formatQuantity(row.balance)}
                          </td>
                          <td className={`${tdMuted} tabular-nums`}>
                            {row.unit_cost !== null
                              ? formatPersianCurrency(row.unit_cost)
                              : "—"}
                          </td>
                          <td className={`${tdMuted} max-w-[14rem] truncate`}>
                            {note || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Pagination
            page={page}
            totalPages={data.totalPages}
            total={data.total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </>
      )}

      {adjustmentId !== null && (
        <StockAdjustmentDetailModal
          adjustmentId={adjustmentId}
          onClose={closeAdjustment}
        />
      )}
      {transferId !== null && (
        <StockTransferDetailModal
          transferId={transferId}
          onClose={closeTransfer}
        />
      )}
    </div>
  );
}
