import { useState, useEffect } from "react";
import {
  getSaleInvoice,
  deleteSaleInvoice,
  updateSaleInvoicePayment,
} from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "./ConfirmModal";
import SaleInvoicePreview from "./SaleInvoicePreview";
import {
  XMarkIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  PrinterIcon,
  CurrencyDollarIcon,
  DevicePhoneMobileIcon,
  UserIcon,
  PhoneIcon,
  CalendarIcon,
} from "@heroicons/react/24/solid";
import { formatPersianCurrency } from "../utils/formatters";

function PaymentStatusBadge({ status }) {
  const map = {
    paid: {
      label: "پرداخت شده",
      color: "bg-green-100 text-green-800",
      icon: CheckCircleIcon,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-yellow-100 text-yellow-800",
      icon: ExclamationCircleIcon,
    },
    pending: {
      label: "در انتظار",
      color: "bg-orange-100 text-orange-800",
      icon: ClockIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-gray-100" };
  const Icon = s.icon;
  return (
    <span
      className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-1 w-fit ${s.color}`}
    >
      {Icon && <Icon className="w-4 h-4" />}
      {s.label}
    </span>
  );
}

function InfoRow({ label, value, highlight }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span
        className={`text-sm ${highlight ? "font-medium text-gray-900" : "text-gray-700"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

export default function SaleInvoiceDetailModal({ invoiceId, isOpen, onClose }) {
  const { isAtLeast } = useAuth();
  const { openItemDetail } = useModal();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && invoiceId) fetchInvoice();
  }, [isOpen, invoiceId]);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const res = await getSaleInvoice(invoiceId);
      setInvoice(res.data);
      setPaymentAmount(res.data.paid_amount || 0);
    } catch {
      toast.error("خطا در دریافت اطلاعات");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteSaleInvoice(invoiceId);
      toast.success("فاکتور حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch {
      toast.error("خطا در حذف فاکتور");
    } finally {
      setDeleting(false);
    }
  };

  const handlePaymentUpdate = async () => {
    const newAmount = parseInt(paymentAmount);
    if (isNaN(newAmount) || newAmount < 0 || newAmount > invoice.total_amount)
      return toast.error("مبلغ نامعتبر");
    setUpdatingPayment(true);
    try {
      await updateSaleInvoicePayment(invoiceId, { paid_amount: newAmount });
      toast.success("پرداخت بروز شد");
      fetchInvoice();
    } catch {
      toast.error("خطا در بروزرسانی");
    } finally {
      setUpdatingPayment(false);
    }
  };

  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString("fa-IR") : "—";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* هدر */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
            <CurrencyDollarIcon className="w-5 h-5 text-gray-600" />
            جزئیات فاکتور فروش
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-3 sm:p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="text-center py-10">در حال بارگذاری...</div>
            </div>
          ) : invoice ? (
            <>
              {/* هدر اطلاعات فاکتور */}
              <div className="bg-gradient-to-r from-blue-50 to-white rounded-2xl shadow-sm border border-blue-100 p-4 sm:p-6 mb-4 sm:mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-lg font-mono font-bold text-gray-700">
                      {invoice.invoice_number}
                    </span>
                    <PaymentStatusBadge status={invoice.payment_status} />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowPreview(true)}
                      className="px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
                    >
                      <PrinterIcon className="w-4 h-4" />
                      چاپ
                    </button>
                    {isAtLeast("admin") && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-3 py-1.5 sm:px-4 sm:py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 text-sm"
                      >
                        <TrashIcon className="w-4 h-4" />
                        حذف
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ===== اطلاعات فاکتور (افقی) ===== */}
              <div className="bg-white shadow rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
                <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                  <UserIcon className="w-5 h-5 text-gray-600" />
                  اطلاعات فاکتور
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      شماره فاکتور
                    </label>
                    <p className="text-sm font-medium text-gray-900 font-mono">
                      {invoice.invoice_number}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      مشتری
                    </label>
                    <p className="text-sm text-gray-900">
                      {invoice.customer_name || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      شماره تماس
                    </label>
                    <p className="text-sm text-gray-900">
                      {invoice.customer_phone || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      تاریخ
                    </label>
                    <p className="text-sm text-gray-900">
                      {formatDate(invoice.invoice_date)}
                    </p>
                  </div>
                </div>

                {invoice.note && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      توضیحات
                    </label>
                    <p className="text-sm text-gray-700 bg-gray-50 p-2 rounded-lg">
                      {invoice.note}
                    </p>
                  </div>
                )}

                {/* اطلاعات دستگاه */}
                {invoice.device_id && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                      <DevicePhoneMobileIcon className="w-4 h-4 text-blue-600" />
                      اطلاعات دستگاه
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">
                          نام دستگاه
                        </label>
                        <p className="text-sm text-gray-900">
                          {invoice.device_name || "—"}
                        </p>
                      </div>
                      {invoice.brand && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            برند
                          </label>
                          <p className="text-sm text-gray-900">
                            {invoice.brand}
                          </p>
                        </div>
                      )}
                      {invoice.model && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            مدل
                          </label>
                          <p className="text-sm text-gray-900">
                            {invoice.model}
                          </p>
                        </div>
                      )}
                      {invoice.serial_number && (
                        <div>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            سریال
                          </label>
                          <p className="text-sm text-gray-900 font-mono">
                            {invoice.serial_number}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ===== گرید اصلی: اقلام فاکتور (9/12) + خلاصه پرداخت (3/12) ===== */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
                {/* ستون چپ - اقلام فاکتور (9/12) */}
                <div className="lg:col-span-9">
                  <div className="bg-white shadow rounded-lg p-3 sm:p-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                      <CurrencyDollarIcon className="w-5 h-5 text-gray-600" />
                      اقلام فاکتور
                    </h3>

                    {invoice.items?.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 border-2 border-dashed rounded-lg">
                        <p>هیچ آیتمی در این فاکتور وجود ندارد</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">
                                کد
                              </th>
                              <th className="border border-gray-200 px-3 py-2 text-right text-xs font-medium text-gray-500">
                                نام
                              </th>
                              <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500">
                                تعداد
                              </th>
                              <th className="border border-gray-200 px-3 py-2 text-center text-xs font-medium text-gray-500">
                                واحد
                              </th>
                              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500">
                                قیمت واحد
                              </th>
                              <th className="border border-gray-200 px-3 py-2 text-left text-xs font-medium text-gray-500">
                                جمع
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {invoice.items?.map((item) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="border border-gray-200 px-3 py-2 text-sm font-mono text-center">
                                  {item.item_code || "—"}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm">
                                  {item.item_id ? (
                                    <button
                                      onClick={() => {
                                        onClose();
                                        openItemDetail(item.item_id);
                                      }}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {item.item_name}
                                    </button>
                                  ) : (
                                    item.item_name || "—"
                                  )}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-center">
                                  {item.quantity}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-center text-gray-600">
                                  {item.item_unit || "—"}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm text-left">
                                  {formatPersianCurrency(item.unit_price)}
                                </td>
                                <td className="border border-gray-200 px-3 py-2 text-sm font-medium text-left">
                                  {formatPersianCurrency(item.total_price)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td
                                colSpan={5}
                                className="border border-gray-200 px-3 py-2 text-left font-medium"
                              >
                                جمع کل (ریال):
                              </td>
                              <td className="border border-gray-200 px-3 py-2 text-sm font-bold text-left">
                                {formatPersianCurrency(invoice.total_amount)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                {/* ستون راست - خلاصه پرداخت (3/12) */}
                <div className="lg:col-span-3">
                  <div className="bg-white shadow rounded-lg p-4 sm:p-6 sticky top-24">
                    <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-4">
                      خلاصه پرداخت
                    </h3>

                    <div className="space-y-3">
                      <div className="flex justify-between py-2 text-sm border-b border-gray-100">
                        <span className="text-gray-600">جمع کل (ریال):</span>
                        <span className="font-bold">
                          {formatPersianCurrency(invoice.total_amount)}
                        </span>
                      </div>

                      <div className="flex justify-between py-2 text-sm border-b border-gray-100">
                        <span className="text-green-600">
                          دریافت شده (ریال):
                        </span>
                        <span className="font-medium text-green-600">
                          {formatPersianCurrency(invoice.paid_amount)}
                        </span>
                      </div>

                      <div className="flex justify-between py-2 text-sm font-bold border-t border-gray-200">
                        <span>مانده (ریال):</span>
                        <span
                          className={
                            invoice.total_amount - invoice.paid_amount > 0
                              ? "text-red-600"
                              : "text-green-600"
                          }
                        >
                          {formatPersianCurrency(
                            invoice.total_amount - invoice.paid_amount,
                          )}
                        </span>
                      </div>
                    </div>

                    {invoice.payment_status !== "paid" && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          بروزرسانی پرداخت (ریال)
                        </label>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            min="0"
                            max={invoice.total_amount}
                            value={paymentAmount}
                            onChange={(e) => setPaymentAmount(e.target.value)}
                            className="flex-1 border rounded-lg px-3 py-2 text-sm"
                          />
                          <button
                            onClick={handlePaymentUpdate}
                            disabled={updatingPayment}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            {updatingPayment ? "..." : "ذخیره"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {showPreview && (
        <SaleInvoicePreview
          invoice={invoice}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
        />
      )}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="حذف فاکتور فروش"
        message={`آیا از حذف "${invoice?.invoice_number}" مطمئن هستید؟`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
