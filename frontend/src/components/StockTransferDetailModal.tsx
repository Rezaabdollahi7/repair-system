import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { ArrowLeftIcon, TruckIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { getStockTransfer } from "../api";
import LoadingSpinner from "./LoadingSpinner";
import InfoRow from "./InfoRow";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatQuantity,
} from "../utils/formatters";
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
import type { Id, StockTransferDetail } from "../types/api";
import { currencyLabel } from "../utils/currency";

interface StockTransferDetailModalProps {
  transferId: Id;
  onClose: () => void;
}

/**
 * One transfer, read-only (14.16): it was applied when it was saved, and
 * the only correction is a transfer the other way.
 */
export default function StockTransferDetailModal({
  transferId,
  onClose,
}: StockTransferDetailModalProps) {
  const [transfer, setTransfer] = useState<StockTransferDetail | null>(null);

  useEffect(() => {
    getStockTransfer(transferId)
      .then((res) => setTransfer(res.data))
      .catch(() => {
        toast.error("خطا در دریافت سند");
        onClose();
      });
  }, [transferId, onClose]);

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-4xl my-2 sm:my-8"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-detail-title"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
          <h2
            id="transfer-detail-title"
            className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2"
          >
            <TruckIcon className="w-5 h-5 text-text-secondary" />
            {transfer ? `سند انتقال ${transfer.number}` : "سند انتقال"}
          </h2>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {!transfer ? (
          <div className="flex justify-center items-center h-48">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="p-3 sm:p-6 space-y-4">
            {/* From → to, in the reading direction: the source on the right. */}
            <div className="flex items-center justify-center gap-3 sm:gap-6 bg-surface-alt rounded-field p-4">
              <div className="text-center min-w-0">
                <p className="text-body-xs text-text-secondary">از انبار</p>
                <p className="text-body-md font-bold text-text-primary truncate">
                  {transfer.from_warehouse_name}
                </p>
              </div>
              <ArrowLeftIcon
                className="w-5 h-5 text-text-muted shrink-0"
                aria-hidden="true"
              />
              <div className="text-center min-w-0">
                <p className="text-body-xs text-text-secondary">به انبار</p>
                <p className="text-body-md font-bold text-text-primary truncate">
                  {transfer.to_warehouse_name}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 bg-surface shadow rounded-field p-4 sm:p-5">
              <div className="space-y-1">
                <InfoRow label="شماره سند" value={transfer.number} highlight />
                <InfoRow
                  label="تاریخ سند"
                  value={formatPersianDate(transfer.transferred_at)}
                />
              </div>
              <div className="space-y-1">
                <InfoRow
                  label="ثبت‌کننده"
                  value={transfer.created_by_name ?? "—"}
                />
                <InfoRow
                  label="ارزش"
                  value={`${formatPersianCurrency(transfer.value)} ${currencyLabel()}`}
                />
              </div>
              <div className="lg:col-span-2">
                <InfoRow label="توضیح" value={transfer.description ?? "—"} />
              </div>
            </div>

            {/* Phone: one card per line */}
            <ul className="lg:hidden space-y-3">
              {transfer.lines.map((line) => (
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
                    <span className="font-bold tabular-nums text-text-primary shrink-0">
                      {formatQuantity(line.quantity)} {line.item_unit}
                    </span>
                  </div>
                  {line.note && (
                    <p className="text-body-xs text-text-secondary mt-2">
                      {line.note}
                    </p>
                  )}
                  <p className="text-body-xs text-text-muted mt-1 tabular-nums">
                    {formatPersianCurrency(line.unit_cost)} ×{" "}
                    {formatQuantity(line.quantity)} ={" "}
                    {formatPersianCurrency(line.value)} {currencyLabel()}
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
                      <th className={th}>توضیح</th>
                      <th className={th}>میانگین بها ({currencyLabel()})</th>
                      <th className={th}>ارزش ({currencyLabel()})</th>
                    </tr>
                  </thead>
                  <tbody className={tbody}>
                    {transfer.lines.map((line) => (
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
                        <td className={`${td} font-bold tabular-nums`}>
                          {formatQuantity(line.quantity)} {line.item_unit}
                        </td>
                        <td className={tdMuted}>{line.note ?? "—"}</td>
                        <td className={`${tdMuted} tabular-nums`}>
                          {formatPersianCurrency(line.unit_cost)}
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {formatPersianCurrency(line.value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="text-body-xs text-text-secondary">
              این سند هنگام ثبت روی موجودی اعمال شده و ویرایش نمی‌شود. برای
              برگرداندن آن، انتقالی در جهت عکس ثبت کنید.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
