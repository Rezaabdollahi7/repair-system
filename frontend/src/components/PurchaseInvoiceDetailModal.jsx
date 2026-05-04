// src/components/PurchaseInvoiceDetailModal.jsx
import { useState, useEffect } from "react";
import {
  getPurchaseInvoice,
  deletePurchaseInvoice,
  updatePurchaseInvoicePayment,
} from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "./ConfirmModal";
import {
  XMarkIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  ShoppingCartIcon,
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

export default function PurchaseInvoiceDetailModal({
  invoiceId,
  isOpen,
  onClose,
}) {
  const { isAtLeast } = useAuth();
  const { openItemDetail } = useModal();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [updatingPayment, setUpdatingPayment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && invoiceId) fetchInvoice();
  }, [isOpen, invoiceId]);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const res = await getPurchaseInvoice(invoiceId);
      setInvoice(res.data);
      setPaymentAmount(res.data.paid_amount || 0);
    } catch {
      toast.error("خطا در دریافت اطلاعات فاکتور");
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deletePurchaseInvoice(invoiceId);
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
      return toast.error("مبلغ پرداختی نامعتبر است");
    setUpdatingPayment(true);
    try {
      await updatePurchaseInvoicePayment(invoiceId, { paid_amount: newAmount });
      toast.success("وضعیت پرداخت بروز شد");
      fetchInvoice();
    } catch {
      toast.error("خطا در بروزرسانی پرداخت");
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
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <ShoppingCartIcon className="w-5 h-5 text-gray-600" />
            فاکتور خرید
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-10 text-gray-500">
              در حال بارگذاری...
            </div>
          ) : invoice ? (
            <>
              {/* Sub-header */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-mono text-gray-700">
                    {invoice.invoice_number}
                  </span>
                  <PaymentStatusBadge status={invoice.payment_status} />
                </div>
                <div className="flex gap-2">
                  {isAtLeast("admin") && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2"
                    >
                      <TrashIcon className="w-4 h-4" />
                      حذف فاکتور
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left - Info */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      اطلاعات فاکتور
                    </h3>
                    <div className="space-y-3">
                      <InfoRow
                        label="شماره فاکتور"
                        value={invoice.invoice_number}
                        highlight
                      />
                      <InfoRow
                        label="فروشنده"
                        value={invoice.supplier_name || "—"}
                      />
                      <InfoRow
                        label="تاریخ"
                        value={formatDate(invoice.invoice_date)}
                      />
                      <InfoRow
                        label="تاریخ ثبت"
                        value={formatDate(invoice.created_at)}
                      />
                      {invoice.note && (
                        <InfoRow label="توضیحات" value={invoice.note} />
                      )}
                    </div>
                  </div>

                  {/* Payment Box */}
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      وضعیت پرداخت
                    </h3>
                    <div className="space-y-4">
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="flex justify-between mb-2">
                          <span className="text-gray-600">جمع کل:</span>
                          <span className="font-bold">
                            {formatPersianCurrency(invoice.total_amount)} ریال
                          </span>
                        </div>
                        <div className="flex justify-between mb-2">
                          <span className="text-gray-600">پرداخت شده:</span>
                          <span className="text-green-600">
                            {formatPersianCurrency(invoice.paid_amount)} ریال
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t border-gray-200">
                          <span className="text-gray-600">مانده:</span>
                          <span
                            className={`font-bold ${invoice.total_amount - invoice.paid_amount > 0 ? "text-red-600" : "text-green-600"}`}
                          >
                            {formatPersianCurrency(
                              invoice.total_amount - invoice.paid_amount,
                            )}{" "}
                            ریال
                          </span>
                        </div>
                      </div>

                      {invoice.payment_status !== "paid" && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">
                            بروزرسانی پرداخت
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              min="0"
                              max={invoice.total_amount}
                              value={paymentAmount}
                              onChange={(e) => setPaymentAmount(e.target.value)}
                              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                            />
                            <button
                              onClick={handlePaymentUpdate}
                              disabled={updatingPayment}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                              {updatingPayment ? "..." : "ذخیره"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right - Items */}
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
                            نام کالا
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

      {/* Delete Confirm Modal */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="حذف فاکتور خرید"
        message={`آیا از حذف فاکتور "${invoice?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
