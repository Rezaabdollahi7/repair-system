// src/components/InvoicePreview.jsx
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

export default function InvoicePreview({ invoice, isOpen, onClose }) {
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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: invoice?.invoice_number || "فاکتور",
    onAfterPrint: () => console.log("Print completed"),
  });

  const handleDownloadPDF = () => {
    handlePrint(); // مرورگر خودش گزینه Save as PDF داره
  };

  if (!isOpen || !invoice) return null;

  const baseUrl = getBaseUrl();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
      >
        {/* Header - no-print */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 no-print">
          <h3 className="text-lg font-bold">پیش‌نمایش فاکتور</h3>
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

        {/* Invoice Content - Printable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div ref={printRef} className="bg-white p-6">
            {/* Company Header */}
            <div className="border-b-2 border-gray-300 pb-4 mb-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  {settings?.company_logo && (
                    <img
                      src={baseUrl + settings.company_logo}
                      alt="Logo"
                      className="h-16 w-auto object-contain"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      {settings?.company_name || "تعمیرگاه"}
                    </h2>
                    {settings?.company_address && (
                      <p className="text-sm text-gray-600 mt-1">
                        {settings.company_address}
                      </p>
                    )}
                    {settings?.company_phone && (
                      <p className="text-sm text-gray-600">
                        تلفن: {settings.company_phone}
                      </p>
                    )}
                    {settings?.company_email && (
                      <p className="text-sm text-gray-600">
                        ایمیل: {settings.company_email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-left">
                  <h1 className="text-2xl font-bold text-blue-700 mb-2">
                    فاکتور تعمیر
                  </h1>
                  <p className="text-lg font-mono font-medium">
                    {invoice.invoice_number}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    تاریخ: {formatDate(invoice.invoice_date)}
                  </p>
                </div>
              </div>
            </div>

            {/* Customer & Device Info */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3 pb-2 border-b border-gray-200">
                  اطلاعات مشتری
                </h3>
                <div className="space-y-1">
                  <p>
                    <span className="text-gray-600">نام:</span>{" "}
                    <span className="font-medium">
                      {invoice.customer_name || "—"}
                    </span>
                  </p>
                  <p>
                    <span className="text-gray-600">شماره تماس:</span>{" "}
                    {invoice.customer_phone || "—"}
                  </p>
                </div>
              </div>
              <div className="border border-gray-200 rounded-lg p-4">
                <h3 className="font-medium text-gray-700 mb-3 pb-2 border-b border-gray-200">
                  اطلاعات دستگاه
                </h3>
                <div className="space-y-1">
                  <p>
                    <span className="text-gray-600">شماره پذیرش:</span>{" "}
                    <span className="font-mono">{invoice.device_id}</span>
                  </p>
                  <p>
                    <span className="text-gray-600">دستگاه:</span>{" "}
                    <span className="font-medium">{invoice.device_name}</span>
                  </p>
                  <p>
                    <span className="text-gray-600">برند:</span>{" "}
                    {invoice.brand || "—"}
                  </p>
                  <p>
                    <span className="text-gray-600">مدل:</span>{" "}
                    {invoice.model || "—"}
                  </p>
                  <p>
                    <span className="text-gray-600">سریال:</span>{" "}
                    {invoice.serial_number || "—"}
                  </p>
                </div>
              </div>
            </div>

            {/* Items Table */}
            <div className="mb-6">
              <h3 className="font-medium text-gray-700 mb-3">اقلام فاکتور</h3>
              <table className="w-full border-collapse border border-gray-300">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-3 py-2 text-sm text-right">
                      #
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm text-right">
                      شرح
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm text-center">
                      تعداد
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm text-center">
                      واحد
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm text-left">
                      قیمت واحد
                    </th>
                    <th className="border border-gray-300 px-3 py-2 text-sm text-left">
                      جمع
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items?.map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm">
                        {item.name}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                        {item.quantity}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-center">
                        {item.unit}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-left">
                        {formatPersianCurrency(item.unit_price)}
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-left font-medium">
                        {formatPersianCurrency(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      colSpan={5}
                      className="border border-gray-300 px-3 py-2 text-sm text-left"
                    >
                      جمع کل:
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-left font-medium">
                      {formatPersianCurrency(invoice.subtotal)}
                    </td>
                  </tr>
                  {invoice.discount_amount > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="border border-gray-300 px-3 py-2 text-sm text-left"
                      >
                        تخفیف:
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-left text-red-600">
                        ({formatPersianCurrency(invoice.discount_amount)})
                      </td>
                    </tr>
                  )}
                  {invoice.tax_amount > 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="border border-gray-300 px-3 py-2 text-sm text-left"
                      >
                        مالیات (%{invoice.tax_rate}):
                      </td>
                      <td className="border border-gray-300 px-3 py-2 text-sm text-left">
                        {formatPersianCurrency(invoice.tax_amount)}
                      </td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td
                      colSpan={5}
                      className="border border-gray-300 px-3 py-2 text-sm text-left"
                    >
                      مبلغ قابل پرداخت:
                    </td>
                    <td className="border border-gray-300 px-3 py-2 text-sm text-left text-blue-700">
                      {formatPersianCurrency(invoice.total_amount)} ریال
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Warranty & Notes */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <h3 className="font-medium text-gray-700 mb-2"> گارانتی</h3>
                <p className="text-sm">
                  {invoice.warranty_months > 0
                    ? `${invoice.warranty_months} ماه (تا تاریخ ${formatDate(invoice.warranty_until)})`
                    : "بدون گارانتی"}
                </p>
                {invoice.technician_name && (
                  <p className="text-sm text-gray-600 mt-1">
                    تعمیرکار: {invoice.technician_name}
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-medium text-gray-700 mb-2"> توضیحات</h3>
                <p className="text-sm">{invoice.notes || "—"}</p>
              </div>
            </div>

            {/* Footer with Stamp & Signature */}
            <div className="border-t-2 border-gray-300 pt-6 mt-6">
              <div className="flex items-end justify-between">
                <div className="text-center space-y-2">
                  {settings?.signature_image && (
                    <img
                      src={baseUrl + settings.signature_image}
                      alt="Signature"
                      className="h-16 w-auto object-contain mx-auto"
                    />
                  )}
                  <p className="text-sm text-gray-600">امضا </p>
                </div>
                <div className="text-center space-y-2">
                  {settings?.stamp_image && (
                    <img
                      src={baseUrl + settings.stamp_image}
                      alt="Stamp"
                      className="h-20 w-auto object-contain mx-auto"
                    />
                  )}
                  <p className="text-sm text-gray-600">مهر شرکت</p>
                </div>
              </div>

              {settings?.invoice_footer_text && (
                <div className="mt-6 text-center">
                  <p className="text-sm text-gray-500 italic">
                    {settings.invoice_footer_text}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
