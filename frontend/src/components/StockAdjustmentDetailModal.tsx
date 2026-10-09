import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  AdjustmentsHorizontalIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { getStockAdjustment } from "../api";
import LoadingSpinner from "./LoadingSpinner";
import InfoRow from "./InfoRow";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatQuantity,
} from "../utils/formatters";
import { reasonLabel } from "../utils/adjustmentReason";
import { modalPanel } from "../motion";
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
import type { Id, StockAdjustmentDetail } from "../types/api";

interface StockAdjustmentDetailModalProps {
  adjustmentId: Id;
  onClose: () => void;
}

/** A signed quantity: «+۲» in green onto the shelf, «−۱» in red off it. */
function SignedQuantity({
  quantity,
  unit,
}: {
  quantity: number;
  unit: string;
}) {
  const incoming = quantity > 0;
  return (
    <span
      className={`font-bold tabular-nums ${incoming ? "text-success-fg" : "text-danger-fg"}`}
    >
      {incoming ? "+" : "−"}
      {formatQuantity(Math.abs(quantity))} {unit}
    </span>
  );
}

/**
 * One stock adjustment, read-only (14.14): it was applied when it was saved,
 * and the only correction is another adjustment.
 */
export default function StockAdjustmentDetailModal({
  adjustmentId,
  onClose,
}: StockAdjustmentDetailModalProps) {
  const [adjustment, setAdjustment] = useState<StockAdjustmentDetail | null>(
    null,
  );

  useEffect(() => {
    getStockAdjustment(adjustmentId)
      .then((res) => setAdjustment(res.data))
      .catch(() => {
        toast.error("خطا در دریافت سند");
        onClose();
      });
  }, [adjustmentId, onClose]);

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-5xl my-2 sm:my-8"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjustment-detail-title"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
          <h2
            id="adjustment-detail-title"
            className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2"
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5 text-text-secondary" />
            {adjustment ? `سند اصلاح ${adjustment.number}` : "سند اصلاح موجودی"}
          </h2>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {!adjustment ? (
          <div className="flex justify-center items-center h-48">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="p-3 sm:p-6 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 bg-surface shadow rounded-field p-4 sm:p-5">
              <div className="space-y-1">
                <InfoRow
                  label="شماره سند"
                  value={adjustment.number}
                  highlight
                />
                <InfoRow
                  label="تاریخ سند"
                  value={formatPersianDate(adjustment.adjusted_at)}
                />
                <InfoRow label="انبار" value={adjustment.warehouse_name} />
              </div>
              <div className="space-y-1">
                <InfoRow
                  label="ثبت‌کننده"
                  value={adjustment.created_by_name ?? "—"}
                />
                <InfoRow
                  label="ارزش ورود / خروج"
                  value={`${formatPersianCurrency(adjustment.value_in)} / ${formatPersianCurrency(adjustment.value_out)} ریال`}
                />
                <InfoRow label="توضیح" value={adjustment.description ?? "—"} />
              </div>
            </div>

            {/* Phone: one card per line */}
            <ul className="lg:hidden space-y-3">
              {adjustment.lines.map((line) => (
                <li
                  key={line.id}
                  className="border border-border rounded-field p-3 bg-surface"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-text-primary truncate">
                        {line.item_name}
                      </p>
                      <p className="text-body-xs text-text-muted" dir="ltr">
                        {line.item_code}
                      </p>
                    </div>
                    <SignedQuantity
                      quantity={line.quantity}
                      unit={line.item_unit}
                    />
                  </div>
                  <p className="text-body-xs text-text-secondary mt-2">
                    {reasonLabel(line.reason)}
                    {line.note ? ` — ${line.note}` : ""}
                  </p>
                  <p className="text-body-xs text-text-muted mt-1 tabular-nums">
                    {formatPersianCurrency(line.unit_cost)} ×{" "}
                    {formatQuantity(Math.abs(line.quantity))} ={" "}
                    {formatPersianCurrency(Math.abs(line.value))} ریال
                  </p>
                </li>
              ))}
            </ul>

            <div className={`hidden lg:block ${tableCard}`}>
              <div className={tableScroll}>
                <table className="w-full">
                  <thead className={thead}>
                    <tr>
                      <th className={th}>کالا</th>
                      <th className={th}>مقدار</th>
                      <th className={th}>دلیل</th>
                      <th className={th}>توضیح</th>
                      <th className={th}>بهای واحد (ریال)</th>
                      <th className={th}>ارزش (ریال)</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {adjustment.lines.map((line) => (
                      <tr key={line.id} className={tr}>
                        <td className={td}>
                          <span className="block font-bold">
                            {line.item_name}
                          </span>
                          <span
                            className="block text-text-muted text-body-xs"
                            dir="ltr"
                          >
                            {line.item_code}
                          </span>
                        </td>
                        <td className={td}>
                          <SignedQuantity
                            quantity={line.quantity}
                            unit={line.item_unit}
                          />
                        </td>
                        <td className={td}>{reasonLabel(line.reason)}</td>
                        <td className={tdMuted}>{line.note ?? "—"}</td>
                        <td className={`${tdMuted} tabular-nums`}>
                          {formatPersianCurrency(line.unit_cost)}
                        </td>
                        {/* Unsigned and coloured, like the quantity: a minus
                            sign beside a Persian number lands on the wrong
                            side of it in a right-to-left cell. */}
                        <td
                          className={`${td} tabular-nums ${line.value > 0 ? "text-success-fg" : "text-danger-fg"}`}
                        >
                          {formatPersianCurrency(Math.abs(line.value))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-body-xs text-text-secondary">
              این سند هنگام ثبت روی موجودی اعمال شده و ویرایش نمی‌شود. برای
              اصلاح آن، سند تازه‌ای ثبت کنید.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
