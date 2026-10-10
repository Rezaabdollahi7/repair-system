import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ClipboardDocumentCheckIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { applyStockCount, getStockCountReview } from "../api";
import LoadingSpinner from "./LoadingSpinner";
import { errorText } from "../utils/errors";
import {
  formatPersianCurrency,
  formatQuantity,
  toPersianDigits,
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
import type {
  StockCountDetail,
  StockCountReview,
  StockCountReviewLine,
} from "../types/api";
import { currencyLabel } from "../utils/currency";

interface StockCountReviewModalProps {
  count: StockCountDetail;
  onClose: () => void;
  onApplied: (count: StockCountDetail) => void;
}

function Tile({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "success" | "danger";
}) {
  const color =
    tone === "success"
      ? "text-success-fg"
      : tone === "danger"
        ? "text-danger-fg"
        : "text-text-primary";
  return (
    <div className="rounded-panel border border-border bg-surface p-3">
      <p className="text-body-xs text-text-secondary">{label}</p>
      <p className={`text-title-sm font-bold tabular-nums ${color}`}>{value}</p>
      {detail && (
        <p className={`text-body-xs tabular-nums ${color}`}>{detail}</p>
      )}
    </div>
  );
}

function SignedQuantity({ line }: { line: StockCountReviewLine }) {
  const over = line.difference > 0;
  return (
    <span
      className={`font-bold tabular-nums ${over ? "text-success-fg" : "text-danger-fg"}`}
    >
      {/* Words rather than a sign: a «−» beside Persian digits is
          reordered by the bidi algorithm and reads as «۲٫۲۵-». */}
      {over ? "اضافه" : "کسری"} {formatQuantity(Math.abs(line.difference))}{" "}
      {line.item_unit}
    </span>
  );
}

/**
 * The step between counting and the ledger (14.15): every difference, what
 * it is worth, and — first, in a warning — the items that moved after they
 * were counted. Applying those needs an explicit tick, because the count may
 * be right but deserves a second look; the server refuses without it too.
 */
export default function StockCountReviewModal({
  count,
  onClose,
  onApplied,
}: StockCountReviewModalProps) {
  const [review, setReview] = useState<StockCountReview | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    getStockCountReview(count.id)
      .then((res) => setReview(res.data))
      .catch((error) => {
        toast.error(errorText(error, "خطا در دریافت بررسی"));
        onClose();
      });
  }, [count.id, onClose]);

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await applyStockCount(count.id, acknowledged);
      toast.success(`انبارگردانی ${count.number} روی موجودی اعمال شد`);
      onApplied(res.data);
    } catch (error) {
      toast.error(errorText(error, "خطا در اعمال انبارگردانی"));
    } finally {
      setApplying(false);
    }
  };

  const differences =
    review?.lines.filter((line) => line.difference !== 0) ?? [];
  const moved = review?.lines.filter((line) => line.moved_since) ?? [];
  const summary = review?.summary;
  const canApply =
    summary !== undefined &&
    summary.counted_count > 0 &&
    (moved.length === 0 || acknowledged);

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
        aria-labelledby="count-review-title"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border">
          <h2
            id="count-review-title"
            className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2"
          >
            <ClipboardDocumentCheckIcon className="w-5 h-5 text-text-secondary" />
            بررسی و اعمال {count.number}
          </h2>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {!review || !summary ? (
          <div className="flex justify-center items-center h-48">
            <LoadingSpinner size="md" />
          </div>
        ) : (
          <div className="p-3 sm:p-6 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Tile
                label="شمرده‌شده"
                value={`${toPersianDigits(summary.counted_count)} از ${toPersianDigits(summary.line_count)}`}
              />
              <Tile
                label="بدون اختلاف"
                value={toPersianDigits(summary.matching_count)}
              />
              <Tile
                label="اضافه"
                value={toPersianDigits(summary.surplus_count)}
                detail={`${formatPersianCurrency(summary.surplus_value)} ${currencyLabel()}`}
                tone="success"
              />
              <Tile
                label="کسری"
                value={toPersianDigits(summary.shortage_count)}
                detail={`${formatPersianCurrency(summary.shortage_value)} ${currencyLabel()}`}
                tone="danger"
              />
            </div>

            {summary.uncounted_count > 0 && (
              <p className="text-body-sm text-text-secondary bg-surface-alt rounded-field p-3">
                {toPersianDigits(summary.uncounted_count)} کالا شمرده نشده‌اند و
                موجودی‌شان دست نمی‌خورد.
              </p>
            )}

            {moved.length > 0 && (
              <div className="rounded-panel border border-warning/40 bg-warning-soft p-4">
                <p className="text-body-sm font-bold text-warning-fg flex items-center gap-2">
                  <ExclamationTriangleIcon
                    className="w-5 h-5"
                    aria-hidden="true"
                  />
                  {toPersianDigits(moved.length)} کالا پس از شمارش جابه‌جا
                  شده‌اند
                </p>
                <p className="text-body-xs text-warning-fg mt-1 leading-6">
                  بعد از شمردن این کالاها، خرید، فروش یا مصرفی برایشان ثبت شده.
                  اختلاف نسبت به موجودی لحظه‌ی شمارش اعمال می‌شود، پس آن حرکت‌ها
                  حفظ می‌شوند — اما اگر شک دارید، دوباره بشمارید:{" "}
                  {moved.map((line) => line.item_name).join("، ")}
                </p>
                <label className="mt-3 flex items-center gap-2 cursor-pointer w-fit">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
                  />
                  <span className="text-body-sm text-text-primary">
                    بررسی کردم، اعمال شود
                  </span>
                </label>
              </div>
            )}

            {differences.length === 0 ? (
              <p className="text-center text-body-sm text-success-fg py-6">
                همه‌ی کالاهای شمرده‌شده با موجودی سیستم می‌خوانند.
              </p>
            ) : (
              <div className={tableCard}>
                <div className={tableScroll}>
                  <table className="min-w-[640px] w-full">
                    <thead className={thead}>
                      <tr>
                        <th className={th}>کالا</th>
                        <th className={th}>سیستم (لحظه‌ی شمارش)</th>
                        <th className={th}>شمارش</th>
                        <th className={th}>اختلاف</th>
                        <th className={th}>ارزش ({currencyLabel()})</th>
                      </tr>
                    </thead>
                    <tbody className={tbody}>
                      {differences.map((line) => (
                        <tr key={line.line_id} className={tr}>
                          <td className={td}>
                            <span className="block font-bold">
                              {line.item_name}
                              {line.moved_since && (
                                <ExclamationTriangleIcon
                                  className="inline w-4 h-4 text-warning-fg ms-1 align-[-2px]"
                                  aria-label="پس از شمارش جابه‌جا شده"
                                />
                              )}
                            </span>
                            <span
                              className="block text-body-xs text-text-muted"
                              dir="ltr"
                            >
                              {line.item_code}
                            </span>
                          </td>
                          <td className={`${tdMuted} tabular-nums`}>
                            {formatQuantity(line.system_quantity)}
                          </td>
                          <td className={`${td} tabular-nums`}>
                            {formatQuantity(line.counted_quantity)}
                          </td>
                          <td className={td}>
                            <SignedQuantity line={line} />
                          </td>
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
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <p className="text-body-xs text-text-secondary">
                با اعمال، هر اختلاف یک حرکت «انبارگردانی» در دفتر انبار ثبت
                می‌کند و انبارگردانی بسته می‌شود.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 border border-border rounded-field text-text-primary hover:bg-surface-alt"
                >
                  بازگشت به شمارش
                </button>
                <button
                  onClick={handleApply}
                  disabled={!canApply || applying}
                  className="px-6 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {applying ? "در حال اعمال..." : "اعمال روی موجودی"}
                </button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
