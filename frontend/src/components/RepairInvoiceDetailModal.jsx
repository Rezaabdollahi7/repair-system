// src/components/RepairInvoiceDetailModal.jsx
import { useState, useEffect } from "react";
import {
  getRepairInvoice,
  deleteRepairInvoice,
  changeRepairInvoiceStatus,
  addRepairInvoicePayment,
} from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "./ConfirmModal";
import InvoicePreview from "./InvoicePreview";
import {
  XMarkIcon,
  TrashIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  XCircleIcon,
  PrinterIcon,
  CurrencyDollarIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "./LoadingSpinner";

function StatusBadge({ status }) {
  const map = {
    draft: {
      label: "پیش‌نویس",
      color: "bg-gray-100 text-gray-800",
      icon: DocumentTextIcon,
    },
    issued: {
      label: "صادر شده",
      color: "bg-blue-100 text-blue-800",
      icon: CheckCircleIcon,
    },
    paid: {
      label: "پرداخت شده",
      color: "bg-green-100 text-green-800",
      icon: CheckCircleIcon,
    },
    cancelled: {
      label: "ابطال شده",
      color: "bg-red-100 text-red-800",
      icon: XCircleIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-gray-100", icon: null };
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

function InfoRow({ label, value, highlight = false }) {
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

export default function RepairInvoiceDetailModal({
  invoiceId,
  isOpen,
  onClose,
}) {
  const { isAtLeast } = useAuth();
  const { openItemDetail, openDeviceDetail, openRepairInvoiceEdit } =
    useModal();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(null);

  useEffect(() => {
    if (isOpen && invoiceId) fetchInvoice();
  }, [isOpen, invoiceId]);

  const fetchInvoice = async () => {
    setLoading(true);
    try {
      const res = await getRepairInvoice(invoiceId);
      setInvoice(res.data);
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
      await deleteRepairInvoice(invoiceId);
      toast.success("فاکتور با موفقیت حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در حذف فاکتور");
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!showStatusConfirm) return;
    const newStatus = showStatusConfirm;
    setShowStatusConfirm(null);
    try {
      await changeRepairInvoiceStatus(invoiceId, newStatus);
      toast.success(`وضعیت فاکتور تغییر کرد`);
      fetchInvoice();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در تغییر وضعیت");
    }
  };

  const handleAddPayment = async (e) => {
    e.preventDefault();
    const amount = parseFloat(paymentAmount);
    if (!amount || amount <= 0)
      return toast.error("مبلغ باید بیشتر از صفر باشد");
    if (amount > invoice.total_amount - invoice.paid_amount)
      return toast.error("مبلغ بیشتر از مانده است");
    setSubmitting(true);
    try {
      await addRepairInvoicePayment(invoiceId, {
        amount,
        payment_method: paymentMethod,
        note: paymentNote || null,
      });
      toast.success("پرداخت با موفقیت ثبت شد");
      setShowPaymentModal(false);
      setPaymentAmount("");
      setPaymentNote("");
      fetchInvoice();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت پرداخت");
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (val) => Number(val).toLocaleString();
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
            <WrenchScrewdriverIcon className="w-5 h-5 text-gray-600" />
            فاکتور تعمیر
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
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
            </div>
          ) : invoice ? (
            <>
              {/* Sub-header */}
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-mono text-gray-700">
                    {invoice.invoice_number}
                  </span>
                  <StatusBadge status={invoice.status} />
                  <PaymentStatusBadge status={invoice.payment_status} />
                </div>
                <div className="flex gap-2">
                  {invoice.status === "draft" && (
                    <button
                      onClick={() => {
                        onClose();
                        openRepairInvoiceEdit(invoiceId);
                      }}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                      ویرایش
                    </button>
                  )}
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
                {/* Left Column */}
                <div className="lg:col-span-1 space-y-6">
                  {/* Device & Customer Info */}
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      اطلاعات دستگاه و مشتری
                    </h3>
                    <div className="space-y-3">
                      <InfoRow
                        label="شماره پذیرش"
                        value={
                          <button
                            onClick={() => {
                              onClose();
                              openDeviceDetail(invoice.device_id);
                            }}
                            className="text-blue-600 hover:underline"
                          >
                            {invoice.device_id}
                          </button>
                        }
                      />
                      <InfoRow
                        label="دستگاه"
                        value={`${invoice.device_name} ${invoice.brand ? `(${invoice.brand})` : ""}`}
                      />
                      <InfoRow label="مدل" value={invoice.model || "—"} />
                      <InfoRow
                        label="سریال"
                        value={invoice.serial_number || "—"}
                      />
                      <div className="my-3 border-t border-gray-200" />
                      <InfoRow
                        label="مشتری"
                        value={invoice.customer_name || "—"}
                        highlight
                      />
                      <InfoRow
                        label="شماره تماس"
                        value={invoice.customer_phone || "—"}
                      />
                    </div>
                  </div>

                  {/* Status Actions */}
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      عملیات
                    </h3>
                    <div className="space-y-2">
                      {invoice.status === "draft" && (
                        <button
                          onClick={() => setShowStatusConfirm("issued")}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                          صدور فاکتور
                        </button>
                      )}
                      {invoice.status !== "cancelled" &&
                        invoice.status !== "paid" && (
                          <button
                            onClick={() => setShowStatusConfirm("cancelled")}
                            className="w-full px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 flex items-center justify-center gap-2"
                          >
                            <XCircleIcon className="w-4 h-4" />
                            ابطال فاکتور
                          </button>
                        )}
                    </div>
                  </div>
                </div>

                {/* Right Column */}
                <div className="lg:col-span-2 space-y-6">
                  {/* Items Table */}
                  <div className="">
                    <div className="grid grid-cols-2 gap-4">
                      {/* Invoice Details */}
                      <div className="bg-white shadow rounded-lg p-6 col-span-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                          جزئیات فاکتور
                        </h3>
                        <div className="space-y-3">
                          <InfoRow
                            label="تاریخ"
                            value={formatDate(invoice.invoice_date)}
                          />
                          <InfoRow
                            label="تعمیرکار"
                            value={invoice.technician_name || "—"}
                          />
                          <InfoRow
                            label="گارانتی"
                            value={
                              invoice.warranty_months > 0
                                ? `${invoice.warranty_months} ماه`
                                : "بدون گارانتی"
                            }
                          />
                          <InfoRow
                            label="توضیحات"
                            value={invoice.notes || "—"}
                          />
                        </div>
                      </div>

                      {/* Payment Summary */}
                      <div className="bg-white shadow rounded-lg p-6 col-span-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-4">
                          پرداخت
                        </h3>
                        <div className="bg-gray-50 p-4 rounded-lg mb-4">
                          <div className="flex justify-between mb-2">
                            <span>جمع کل:</span>
                            <span className="font-bold">
                              {formatCurrency(invoice.total_amount)} ریال
                            </span>
                          </div>
                          <div className="flex justify-between mb-2">
                            <span>پرداخت شده:</span>
                            <span className="text-green-600">
                              {formatCurrency(invoice.paid_amount)} ریال
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
                              {formatCurrency(
                                invoice.total_amount - invoice.paid_amount,
                              )}{" "}
                              ریال
                            </span>
                          </div>
                        </div>
                        {(invoice.status === "issued" ||
                          invoice.status === "paid") &&
                          invoice.total_amount - invoice.paid_amount > 0 && (
                            <button
                              onClick={() => setShowPaymentModal(true)}
                              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                            >
                              <CurrencyDollarIcon className="w-4 h-4" />
                              ثبت پرداخت
                            </button>
                          )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 mt-6 bg-white shadow rounded-lg p-6">
                      <h3 className="text-lg font-medium text-gray-900 ">
                        اقلام فاکتور
                      </h3>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                                #
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                                نوع
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
                                تخفیف
                              </th>
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                                جمع
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200">
                            {invoice.items?.map((item, index) => (
                              <tr key={item.id} className="hover:bg-gray-50">
                                <td className="px-4 py-3 text-sm text-gray-500">
                                  {index + 1}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  <span
                                    className={`text-xs px-2 py-1 rounded-full ${item.item_type === "inventory" ? "bg-green-100 text-green-700" : item.item_type === "service" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}
                                  >
                                    {item.item_type === "inventory"
                                      ? "انبار"
                                      : item.item_type === "service"
                                        ? "خدمت"
                                        : "دلخواه"}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {item.item_type === "inventory" ? (
                                    <button
                                      onClick={() => {
                                        onClose();
                                        openItemDetail(item.item_id);
                                      }}
                                      className="text-blue-600 hover:underline"
                                    >
                                      {item.name}
                                    </button>
                                  ) : (
                                    item.name
                                  )}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {item.quantity}
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600">
                                  {item.unit}
                                </td>
                                <td className="px-4 py-3 text-sm">
                                  {formatCurrency(item.unit_price)}
                                </td>
                                <td className="px-4 py-3 text-sm text-red-600">
                                  {item.discount_amount > 0
                                    ? `-${formatCurrency(item.discount_amount)}`
                                    : "—"}
                                </td>
                                <td className="px-4 py-3 text-sm font-medium">
                                  {formatCurrency(item.total_price)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-3 text-left text-sm"
                              >
                                جمع کل:
                              </td>
                              <td className="px-4 py-3 text-sm font-medium">
                                {formatCurrency(invoice.subtotal)} ریال
                              </td>
                            </tr>
                            {invoice.discount_amount > 0 && (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-3 text-left text-sm"
                                >
                                  تخفیف:
                                </td>
                                <td className="px-4 py-3 text-sm text-red-600">
                                  -{formatCurrency(invoice.discount_amount)}{" "}
                                  ریال
                                </td>
                              </tr>
                            )}
                            {invoice.tax_amount > 0 && (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-3 text-left text-sm"
                                >
                                  مالیات ({invoice.tax_rate}%):
                                </td>
                                <td className="px-4 py-3 text-sm text-blue-600">
                                  +{formatCurrency(invoice.tax_amount)} ریال
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-3 text-left text-sm font-medium"
                              >
                                مبلغ نهایی:
                              </td>
                              <td className="px-4 py-3 text-sm font-bold text-blue-600">
                                {formatCurrency(invoice.total_amount)} ریال
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Payments History */}
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-medium text-gray-900 mb-4">
                      تاریخچه پرداخت‌ها
                    </h3>
                    {invoice.payments?.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <CurrencyDollarIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>هنوز پرداختی ثبت نشده</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {invoice.payments?.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                                <CurrencyDollarIcon className="w-5 h-5 text-green-600" />
                              </div>
                              <div>
                                <p className="font-medium">
                                  {formatCurrency(payment.amount)} ریال
                                </p>
                                <p className="text-xs text-gray-500">
                                  {payment.payment_method === "cash"
                                    ? "نقدی"
                                    : payment.payment_method === "card"
                                      ? "کارت"
                                      : payment.payment_method}
                                </p>
                                {payment.note && (
                                  <p className="text-xs text-gray-500 mt-1">
                                    {payment.note}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="text-sm">
                                {formatDate(payment.payment_date)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg p-6 w-full max-w-md" dir="rtl">
            <h3 className="text-lg font-bold mb-4">ثبت پرداخت</h3>
            <form onSubmit={handleAddPayment}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    مبلغ (ریال)
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min="1"
                    max={invoice.total_amount - invoice.paid_amount}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    روش پرداخت
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 bg-white"
                  >
                    <option value="cash">نقدی</option>
                    <option value="card">کارت بانکی</option>
                    <option value="transfer">انتقال وجه</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    توضیحات
                  </label>
                  <textarea
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    rows="2"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 px-4 py-2 border rounded-lg"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg"
                >
                  {submitting ? "..." : "ثبت پرداخت"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Status Change Confirm */}
      <ConfirmModal
        isOpen={!!showStatusConfirm}
        onClose={() => setShowStatusConfirm(null)}
        onConfirm={handleStatusChange}
        title={showStatusConfirm === "issued" ? "صدور فاکتور" : "ابطال فاکتور"}
        message={
          showStatusConfirm === "issued"
            ? "موجودی کالاها کاهش می‌یابد. مطمئنید؟"
            : "موجودی کالاها برمی‌گردد. مطمئنید؟"
        }
        confirmText={showStatusConfirm === "issued" ? "صادر کن" : "ابطال کن"}
        variant={showStatusConfirm === "issued" ? "info" : "danger"}
      />

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="حذف فاکتور"
        message={`"${invoice?.invoice_number}" حذف شود؟`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />

      {/* Print Preview */}
      {showPreview && (
        <InvoicePreview
          invoice={invoice}
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
