// src/components/SaleInvoiceDetailModal.jsx
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
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl my-8"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-gray-900">فاکتور فروش</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-10">در حال بارگذاری...</div>
          ) : invoice ? (
            <>
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-mono text-gray-700">
                    {invoice.invoice_number}
                  </span>
                  <PaymentStatusBadge status={invoice.payment_status} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowPreview(true)}
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2"
                  >
                    <PrinterIcon className="w-4 h-4" />
                    چاپ
                  </button>
                  {isAtLeast("admin") && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                    >
                      <TrashIcon className="w-4 h-4" />
                      حذف
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      اطلاعات فاکتور
                    </h3>
                    <InfoRow
                      label="شماره فاکتور"
                      value={invoice.invoice_number}
                      highlight
                    />
                    <InfoRow
                      label="مشتری"
                      value={invoice.customer_name || "—"}
                    />
                    <InfoRow
                      label="شماره تماس"
                      value={invoice.customer_phone || "—"}
                    />
                    <InfoRow
                      label="تاریخ"
                      value={formatDate(invoice.invoice_date)}
                    />
                    {invoice.note && (
                      <InfoRow label="توضیحات" value={invoice.note} />
                    )}

                    {/* ===== اطلاعات دستگاه - اضافه شد ===== */}
                    {invoice.device_id && (
                      <div className="mt-4 pt-4 border-t border-gray-200">
                        <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                          <DevicePhoneMobileIcon className="w-4 h-4 text-blue-600" />
                          اطلاعات دستگاه
                        </h4>
                        <InfoRow
                          label="نام دستگاه"
                          value={invoice.device_name || "—"}
                        />
                        {invoice.brand && (
                          <InfoRow label="برند" value={invoice.brand} />
                        )}
                        {invoice.model && (
                          <InfoRow label="مدل" value={invoice.model} />
                        )}
                        {invoice.serial_number && (
                          <InfoRow
                            label="سریال"
                            value={invoice.serial_number}
                          />
                        )}
                        {invoice.device_id && (
                          <InfoRow label="کد پذیرش" value={invoice.device_id} />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      پرداخت
                    </h3>
                    <div className="bg-gray-50 p-4 rounded-lg mb-4">
                      <div className="flex justify-between mb-2">
                        <span>جمع کل:</span>
                        <span className="font-bold">
                          {formatPersianCurrency(invoice.total_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between mb-2">
                        <span>دریافت شده:</span>
                        <span className="text-green-600">
                          {formatPersianCurrency(invoice.paid_amount)}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t">
                        <span>مانده:</span>
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
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {updatingPayment ? "..." : "ذخیره"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-2">
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      اقلام فاکتور
                    </h3>
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                            کد
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                            نام
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                            تعداد
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                            واحد
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                            قیمت واحد
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                            جمع
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {invoice.items?.map((item) => (
                          <tr key={item.id}>
                            <td className="px-4 py-3 text-sm font-mono">
                              {item.item_code}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              <button
                                onClick={() => {
                                  onClose();
                                  openItemDetail(item.item_id);
                                }}
                                className="text-blue-600 hover:underline"
                              >
                                {item.item_name}
                              </button>
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {item.quantity}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {item.item_unit}
                            </td>
                            <td className="px-4 py-3 text-sm">
                              {formatPersianCurrency(item.unit_price)}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium">
                              {formatPersianCurrency(item.total_price)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50">
                        <tr>
                          <td
                            colSpan={5}
                            className="px-4 py-3 text-left font-medium"
                          >
                            جمع کل:
                          </td>
                          <td className="px-4 py-3 text-sm font-bold">
                            {formatPersianCurrency(invoice.total_amount)} ریال
                          </td>
                        </tr>
                      </tfoot>
                    </table>
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
