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

  const handlePrint = useReactToPrint({
    contentRef: printRef,
    documentTitle: invoice?.invoice_number || "فاکتور فروش",
    onAfterPrint: () => console.log("Print completed"),
  });

  const handleDownloadPDF = () => {
    handlePrint();
  };

  if (!isOpen || !invoice) return null;

  const baseUrl = getBaseUrl();
  const showLogo = settings?.sale_invoice_show_logo === 1;
  const showCompanyInfo = settings?.sale_invoice_show_company_info === 1;
  const showEmail = settings?.sale_invoice_show_email === 1;
  const showWebsite = settings?.sale_invoice_show_website === 1;
  const showDeviceInfo = settings?.sale_invoice_show_device_info === 1;
  const showCustomerPhone = settings?.sale_invoice_show_customer_phone === 1;
  const showDiscount = settings?.sale_invoice_show_discount === 1;
  const showTax = settings?.sale_invoice_show_tax === 1;
  const showStamp = settings?.sale_invoice_show_stamp === 1;
  const showSignature = settings?.sale_invoice_show_signature === 1;
  const showWarranty = settings?.sale_invoice_show_warranty === 1;
  const showTechnician = settings?.sale_invoice_show_technician === 1;

  const paperSize = settings?.sale_invoice_paper_size || "A5";

  const paperSizeClasses = {
    A4: "max-w-[210mm] p-6",
    A5: "max-w-[148mm] py-4 p-2",
    Thermal: "max-w-[80mm]",
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-white rounded-lg w-full max-h-[90vh] overflow-hidden flex flex-col"
        dir="rtl"
        style={{
          maxWidth:
            paperSize === "A4"
              ? "210mm"
              : paperSize === "A5"
                ? "148mm"
                : "80mm",
        }}
      >
        {/* Header - no-print */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 no-print">
          <h3 className="text-lg font-bold">
            پیش‌نمایش فاکتور فروش ({paperSize})
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

        {/* Invoice Content - Printable */}
        <div className="flex-1 overflow-y-auto p-6">
          <div
            ref={printRef}
            className={`bg-white mx-auto  ${paperSizeClasses[paperSize]}`}
            style={{
              fontSize: paperSize === "Thermal" ? "11px" : "14px",
            }}
          >
            {/* Custom Header Text */}
            {settings?.sale_invoice_header_text && (
              <div className="text-center mb-3 text-gray-600 text-sm border-b border-gray-200 pb-2">
                {settings.sale_invoice_header_text}
              </div>
            )}

            {/* Company Header */}
            <div className="border-b-2 border-gray-300 pb-4 mb-4">
              <div className="flex items-start justify-between flex-col">
                <h1
                  className={`font-bold text-blue-700 mb-3 text-center w-full ${paperSize === "Thermal" ? "text-base" : "text-xl"}`}
                >
                  فاکتور فروش
                </h1>
                <div className="flex items-start justify-between w-full">
                  <div className="flex items-start gap-3">
                    {showLogo && settings?.company_logo && (
                      <img
                        src={baseUrl + settings.company_logo}
                        alt="Logo"
                        className={`object-contain rounded-sm ${paperSize === "Thermal" ? "h-10" : "h-14"}`}
                      />
                    )}
                    {showCompanyInfo && (
                      <div>
                        <h2
                          className={`font-bold text-gray-900 ${paperSize === "Thermal" ? "text-base" : "text-lg"}`}
                        >
                          {settings?.company_name || "تعمیرگاه"}
                        </h2>
                        {settings?.company_address && (
                          <p className="text-gray-600 mt-1 text-xs">
                            {settings.company_address}
                          </p>
                        )}
                        {settings?.company_phone && (
                          <p className="text-gray-600 text-xs">
                            تلفن: {settings.company_phone}
                          </p>
                        )}
                        {showEmail && settings?.company_email && (
                          <p className="text-gray-600 text-xs">
                            ایمیل: {settings.company_email}
                          </p>
                        )}
                        {showWebsite && settings?.company_website && (
                          <p className="text-gray-600 text-xs">
                            وب‌سایت: {settings.company_website}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="text-left">
                    <p className="font-mono font-medium text-sm">
                      {invoice.invoice_number}
                    </p>
                    <p className="text-gray-600 text-xs mt-1">
                      تاریخ: {formatDate(invoice.invoice_date)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer & Device Info */}
            <div
              className={`grid ${showDeviceInfo ? "grid-cols-2" : "grid-cols-1"} gap-4 mb-4`}
            >
              <div className="border border-gray-200 rounded-lg p-3">
                <h3 className="font-medium text-gray-700 mb-2 pb-1 border-b border-gray-200 text-sm">
                  اطلاعات مشتری
                </h3>
                <div className="space-y-1 text-xs">
                  <p>
                    <span className="text-gray-600">نام:</span>{" "}
                    <span className="font-medium">
                      {invoice.customer_name || "—"}
                    </span>
                  </p>
                  {showCustomerPhone && (
                    <p>
                      <span className="text-gray-600">شماره تماس:</span>{" "}
                      {invoice.customer_phone || "—"}
                    </p>
                  )}
                </div>
              </div>

              {showDeviceInfo && invoice.device_name && (
                <div className="border border-gray-200 rounded-lg p-3">
                  <h3 className="font-medium text-gray-700 mb-2 pb-1 border-b border-gray-200 text-sm">
                    اطلاعات دستگاه
                  </h3>
                  <div className="space-y-1 text-xs">
                    <p>
                      <span className="text-gray-600">دستگاه:</span>{" "}
                      <span className="font-medium">{invoice.device_name}</span>
                    </p>
                    {invoice.brand && (
                      <p>
                        <span className="text-gray-600">برند:</span>{" "}
                        {invoice.brand}
                      </p>
                    )}
                    {invoice.model && (
                      <p>
                        <span className="text-gray-600">مدل:</span>{" "}
                        {invoice.model}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Items Table */}
            <div className="mb-4">
              <h3 className="font-medium text-gray-700 mb-2 text-sm">
                اقلام فاکتور
              </h3>
              <table className="w-full border-collapse border border-gray-300 text-xs">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="border border-gray-300 px-2 py-1 text-right">
                      #
                    </th>
                    <th className="border border-gray-300 px-2 py-1 text-right">
                      شرح
                    </th>
                    <th className="border border-gray-300 px-2 py-1 text-center">
                      تعداد
                    </th>
                    <th className="border border-gray-300 px-2 py-1 text-center">
                      واحد
                    </th>
                    <th className="border border-gray-300 px-2 py-1 text-left">
                      قیمت واحد
                    </th>
                    {showDiscount && (
                      <th className="border border-gray-300 px-2 py-1 text-left">
                        تخفیف
                      </th>
                    )}
                    <th className="border border-gray-300 px-2 py-1 text-left">
                      جمع
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items?.map((item, index) => (
                    <tr key={item.id}>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        {index + 1}
                      </td>
                      <td className="border border-gray-300 px-2 py-1">
                        {item.item_name || item.name}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        {item.quantity}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-center">
                        {item.unit || item.item_unit || "—"}
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-left">
                        {formatPersianCurrency(item.unit_price)}
                      </td>
                      {showDiscount && (
                        <td className="border border-gray-300 px-2 py-1 text-left text-red-600">
                          {item.discount_amount > 0
                            ? `(${formatPersianCurrency(item.discount_amount)})`
                            : "—"}
                        </td>
                      )}
                      <td className="border border-gray-300 px-2 py-1 text-left font-medium">
                        {formatPersianCurrency(item.total_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td
                      colSpan={showDiscount ? 6 : 5}
                      className="border border-gray-300 px-2 py-1 text-left"
                    >
                      جمع کل:
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-left font-medium">
                      {formatPersianCurrency(
                        invoice.subtotal || invoice.total_amount,
                      )}
                    </td>
                  </tr>
                  {showDiscount && invoice.discount_amount > 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="border border-gray-300 px-2 py-1 text-left"
                      >
                        تخفیف:
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-left text-red-600">
                        ({formatPersianCurrency(invoice.discount_amount)})
                      </td>
                    </tr>
                  )}
                  {showTax && invoice.tax_amount > 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="border border-gray-300 px-2 py-1 text-left"
                      >
                        مالیات (%{invoice.tax_rate || 0}):
                      </td>
                      <td className="border border-gray-300 px-2 py-1 text-left">
                        {formatPersianCurrency(invoice.tax_amount)}
                      </td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td
                      colSpan={showDiscount ? 6 : 5}
                      className="border border-gray-300 px-2 py-1 text-left"
                    >
                      مبلغ قابل پرداخت:
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-left text-blue-700">
                      {formatPersianCurrency(invoice.total_amount)} ریال
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Warranty & Technician */}
            {(showWarranty || showTechnician) && (
              <div className="grid grid-cols-2 gap-4 mb-4 text-xs">
                {showWarranty && invoice.warranty_months > 0 && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">گارانتی</h3>
                    <p>{invoice.warranty_months} ماه</p>
                  </div>
                )}
                {showTechnician && invoice.technician_name && (
                  <div>
                    <h3 className="font-medium text-gray-700 mb-1">تعمیرکار</h3>
                    <p>{invoice.technician_name}</p>
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            {invoice.notes && (
              <div className="mb-4 text-xs">
                <h3 className="font-medium text-gray-700 mb-1"> توضیحات</h3>
                <p className="text-gray-600">{invoice.notes}</p>
              </div>
            )}

            {/* Footer with Stamp & Signature */}
            {(showStamp || showSignature) && (
              <div className="border-t-2 border-gray-300 pt-4 mt-4">
                <div className="flex items-end justify-between">
                  {showSignature && settings?.signature_image && (
                    <div className="text-center">
                      <img
                        src={baseUrl + settings.signature_image}
                        alt="Signature"
                        className={`object-contain mx-auto ${paperSize === "Thermal" ? "h-8" : "h-12"}`}
                      />
                      <p className="text-xs text-gray-600 mt-1">امضا</p>
                    </div>
                  )}
                  {showStamp && settings?.stamp_image && (
                    <div className="text-center">
                      <img
                        src={baseUrl + settings.stamp_image}
                        alt="Stamp"
                        className={`object-contain mx-auto ${paperSize === "Thermal" ? "h-10" : "h-14"}`}
                      />
                      <p className="text-xs text-gray-600 mt-1">مهر</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Custom Footer Text */}
            {settings?.sale_invoice_footer_text && (
              <div className="mt-4 text-center">
                <p className="text-gray-500 italic text-xs">
                  {settings.sale_invoice_footer_text}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
