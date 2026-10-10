import { useEffect, useMemo, useRef, useState } from "react";
import { useReactToPrint } from "react-to-print";
import { getSettings } from "../api";
import PrintPreviewModal from "./PrintPreviewModal";
import {
  formatPersianDate,
  formatQuantity,
  toPersianDigits,
} from "../utils/formatters";
import type { AppSettings, StockCountDetail } from "../types/api";

interface StockCountSheetProps {
  count: StockCountDetail;
  onClose: () => void;
}

const cell = "border border-black/60 px-2 py-1.5 align-top";

/**
 * The paper count sheet (14.15): every line in shelf order, with a blank box
 * to write the count in — for the shop that counts with a clipboard and
 * types the numbers in afterwards. The system quantity is printed only where
 * the screen would show it: never on a blind count still being counted.
 */
export default function StockCountSheet({
  count,
  onClose,
}: StockCountSheetProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSettings()
      .then((res) => setSettings(res.data))
      .catch(() => {});
  }, []);

  const lines = useMemo(
    () =>
      [...count.lines].sort(
        (a, b) =>
          (a.location ?? "￿").localeCompare(b.location ?? "￿", "fa") ||
          a.item_name.localeCompare(b.item_name, "fa"),
      ),
    [count.lines],
  );

  const showSystem = !(count.blind && count.status === "draft");

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: `برگه انبارگردانی ${count.number}`,
    pageStyle: `
      @page { size: A4 portrait; margin: 10mm; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      thead { display: table-header-group; }
      tr { break-inside: avoid; }
    `,
  });

  return (
    <PrintPreviewModal
      title="برگه‌ی شمارش"
      onPrint={handlePrint}
      onClose={onClose}
      maxWidth="210mm"
      showPdfButton
      note={
        <p className="mt-1 text-body-xs text-text-secondary">
          کاغذ: A4 — Portrait. ردیف‌ها به ترتیب قفسه چیده شده‌اند.
        </p>
      }
    >
      <div
        ref={printRef}
        className="print-sheet bg-white text-black mx-auto max-w-[210mm] p-6"
        dir="rtl"
        style={{ fontSize: "12px" }}
      >
        <div className="flex items-start justify-between border-b-2 border-black pb-2 mb-3">
          <div>
            <p className="text-base font-bold">
              {settings?.company_name || "برگه‌ی انبارگردانی"}
            </p>
            <p>
              برگه‌ی انبارگردانی {count.number}
              {count.blind ? " — شمارش کور" : ""}
            </p>
          </div>
          <div className="text-left leading-6">
            <p>انبار: {count.warehouse_name}</p>
            <p>
              دامنه:{" "}
              {count.category_name
                ? `فقط ${count.category_name}`
                : "همه‌ی کالاها"}
            </p>
            <p>تاریخ شروع: {formatPersianDate(count.created_at)}</p>
          </div>
        </div>

        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-black/10">
              <th className={`${cell} w-8`}>#</th>
              <th className={cell}>کد</th>
              <th className={cell}>نام کالا</th>
              <th className={cell}>قفسه</th>
              <th className={cell}>واحد</th>
              {showSystem && <th className={cell}>سیستم</th>}
              <th className={`${cell} w-24`}>شمارش</th>
              <th className={`${cell} w-40`}>توضیح</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={line.id}>
                <td className={`${cell} text-center`}>
                  {toPersianDigits(index + 1)}
                </td>
                <td className={cell} dir="ltr">
                  {line.item_code}
                </td>
                <td className={cell}>{line.item_name}</td>
                <td className={cell}>{line.location ?? ""}</td>
                <td className={cell}>{line.item_unit}</td>
                {showSystem && (
                  <td className={`${cell} text-center`}>
                    {line.expected_quantity !== null
                      ? formatQuantity(line.expected_quantity)
                      : ""}
                  </td>
                )}
                {/* Already counted on screen: printed, so the paper copy is
                    a record too. Otherwise a box to write in. */}
                <td className={`${cell} text-center font-bold`}>
                  {line.counted_quantity !== null
                    ? formatQuantity(line.counted_quantity)
                    : ""}
                </td>
                <td className={cell}>{line.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between mt-8 pt-2">
          <p>شمارنده: ......................... امضا: ..............</p>
          <p>تأییدکننده: ......................... امضا: ..............</p>
        </div>
      </div>
    </PrintPreviewModal>
  );
}
