import { useState, useEffect, useRef } from "react";
import { getSettings } from "../api";
import { useReactToPrint } from "react-to-print";
import { formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import PrintPreviewModal from "./PrintPreviewModal";
import type { AppSettings, RepairInvoiceDetail } from "../types/api";

interface InvoicePreviewProps {
  invoice: RepairInvoiceDetail | null;
  isOpen: boolean;
  onClose: () => void;
}

/** A label above its value, which is how every field on this sheet reads. */
function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="text-text-secondary shrink-0">{label}:</span>
      <span className="text-text-primary font-medium">{value || "—"}</span>
    </div>
  );
}

/*
 * One row of the totals panel.
 *
 * The four of them used to be table rows spanning five columns of the items
 * table, which meant the amounts were only aligned with the "جمع" column by
 * coincidence and the labels sat under "قیمت واحد".
 */
function Total({
  label,
  value,
  tone = "normal",
}: {
  label: string;
  value: string;
  tone?: "normal" | "danger" | "grand";
}) {
  return (
    <div
      className={`flex items-center justify-between gap-6 py-1.5 ${
        tone === "grand"
          ? "border-t border-border mt-1.5 pt-2.5 text-base font-bold"
          : "text-sm"
      }`}
    >
      <span
        className={
          tone === "grand" ? "text-text-primary" : "text-text-secondary"
        }
      >
        {label}
      </span>
      <span
        className={
          tone === "danger"
            ? "text-danger-fg"
            : tone === "grand"
              ? "text-primary"
              : "text-text-primary"
        }
      >
        {value}
      </span>
    </div>
  );
}

