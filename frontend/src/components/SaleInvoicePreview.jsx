// src/components/SaleInvoicePreview.jsx
import { useState, useEffect, useRef } from "react";
import { getSettings } from "../api";
import {
  XMarkIcon,
  PrinterIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/solid";
import { useReactToPrint } from "react-to-print";
import { formatPersianCurrency } from "../utils/formatters";
import { getBaseUrl } from "../utils/helpers";

export default function SaleInvoicePreview({ invoice, isOpen, onClose }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      getSettings()
        .then((res) => setSettings(res.data))
        .finally(() => setLoading(false));
    }
  }, [isOpen]);

  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString("fa-IR") : "—";

  const paperSize0 = settings?.sale_invoice_paper_size || "A5";
  const isA50 = paperSize0 === "A5";
  const isA40 = paperSize0 === "A4";

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: invoice?.invoice_number || "فاکتور فروش",
    pageStyle: `
      @page {
        size: ${isA50 ? "A5 landscape" : isA40 ? "A4 portrait" : "80mm auto"};
        margin: 5mm;
      }
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    `,
    onAfterPrint: () => console.log("Print completed"),
  });

  const handleDownloadPDF = () => {
    handlePrint();
  };

  if (!isOpen || !invoice) return null;

  const baseUrl = getBaseUrl();
  const showLogo = settings?.sale_invoice_show_logo !== 0;
  const showEmail = Boolean(settings?.sale_invoice_show_email);
  const showWebsite = Boolean(settings?.sale_invoice_show_website);
  const showCustomerPhone = Boolean(settings?.sale_invoice_show_customer_phone);
  const showSignature = Boolean(settings?.sale_invoice_show_signature);
  const showStamp = Boolean(settings?.sale_invoice_show_stamp);

  const paperSize = settings?.sale_invoice_paper_size || "A5";

  const paperSizeClasses = {
    A4: "max-w-[210mm] p-6",
    A5: "max-w-[210mm] p-4",
    Thermal: "max-w-[80mm] p-2",
  };

  const isA5 = paperSize === "A5";
  const isThermal = paperSize === "Thermal";
  const isA4 = paperSize === "A4";

  const fontSize = {
    title: isThermal ? "text-base" : isA5 ? "text-lg" : "text-2xl",
    heading: isThermal ? "text-xs" : isA5 ? "text-sm" : "text-base",
    body: isThermal ? "text-[10px]" : isA5 ? "text-xs" : "text-sm",
    small: isThermal ? "text-[8px]" : isA5 ? "text-[10px]" : "text-xs",
  };

  const spacing = {
    section: isThermal ? "mb-2" : isA5 ? "mb-3" : "mb-4",
    padding: isThermal ? "p-1" : isA5 ? "p-2" : "p-3",
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-surface rounded-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
        style={{
          maxWidth: isA4 ? "210mm" : isA5 ? "297mm" : "80mm",
        }}
      >
        {/* Header - no-print */}
        <div className="p-4 border-b border-border no-print">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-text-primary">
              پیش‌نمایش فاکتور فروش ({paperSize} - Landscape)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover flex items-center gap-1 text-sm"
              >
                <PrinterIcon className="w-4 h-4" />
                چاپ
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-3 py-2 bg-success text-text-inverse rounded-lg hover:bg-success-hover flex items-center gap-1 text-sm"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-warning mt-2">
            ⚠️ برای حذف تاریخ/ساعت و آدرس بالا و پایین فاکتور، در پنجره‌ی چاپ
            گزینه‌ی «More settings → Headers and footers» را غیرفعال کنید.
          </p>
        </div>

        {/* Invoice Content - Printable */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={printRef}
            className={`bg-surface mx-auto ${paperSizeClasses[paperSize]}`}
            style={{ fontSize: isThermal ? "11px" : "14px" }}
          >
            {/* ===== HEADER ===== */}
            <div className={`border-b-2 border-border pb-3 ${spacing.section}`}>
              <div className="flex items-center justify-between">
                {/* Right: Logo */}
                <div className="flex items-start gap-2">
                  {showLogo && settings?.company_logo && (
                    <img
                      src={baseUrl + settings.company_logo}
                      alt="Logo"
                      className={`object-contain rounded-sm ${isThermal ? "h-8" : isA5 ? "h-12" : "h-14"}`}
                    />
                  )}
                </div>

                {/* Center: Title */}
                <div className="flex flex-col gap-1 items-center justify-center">
                  <h1 className={`font-bold text-primary ${fontSize.title}`}>
                    فاکتور فروش
                  </h1>
                  <p className="font-semibold text-text-primary">
                    {settings?.company_name || "تعمیرگاه"}
                  </p>
                </div>

                {/* Left: Invoice Number & Date */}
                <div className="text-left">
                  <p className={`mt-0.5 ${fontSize.small} text-text-primary`}>
                    <span>تاریخ: </span>
                    <span dir="ltr" className="font-mono text-text-primary">
                      {formatDate(invoice.invoice_date)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            {/* ===== SELLER & CUSTOMER INFO (2 Columns) ===== */}
            <div className={`grid grid-cols-2 gap-3 ${spacing.section}`}>
              {/* Seller Info */}
              <div
                className={`border border-border rounded-lg ${spacing.padding}`}
              >
                <h3
                  className={`font-medium text-text-primary mb-1 pb-1 border-b border-border ${fontSize.heading}`}
                >
                  مشخصات فروشنده
                </h3>
                <div
                  className={`space-y-0.5 ${fontSize.small} text-text-primary`}
                >
                  {settings?.company_address && (
                    <p className="text-justify">
                      <span className="font-bold">آدرس : </span>
                      {settings.company_address}
                    </p>
                  )}
                  {settings?.company_phone && (
                    <p>
                      <span className="font-bold"> تلفن : </span>
                      {settings.company_phone}
                    </p>
                  )}
                  {showWebsite && settings?.company_website && (
                    <p>وب‌سایت: {settings.company_website}</p>
                  )}
                  {showEmail && settings?.company_email && (
                    <p>ایمیل: {settings.company_email}</p>
                  )}
                </div>
              </div>

              {/* Customer Info */}
              <div
                className={`border border-border rounded-lg ${spacing.padding}`}
              >
                <h3
                  className={`font-medium text-text-primary mb-1 pb-1 border-b border-border ${fontSize.heading}`}
                >
                  مشخصات مشتری
                </h3>
                <div
                  className={`space-y-0.5 ${fontSize.small} text-text-primary`}
                >
                  <p className="font-medium">
                    <span className="font-bold"> نام : </span>
                    {invoice.customer_name || "—"}
                  </p>
                  {showCustomerPhone && (
                    <p>
                      <span className="font-bold"> تلفن : </span>
                      {invoice.customer_phone || "—"}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ===== ITEMS TABLE ===== */}
            <div className={spacing.section}>
              {/* سطر شماره فاکتور - بالای جدول */}
              <div className="flex justify-between items-center border border-border rounded-lg px-3 py-2 bg-surface-alt mb-3">
                <span className="font-bold text-text-primary">
                  شماره فاکتور : {invoice.invoice_number}
                </span>
              </div>

              <h3
                className={`font-medium text-text-primary mb-1 ${fontSize.heading}`}
              >
                اقلام فاکتور
              </h3>

              {/* جدول اقلام */}
              <table className="w-full border-collapse border border-border">
                <thead className="bg-surface-alt">
                  <tr>
                    <th
                      className={`border border-border px-1 py-1 text-center ${fontSize.small} text-text-primary`}
                    >
                      #
                    </th>
                    <th
                      className={`border border-border px-1 py-1 text-right ${fontSize.small} text-text-primary`}
                    >
                      شرح
                    </th>
                    <th
                      className={`border border-border px-1 py-1 text-center ${fontSize.small} text-text-primary`}
                    >
                      تعداد
                    </th>
                    <th
                      className={`border border-border px-1 py-1 text-center ${fontSize.small} text-text-primary`}
                    >
                      واحد
                    </th>
                    <th
                      className={`border border-border px-1 py-1 text-left ${fontSize.small} text-text-primary`}
                    >
                      قیمت واحد
                    </th>
                    <th
                      className={`border border-border px-1 py-1 text-left ${fontSize.small} text-text-primary`}
                    >
                      جمع
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items?.map((item, index) => (
                    <tr key={item.id}>
                      <td
                        className={`border border-border px-1 py-1 text-center ${fontSize.small} text-text-primary`}
                      >
                        {index + 1}
                      </td>
                      <td
                        className={`border border-border px-1 py-1 ${fontSize.small} text-text-primary`}
                      >
                        {item.item_name || item.name}
                      </td>
                      <td
                        className={`border border-border px-1 py-1 text-center ${fontSize.small} text-text-primary`}
                      >
                        {item.quantity}
                      </td>
                      <td
                        className={`border border-border px-1 py-1 text-center ${fontSize.small} text-text-secondary`}
                      >
                        {item.unit || item.item_unit || "—"}
                      </td>
                      <td
                        className={`border border-border px-1 py-1 text-left ${fontSize.small} text-text-primary`}
                      >
                        {formatPersianCurrency(item.unit_price)}
                      </td>
                      <td
                        className={`border border-border px-1 py-1 text-left font-medium ${fontSize.small} text-text-primary`}
                      >
                        {formatPersianCurrency(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-surface-alt">
                  <tr className="font-bold">
                    <td
                      colSpan={5}
                      className={`border border-border px-1 py-1 text-left ${fontSize.small} text-text-primary`}
                    >
                      مبلغ قابل پرداخت:
                    </td>
                    <td
                      className={`border border-border px-1 py-1 text-left text-primary ${fontSize.small}`}
                    >
                      {formatPersianCurrency(invoice.total_amount)} ریال
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* ===== NOTES (Invoice Note + Footer Text) ===== */}
            <div className={spacing.section}>
              {/* توضیحات فاکتور (مختص هر فاکتور) */}
              {invoice.note && (
                <div
                  className={`border border-border rounded-lg ${spacing.padding} mb-2`}
                >
                  <h3
                    className={`font-medium text-text-primary mb-1 ${fontSize.heading}`}
                  >
                    توضیحات فاکتور
                  </h3>
                  <p
                    className={`text-text-secondary ${fontSize.body} whitespace-pre-wrap`}
                  >
                    {invoice.note}
                  </p>
                </div>
              )}

              {/* توضیحات ثابت (تنظیمات) */}
              {settings?.sale_invoice_footer_text && (
                <div
                  className={`border border-border rounded-lg ${spacing.padding}`}
                >
                  <p
                    className={`text-text-secondary ${fontSize.body} whitespace-pre-wrap`}
                  >
                    {settings.sale_invoice_footer_text}
                  </p>
                </div>
              )}
            </div>

            {/* ===== STAMP & SIGNATURE (Bottom Left) ===== */}
            {(showStamp || showSignature) && (
              <div
                className={`border-t border-border pt-3 mt-2 ${spacing.section}`}
              >
                <div className="flex items-start gap-4">
                  {showSignature && settings?.signature_image && (
                    <div className="text-center">
                      <img
                        src={baseUrl + settings.signature_image}
                        alt="Signature"
                        className={`object-contain ${isThermal ? "h-8" : isA5 ? "h-12" : "h-12"}`}
                      />
                      <p
                        className={`text-text-secondary mt-0.5 ${fontSize.small}`}
                      >
                        امضا
                      </p>
                    </div>
                  )}
                  {showStamp && settings?.stamp_image && (
                    <div className="text-center">
                      <img
                        src={baseUrl + settings.stamp_image}
                        alt="Stamp"
                        className={`object-contain ${isThermal ? "h-8" : isA5 ? "h-12" : "h-12"}`}
                      />
                      <p
                        className={`text-text-secondary mt-0.5 ${fontSize.small}`}
                      >
                        مهر
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
