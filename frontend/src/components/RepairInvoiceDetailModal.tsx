import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { errorText } from "../utils/errors";
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
  XCircleIcon,
  PrinterIcon,
  CurrencyDollarIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "./LoadingSpinner";
import {
  formatPersianCurrency,
  formatPersianPhone,
  toPersianDigits,
} from "../utils/formatters";
import type {
  Id,
  RepairInvoiceDetail,
  RepairInvoiceStatus,
} from "../types/api";
import { modalPanel } from "../motion";
import InfoRow from "./InfoRow";
import PaymentStatusBadge from "./PaymentStatusBadge";
import RepairInvoiceStatusBadge from "./RepairInvoiceStatusBadge";
import LineItemTypeChip from "./LineItemTypeChip";

interface RepairInvoiceDetailModalProps {
  invoiceId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  zIndex?: number;
}

export default function RepairInvoiceDetailModal({
  invoiceId,
  isOpen,
  onClose,
}: RepairInvoiceDetailModalProps) {
  const { isAtLeast } = useAuth();
  const { openItemDetail, openDeviceDetail, openRepairInvoiceEdit } =
    useModal();
  const [invoice, setInvoice] = useState<RepairInvoiceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNote, setPaymentNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] =
    useState<RepairInvoiceStatus | null>(null);

  useEffect(() => {
    if (isOpen && invoiceId) fetchInvoice();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, invoiceId]);

  const fetchInvoice = async () => {
    if (!invoiceId) return;
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
    if (!invoiceId) return;
    setDeleting(true);
    try {
      await deleteRepairInvoice(invoiceId);
      toast.success("فاکتور با موفقیت حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در حذف فاکتور"));
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async () => {
    if (!showStatusConfirm || !invoiceId) return;
    const newStatus = showStatusConfirm;
    setShowStatusConfirm(null);
    try {
      await changeRepairInvoiceStatus(invoiceId, newStatus);
      toast.success("وضعیت فاکتور تغییر کرد");
      void fetchInvoice();
    } catch (error) {
      toast.error(errorText(error, "خطا در تغییر وضعیت"));
    }
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invoiceId || !invoice) return;
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
      void fetchInvoice();
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت پرداخت"));
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date: string | null | undefined) =>
    date ? new Date(date).toLocaleDateString("fa-IR") : "—";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-6xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface rounded-t-card z-10">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <WrenchScrewdriverIcon className="w-5 h-5 text-text-secondary" />
            فاکتور تعمیر
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
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
                  <span className="text-lg font-mono text-text-primary">
                    {invoice.invoice_number}
                  </span>
                  <RepairInvoiceStatusBadge status={invoice.status} />
                  <PaymentStatusBadge status={invoice.payment_status} />
                </div>
                <div className="flex gap-2">
                  {invoice.status === "draft" && (
                    <button
                      onClick={() => {
                        onClose();
                        if (invoiceId) openRepairInvoiceEdit(invoiceId);
                      }}
                      className="px-4 py-2.5 rounded-field bg-success-fill text-on-status text-body-sm font-bold
                        hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                      ویرایش
                    </button>
                  )}
                  <button
                    onClick={() => setShowPreview(true)}
                    className="px-4 py-2 text-body-sm rounded-field border border-border bg-surface text-text-primary
                      font-bold hover:bg-surface-alt hover:border-border-strong
                      transition-colors cursor-pointer flex items-center gap-2"
                  >
                    <PrinterIcon className="w-4 h-4" />
                    چاپ
                  </button>
                  {isAtLeast("admin") && (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="px-4 py-2.5 rounded-field bg-danger-soft text-danger-fg text-body-sm font-bold
                        border border-danger/25 hover:bg-danger/15 transition-colors cursor-pointer
                        flex items-center gap-2"
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
                  <div className="bg-surface shadow rounded-field p-6">
                    <h3 className="text-lg font-medium text-text-primary mb-4">
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
                            className="text-primary hover:underline"
                          >
                            {toPersianDigits(invoice.device_id)}
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
                      <div className="my-3 border-t border-border" />
                      <InfoRow
                        label="مشتری"
                        value={invoice.customer_name || "—"}
                        highlight
                      />
                      <InfoRow
                        label="شماره تماس"
                        value={formatPersianPhone(invoice.customer_phone)}
                      />
                    </div>
                  </div>

                  {/* Status Actions */}
                  <div className="bg-surface shadow rounded-field p-6">
                    <h3 className="text-lg font-medium text-text-primary mb-4">
                      عملیات
                    </h3>
                    <div className="space-y-2">
                      {invoice.status === "draft" && (
                        <button
                          onClick={() => setShowStatusConfirm("issued")}
                          className="w-full px-4 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover flex items-center justify-center gap-2"
                        >
                          <CheckCircleIcon className="w-4 h-4" />
                          صدور فاکتور
                        </button>
                      )}
                      {invoice.status !== "cancelled" &&
                        invoice.status !== "paid" && (
                          <button
                            onClick={() => setShowStatusConfirm("cancelled")}
                            className="w-full px-4 py-2 bg-danger-soft text-danger-fg rounded-field
                                       hover:bg-danger-soft-hover transition-colors
                                       cursor-pointer flex items-center justify-center gap-2"
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
                      <div className="bg-surface shadow rounded-field p-6 col-span-1">
                        <h3 className="text-lg font-medium text-text-primary mb-4">
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
                                ? `${toPersianDigits(invoice.warranty_months)} ماه`
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
                      <div className="bg-surface shadow rounded-field p-6 col-span-1">
                        <h3 className="text-lg font-medium text-text-primary mb-4">
                          پرداخت
                        </h3>
                        <div className="bg-surface-alt p-4 rounded-field mb-4">
                          <div className="flex justify-between mb-2 text-text-primary">
                            <span>جمع کل:</span>
                            <span className="font-bold">
                              {formatPersianCurrency(invoice.total_amount)} ریال
                            </span>
                          </div>
                          <div className="flex justify-between mb-2 text-text-primary">
                            <span>پرداخت شده:</span>
                            <span className="text-success-fg">
                              {formatPersianCurrency(invoice.paid_amount)} ریال
                            </span>
                          </div>
                          <div className="flex justify-between pt-2 border-t border-border text-text-primary">
                            <span>مانده:</span>
                            <span
                              className={
                                invoice.total_amount - invoice.paid_amount > 0
                                  ? "text-danger-fg"
                                  : "text-success-fg"
                              }
                            >
                              {formatPersianCurrency(
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
                              className="w-full px-4 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover flex items-center justify-center gap-2"
                            >
                              <CurrencyDollarIcon className="w-4 h-4" />
                              ثبت پرداخت
                            </button>
                          )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 mt-6 bg-surface shadow rounded-field p-6">
                      <h3 className="text-lg font-medium text-text-primary">
                        اقلام فاکتور
                      </h3>

                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-border">
                          <thead className="bg-surface-alt">
                            <tr>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                #
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                نوع
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                نام
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                تعداد
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                واحد
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                قیمت واحد
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                تخفیف
                              </th>
                              <th className="px-4 py-3 text-right text-body-xs font-medium text-text-secondary">
                                جمع
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {invoice.items?.map((item, index) => (
                              <tr
                                key={item.id}
                                className="hover:bg-surface-alt"
                              >
                                <td className="px-4 py-3 text-body-sm text-text-secondary">
                                  {index + 1}
                                </td>
                                <td className="px-4 py-3 text-body-sm">
                                  <LineItemTypeChip type={item.item_type} />
                                </td>
                                <td className="px-4 py-3 text-body-sm">
                                  {item.item_type === "inventory" ? (
                                    <button
                                      onClick={() => {
                                        onClose();
                                        if (item.item_id)
                                          openItemDetail(item.item_id);
                                      }}
                                      className="text-primary hover:underline"
                                    >
                                      {item.name}
                                    </button>
                                  ) : (
                                    <span className="text-text-primary">
                                      {item.name}
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-body-sm text-text-primary">
                                  {toPersianDigits(item.quantity)}
                                </td>
                                <td className="px-4 py-3 text-body-sm text-text-secondary">
                                  {item.unit}
                                </td>
                                <td className="px-4 py-3 text-body-sm text-text-primary">
                                  {formatPersianCurrency(item.unit_price)}
                                </td>
                                <td className="px-4 py-3 text-body-sm text-danger-fg">
                                  {item.discount_amount > 0
                                    ? `-${formatPersianCurrency(item.discount_amount)}`
                                    : "—"}
                                </td>
                                <td className="px-4 py-3 text-body-sm font-medium text-text-primary">
                                  {formatPersianCurrency(item.total_price)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-surface-alt">
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-3 text-left text-body-sm text-text-primary"
                              >
                                جمع کل:
                              </td>
                              <td className="px-4 py-3 text-body-sm font-medium text-text-primary whitespace-nowrap tabular-nums">
                                {formatPersianCurrency(invoice.subtotal)} ریال
                              </td>
                            </tr>
                            {invoice.discount_amount > 0 && (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-3 text-left text-body-sm text-text-primary"
                                >
                                  تخفیف:
                                </td>
                                <td className="px-4 py-3 text-body-sm text-danger-fg whitespace-nowrap tabular-nums">
                                  −
                                  {formatPersianCurrency(
                                    invoice.discount_amount,
                                  )}{" "}
                                  ریال
                                </td>
                              </tr>
                            )}
                            {invoice.tax_amount > 0 && (
                              <tr>
                                <td
                                  colSpan={7}
                                  className="px-4 py-3 text-left text-body-sm text-text-primary"
                                >
                                  مالیات ({toPersianDigits(invoice.tax_rate)}٪):
                                </td>
                                <td className="px-4 py-3 text-body-sm text-primary whitespace-nowrap tabular-nums">
                                  +{formatPersianCurrency(invoice.tax_amount)}{" "}
                                  ریال
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td
                                colSpan={7}
                                className="px-4 py-3 text-left text-body-sm font-medium text-text-primary"
                              >
                                مبلغ نهایی:
                              </td>
                              <td className="px-4 py-3 text-body-sm font-bold text-primary whitespace-nowrap tabular-nums">
                                {formatPersianCurrency(invoice.total_amount)}{" "}
                                ریال
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  </div>

                  {/* Payments History */}
                  <div className="bg-surface shadow rounded-field p-6">
                    <h3 className="text-lg font-medium text-text-primary mb-4">
                      تاریخچه پرداخت‌ها
                    </h3>
                    {invoice.payments?.length === 0 ? (
                      <div className="text-center py-8 text-text-secondary">
                        <CurrencyDollarIcon className="w-12 h-12 mx-auto mb-3 text-text-secondary" />
                        <p>هنوز پرداختی ثبت نشده</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {invoice.payments?.map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between p-3 bg-surface-alt rounded-field"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-success-soft flex items-center justify-center">
                                <CurrencyDollarIcon className="w-5 h-5 text-success-fg" />
                              </div>
                              <div>
                                <p className="font-medium text-text-primary">
                                  {formatPersianCurrency(payment.amount)} ریال
                                </p>
                                <p className="text-body-xs text-text-secondary">
                                  {payment.payment_method === "cash"
                                    ? "نقدی"
                                    : payment.payment_method === "card"
                                      ? "کارت"
                                      : payment.payment_method}
                                </p>
                                {payment.note && (
                                  <p className="text-body-xs text-text-secondary mt-1">
                                    {payment.note}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-left">
                              <p className="text-body-sm text-text-primary">
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
      </motion.div>

      {/* Payment Modal */}
      {showPaymentModal && invoice && (
        <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-[60]">
          <div
            className="bg-surface border border-border rounded-panel shadow-xl p-6 w-full max-w-md"
            dir="rtl"
          >
            <h3 className="text-lg font-bold text-text-primary mb-4">
              ثبت پرداخت
            </h3>
            <form onSubmit={handleAddPayment}>
              <div className="space-y-4">
                <div>
                  <label className="block text-body-sm font-medium text-text-primary mb-2">
                    مبلغ (ریال)
                  </label>
                  <input
                    type="number"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    min="1"
                    max={invoice.total_amount - invoice.paid_amount}
                    className="w-full border border-border-field rounded-field px-4 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-body-sm font-medium text-text-primary mb-2">
                    روش پرداخت
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full border border-border-field rounded-field px-4 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
                  >
                    <option value="cash">نقدی</option>
                    <option value="card">کارت بانکی</option>
                    <option value="transfer">انتقال وجه</option>
                  </select>
                </div>
                <div>
                  <label className="block text-body-sm font-medium text-text-primary mb-2">
                    توضیحات
                  </label>
                  <textarea
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    rows={2}
                    className="w-full border border-border-field rounded-field px-4 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-6">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 px-4 py-2 border border-border rounded-field text-text-primary hover:bg-surface-alt"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover"
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
      <AnimatePresence>
        {showPreview && (
          <InvoicePreview
            invoice={invoice}
            isOpen
            onClose={() => setShowPreview(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