export default function InvoicePreview({
  invoice,
  isOpen,
  onClose,
}: InvoicePreviewProps) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      getSettings().then((res) => setSettings(res.data));
    }
  }, [isOpen]);

  const formatDate = (date: string | null | undefined) =>
    date ? new Date(date).toLocaleDateString("fa-IR") : "—";

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: invoice?.invoice_number || "فاکتور",
  });

  if (!isOpen || !invoice) return null;

  const th =
    "px-3 py-2.5 text-xs font-bold text-text-secondary border-b border-border-strong";
  const td = "px-3 py-2.5 text-sm text-text-primary border-b border-border";

  return (
    <PrintPreviewModal
      title="پیش‌نمایش فاکتور تعمیر"
      onPrint={handlePrint}
      onClose={onClose}
    >
      <div
        ref={printRef}
        className="print-sheet bg-surface mx-auto max-w-[210mm] p-8 shadow-sm rounded-card"
      >
        {/* ── Letterhead ─────────────────────────────────────────────── */}
        <div className="avoid-break flex items-start justify-between gap-6 pb-5 border-b-2 border-border-strong">
          <div className="flex items-start gap-4">
            {settings?.company_logo && (
              <img
                src={settings.company_logo}
                alt=""
                className="h-16 w-auto object-contain"
              />
            )}
            <div>
              <h2 className="text-xl font-bold text-text-primary">
                {settings?.company_name || "تعمیرگاه"}
              </h2>
              <div className="mt-1 space-y-0.5 text-xs text-text-secondary">
                {settings?.company_address && <p>{settings.company_address}</p>}
                {settings?.company_phone && (
                  <p>تلفن: {toPersianDigits(settings.company_phone)}</p>
                )}
                {settings?.company_email && <p>{settings.company_email}</p>}
              </div>
            </div>
          </div>

          {/*
            The invoice number is the one thing someone looking for this
            sheet in a drawer reads first, so it gets a tinted block of its
            own rather than being a line of body text beside the address.
          */}
          <div className="text-left shrink-0">
            <h1 className="text-lg font-bold text-primary">فاکتور تعمیر</h1>
            <p
              dir="ltr"
              className="mt-1.5 inline-block rounded-field bg-primary-soft px-2.5 py-1
                         text-base font-bold tracking-wide text-primary"
            >
              {invoice.invoice_number}
            </p>
            <p className="mt-1.5 text-xs text-text-secondary">
              تاریخ: {formatDate(invoice.invoice_date)}
            </p>
          </div>
        </div>

        {/* ── Customer & device ──────────────────────────────────────── */}
        <div className="avoid-break grid grid-cols-2 gap-5 mt-6">
          <section>
            <h3 className="text-xs font-bold text-text-secondary pb-1.5 mb-2 border-b border-border">
              اطلاعات مشتری
            </h3>
            <div className="space-y-1 text-sm">
              <Field label="نام" value={invoice.customer_name || ""} />
              <Field
                label="شماره تماس"
                value={toPersianDigits(invoice.customer_phone) || ""}
              />
            </div>
          </section>

          <section>
            <h3 className="text-xs font-bold text-text-secondary pb-1.5 mb-2 border-b border-border">
              اطلاعات دستگاه
            </h3>
            <div className="space-y-1 text-sm">
              <Field
                label="شماره پذیرش"
                value={toPersianDigits(invoice.device_id)}
              />
              <Field label="دستگاه" value={invoice.device_name} />
              <Field label="برند" value={invoice.brand || ""} />
              <Field label="مدل" value={invoice.model || ""} />
              <Field label="سریال" value={invoice.serial_number || ""} />
            </div>
          </section>
        </div>

        {/* ── Items ──────────────────────────────────────────────────── */}
        <div className="mt-6">
          <h3 className="text-xs font-bold text-text-secondary mb-2">
            اقلام فاکتور
          </h3>
          {/*
            Horizontal rules only. The full cell grid this had was a lot of
            ink for lines nobody reads, and it made a four-line invoice look
            like a spreadsheet.
          */}
          <table className="w-full border-collapse">
            <thead className="bg-surface-alt">
              <tr>
                <th className={`${th} text-right w-10`}>#</th>
                <th className={`${th} text-right`}>شرح</th>
                <th className={`${th} text-center w-16`}>تعداد</th>
                <th className={`${th} text-center w-20`}>واحد</th>
                <th className={`${th} text-left w-32`}>قیمت واحد</th>
                <th className={`${th} text-left w-32`}>جمع</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items?.map((item, index) => (
                <tr key={item.id}>
                  <td className={`${td} text-center text-text-secondary`}>
                    {toPersianDigits(index + 1)}
                  </td>
                  <td className={td}>{item.name}</td>
                  <td className={`${td} text-center`}>
                    {toPersianDigits(item.quantity)}
                  </td>
                  <td className={`${td} text-center text-text-secondary`}>
                    {item.unit}
                  </td>
                  <td className={`${td} text-left`}>
                    {formatPersianCurrency(item.unit_price)}
                  </td>
                  <td className={`${td} text-left font-medium`}>
                    {formatPersianCurrency(item.total_price)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Totals ─────────────────────────────────────────────────── */}
        <div className="avoid-break flex justify-start mt-5">
          <div className="w-full max-w-xs rounded-card bg-surface-alt px-4 py-3">
            <Total
              label="جمع کل"
              value={formatPersianCurrency(invoice.subtotal)}
            />
            {invoice.discount_amount > 0 && (
              <Total
                label="تخفیف"
                tone="danger"
                value={`− ${formatPersianCurrency(invoice.discount_amount)}`}
              />
            )}
            {invoice.tax_amount > 0 && (
              <Total
                label={`مالیات (${toPersianDigits(invoice.tax_rate)}٪)`}
                value={formatPersianCurrency(invoice.tax_amount)}
              />
            )}
            <Total
              label="مبلغ قابل پرداخت"
              tone="grand"
              value={`${formatPersianCurrency(invoice.total_amount)} ریال`}
            />
          </div>
        </div>

        {/* ── Warranty & notes ───────────────────────────────────────── */}
        <div className="avoid-break grid grid-cols-2 gap-5 mt-6">
          <section>
            <h3 className="text-xs font-bold text-text-secondary pb-1.5 mb-2 border-b border-border">
              گارانتی
            </h3>
            <p className="text-sm text-text-primary">
              {invoice.warranty_months > 0
                ? `${toPersianDigits(invoice.warranty_months)} ماه — تا ${formatDate(invoice.warranty_until)}`
                : "بدون گارانتی"}
            </p>
            {invoice.technician_name && (
              <p className="mt-1 text-xs text-text-secondary">
                تعمیرکار: {invoice.technician_name}
              </p>
            )}
          </section>
          <section>
            <h3 className="text-xs font-bold text-text-secondary pb-1.5 mb-2 border-b border-border">
              توضیحات
            </h3>
            <p className="text-sm text-text-primary whitespace-pre-line">
              {invoice.notes || "—"}
            </p>
          </section>
        </div>

        {/* ── Signature & stamp ──────────────────────────────────────── */}
        <div className="avoid-break border-t-2 border-border-strong mt-8 pt-6">
          <div className="flex items-end justify-between gap-8">
            {/*
              A ruled line under each block whether or not an image was
              uploaded — most shops sign by hand on the printed sheet, and
              an empty caption gave them nothing to sign on.
            */}
            <div className="w-44 text-center">
              {settings?.signature_image ? (
                <img
                  src={settings.signature_image}
                  alt=""
                  className="h-16 w-auto object-contain mx-auto"
                />
              ) : (
                <div className="h-16" />
              )}
              <p className="border-t border-border pt-1.5 text-xs text-text-secondary">
                امضا
              </p>
            </div>
            <div className="w-44 text-center">
              {settings?.stamp_image ? (
                <img
                  src={settings.stamp_image}
                  alt=""
                  className="h-16 w-auto object-contain mx-auto"
                />
              ) : (
                <div className="h-16" />
              )}
              <p className="border-t border-border pt-1.5 text-xs text-text-secondary">
                مهر شرکت
              </p>
            </div>
          </div>

          {settings?.invoice_footer_text && (
            <p className="mt-6 text-center text-xs text-text-secondary">
              {settings.invoice_footer_text}
            </p>
          )}
        </div>
      </div>
    </PrintPreviewModal>
  );
}
