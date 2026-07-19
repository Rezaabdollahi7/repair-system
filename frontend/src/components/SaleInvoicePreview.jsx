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
    // این استایل فقط داخل iframe موقتِ react-to-print تزریق می‌شود
    // و فقط باید اندازه‌ی کاغذ را تعیین کند، نه visibility کل صفحه
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
  const showEmail = settings?.sale_invoice_show_email === 1;
  const showWebsite = settings?.sale_invoice_show_website === 1;
  const showCustomerPhone = settings?.sale_invoice_show_customer_phone === 1;
  const showSignature = settings?.sale_invoice_show_signature === 1;
  const showStamp = settings?.sale_invoice_show_stamp === 1;

  const paperSize = settings?.sale_invoice_paper_size || "A5";

  const paperSizeClasses = {
    A4: "max-w-[210mm] p-6",
    A5: "max-w-[210mm] p-4", // ← A5 Landscape: عرض بیشتر
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
        style={{
          maxWidth: isA4 ? "210mm" : isA5 ? "297mm" : "80mm", // ← A5 Landscape: 297mm عرض
        }}
      >
        {/* Header - no-print (این بخش خارج از printRef است پس در چاپ اصلاً کپی نمی‌شود) */}
        <div className="p-4 border-b border-gray-200 no-print">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold">
              پیش‌نمایش فاکتور فروش ({paperSize} - Landscape)
            </h3>
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrint}
                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1 text-sm"
              >
                <PrinterIcon className="w-4 h-4" />
                چاپ
              </button>
              <button
                onClick={handleDownloadPDF}
                className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1 text-sm"
              >
                <ArrowDownTrayIcon className="w-4 h-4" />
                PDF
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ برای حذف تاریخ/ساعت و آدرس بالا و پایین فاکتور، در پنجره‌ی چاپ
            گزینه‌ی «More settings → Headers and footers» را غیرفعال کنید.
          </p>
        </div>

        {/* Invoice Content - Printable */}
        <div className="flex-1 overflow-y-auto p-4">
          <div
            ref={printRef}
            className={`bg-white mx-auto ${paperSizeClasses[paperSize]}`}
            style={{ fontSize: isThermal ? "11px" : "14px" }}
          >
            {/* ===== HEADER ===== */}
            <div
              className={`border-b-2 border-gray-300 pb-3 ${spacing.section}`}
            >
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
                  <h1 className={`font-bold text-blue-700 ${fontSize.title}`}>
                    فاکتور فروش
                  </h1>
                  <p className="font-semibold">
                    {" "}
                    {settings?.company_name || "تعمیرگاه"}
                  </p>
                </div>

                {/* Left: Invoice Number & Date */}
                <div className="text-left">
                  {/* <p className={`${fontSize.body}`}>
                    <span>شماره فاکتور :</span>
                    <span dir="ltr" className="font-mono">
                      {invoice.invoice_number}
                    </span>
                  </p> */}
                  <p className={`mt-0.5 ${fontSize.small}`}>
                    <span>تاریخ: </span>
                    <span dir="ltr" className="font-mono">
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
                className={`border border-gray-200 rounded-lg ${spacing.padding}`}
              >
                <h3
                  className={`font-medium text-gray-700 mb-1 pb-1 border-b border-gray-200 ${fontSize.heading}`}
                >
                  مشخصات فروشنده
                </h3>
                <div className={`space-y-0.5 ${fontSize.small}`}>
                  {settings?.company_address && (
                    <p className="0 text-justify">
                      <span className="font-bold">آدرس : </span>
                      {settings.company_address}
                    </p>
                  )}
                  {settings?.company_phone && (
                    <p className="">
                      <span className="font-bold"> تلفن : </span>
                      {settings.company_phone}
                    </p>
                  )}
                  {showWebsite && settings?.company_website && (
                    <p className="">وب‌سایت: {settings.company_website}</p>
                  )}
                  {showEmail && settings?.company_email && (
                    <p className="">ایمیل: {settings.company_email}</p>
                  )}
                </div>
              </div>

              {/* Customer Info */}
              <div
                className={`border border-gray-200 rounded-lg ${spacing.padding}`}
              >
                <h3
                  className={`font-medium text-gray-700 mb-1 pb-1 border-b border-gray-200 ${fontSize.heading}`}
                >
                  مشخصات مشتری
                </h3>
                <div className={`space-y-0.5 ${fontSize.small}`}>
                  <p className="font-medium">
                    <span className="font-bold"> نام : </span>
                    {invoice.customer_name || "—"}
                  </p>
                  {showCustomerPhone && (
                    <p className="">
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
              <div className="flex justify-between items-center border border-gray-300 rounded-lg px-3 py-2 bg-gray-50 mb-3">
                <span className="font-bold">
                  شماره فاکتور : {invoice.invoice_number}
                 </span>
              </div>

              <h3
                className={`font-medium text-gray-700 mb-1 ${fontSize.heading}`}
              >
                اقلام فاکتور
              </h3>

              {/* جدول اقلام */}
              <table className="w-full border-collapse border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th
                      className={`border border-gray-300 px-1 py-1 text-center ${fontSize.small}`}
                    >
                      #
                    </th>
                    <th
                      className={`border border-gray-300 px-1 py-1 text-right ${fontSize.small}`}
                    >
                      شرح
                    </th>
                    <th
                      className={`border border-gray-300 px-1 py-1 text-center ${fontSize.small}`}
                    >
                      تعداد
                    </th>
                    <th
                      className={`border border-gray-300 px-1 py-1 text-center ${fontSize.small}`}
                    >
                      واحد
                    </th>
                    <th
                      className={`border border-gray-300 px-1 py-1 text-left ${fontSize.small}`}
                    >
                      قیمت واحد
                    </th>
                    <th
                      className={`border border-gray-300 px-1 py-1 text-left ${fontSize.small}`}
                    >
                      جمع
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items?.map((item, index) => (
                    <tr key={item.id}>
                      <td
                        className={`border border-gray-300 px-1 py-1 text-center ${fontSize.small}`}
                      >
                        {index + 1}
                      </td>
                      <td
                        className={`border border-gray-300 px-1 py-1 ${fontSize.small}`}
                      >
                        {item.item_name || item.name}
                      </td>
                      <td
                        className={`border border-gray-300 px-1 py-1 text-center ${fontSize.small}`}
                      >
                        {item.quantity}
                      </td>
                      <td
                        className={`border border-gray-300 px-1 py-1 text-center ${fontSize.small}`}
                      >
                        {item.unit || item.item_unit || "—"}
                      </td>
                      <td
                        className={`border border-gray-300 px-1 py-1 text-left ${fontSize.small}`}
                      >
                        {formatPersianCurrency(item.unit_price)}
                      </td>
                      <td
                        className={`border border-gray-300 px-1 py-1 text-left font-medium ${fontSize.small}`}
                      >
                        {formatPersianCurrency(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-bold">
                    <td
                      colSpan={5}
                      className={`border border-gray-300 px-1 py-1 text-left ${fontSize.small}`}
                    >
                      مبلغ قابل پرداخت:
                    </td>
                    <td
                      className={`border border-gray-300 px-1 py-1 text-left text-blue-700 ${fontSize.small}`}
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
                  className={`border border-gray-200 rounded-lg ${spacing.padding} mb-2`}
                >
                  <h3
                    className={`font-medium text-gray-700 mb-1 ${fontSize.heading}`}
                  >
                    توضیحات فاکتور
                  </h3>
                  <p
                    className={`text-gray-600 ${fontSize.body} whitespace-pre-wrap`}
                  >
                    {invoice.note}
                  </p>
                </div>
              )}

              {/* توضیحات ثابت (تنظیمات) */}
              {settings?.sale_invoice_footer_text && (
                <div
                  className={`border border-gray-200 rounded-lg ${spacing.padding}`}
                >
                  <p
                    className={`text-gray-600 ${fontSize.body} whitespace-pre-wrap`}
                  >
                    {settings.sale_invoice_footer_text}
                  </p>
                </div>
              )}
            </div>

            {/* ===== STAMP & SIGNATURE (Bottom Left) ===== */}
            {(showStamp || showSignature) && (
              <div
                className={`border-t border-gray-200 pt-3 mt-2 ${spacing.section}`}
              >
                <div className="flex items-start gap-4">
                  {showSignature && settings?.signature_image && (
                    <div className="text-center">
                      <img
                        src={baseUrl + settings.signature_image}
                        alt="Signature"
                        className={`object-contain ${isThermal ? "h-8" : isA5 ? "h-12" : "h-12"}`}
                      />
                      <p className={`text-gray-600 mt-0.5 ${fontSize.small}`}>
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
                      <p className={`text-gray-600 mt-0.5 ${fontSize.small}`}>
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
