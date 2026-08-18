import { useState, useEffect } from "react";
import axios from "axios";
import {
  getItem,
  deleteItem,
  getItemTransactions,
  quickPurchase,
  quickSale,
} from "../api";
import toast from "react-hot-toast";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "./ConfirmModal";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "./LoadingSpinner";
import { formatPersianCurrency } from "../utils/formatters";
import type { Id, InventoryTransaction, Item } from "../types/api";

/** The server answers with { error } on every failing path. */
function errorText(error: unknown, fallback: string): string {
  return (
    (axios.isAxiosError(error) &&
      (error.response?.data as { error?: string } | undefined)?.error) ||
    fallback
  );
}

interface QuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: Item | null;
}

// ─── Quick Purchase Modal ──────────────────────────────────
function QuickPurchaseModal({
  isOpen,
  onClose,
  onSuccess,
  item,
}: QuickModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(item?.avgPurchasePrice || 0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    setLoading(true);
    try {
      await quickPurchase(item.id, {
        quantity,
        unit_price: price,
      });
      toast.success("خرید سریع با موفقیت ثبت شد");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت خرید سریع"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 w-full max-w-md" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-text-primary">
            افزایش سریع موجودی
          </h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                کالا
              </label>
              <div className="px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm text-text-primary">
                [{item?.code}] {item?.name}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                تعداد
              </label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full border border-border rounded-lg px-3 py-2 bg-surface text-text-primary"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                قیمت واحد (ریال)
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
                className="w-full border border-border rounded-lg px-3 py-2 bg-surface text-text-primary"
                required
              />
            </div>
            <div className="bg-surface-alt p-3 rounded-lg">
              <div className="flex justify-between text-sm text-text-primary">
                <span>جمع کل:</span>
                <span className="font-medium">
                  {(quantity * price).toLocaleString()} ریال
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-surface-alt text-text-primary"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "در حال ثبت..." : "ثبت خرید"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Sale Modal ──────────────────────────────────────
function QuickSaleModal({ isOpen, onClose, onSuccess, item }: QuickModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ quantity?: string }>({});

  const validate = () => {
    const newErrors: { quantity?: string } = {};
    if (!quantity || quantity <= 0)
      newErrors.quantity = "تعداد باید بیشتر از صفر باشد";
    if (quantity > (item?.currentStock || 0))
      newErrors.quantity = `موجودی کافی نیست (موجودی: ${item?.currentStock})`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    if (!validate()) return;
    setLoading(true);
    try {
      await quickSale(item.id, {
        quantity,
        customer_name: customerName?.trim() || "مشتری متفرقه",
      });
      toast.success("فروش سریع با موفقیت ثبت شد");
      onSuccess();
      onClose();
      setQuantity(1);
      setCustomerName("");
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت فروش سریع"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-lg p-6 w-full max-w-md" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-text-primary">فروش سریع</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                کالا
              </label>
              <div className="px-3 py-2 bg-surface-alt border border-border rounded-lg text-sm text-text-primary">
                [{item?.code}] {item?.name}
              </div>
              <p className="text-xs text-text-secondary mt-1">
                موجودی فعلی: {item?.currentStock} {item?.unit}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                تعداد <span className="text-danger">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={item?.currentStock}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className={`w-full border rounded-lg px-3 py-2 bg-surface text-text-primary ${errors.quantity ? "border-danger" : "border-border"}`}
                required
              />
              {errors.quantity && (
                <p className="text-xs text-danger mt-1">{errors.quantity}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-text-primary mb-1">
                نام مشتری
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-border rounded-lg px-3 py-2 bg-surface text-text-primary"
                placeholder="مشتری متفرقه"
              />
            </div>
            <div className="bg-surface-alt p-3 rounded-lg">
              <div className="flex justify-between text-sm text-text-primary">
                <span>موجودی بعد از فروش:</span>
                <span className="font-medium">
                  {(item?.currentStock || 0) - quantity} {item?.unit}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-lg hover:bg-surface-alt text-text-primary"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-danger text-text-inverse rounded-lg hover:bg-danger-hover disabled:opacity-50"
            >
              {loading ? "در حال ثبت..." : "ثبت فروش"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Stock Status Card ─────────────────────────────────────────
interface StockStatusCardProps {
  current: number;
  min: number;
  unit: string;
}

function StockStatusCard({ current, min, unit }: StockStatusCardProps) {
  const isCritical = current === 0;
  const isLow = current > 0 && current <= min;
  let bgColor = "bg-success-soft border-success-soft";
  let textColor = "text-success";
  let icon = <ArrowTrendingUpIcon className="w-8 h-8 text-success" />;
  let statusText = "موجودی کافی";
  if (isCritical) {
    bgColor = "bg-danger-soft border-danger-soft";
    textColor = "text-danger";
    icon = <ExclamationTriangleIcon className="w-8 h-8 text-danger" />;
    statusText = "اتمام موجودی";
  } else if (isLow) {
    bgColor = "bg-warning-soft border-warning-soft";
    textColor = "text-warning";
    icon = <ArrowTrendingDownIcon className="w-8 h-8 text-warning" />;
    statusText = "کم‌موجود";
  }
  return (
    <div className={`border rounded-lg p-6 ${bgColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-medium ${textColor} mb-1`}>
            {statusText}
          </p>
          <p className="text-3xl font-bold text-text-primary">
            {current}{" "}
            <span className="text-lg font-normal text-text-secondary">
              {unit}
            </span>
          </p>
          <p className="text-sm text-text-secondary mt-2">
            حداقل موجودی: {min} {unit}
          </p>
        </div>
        <div className="p-3 bg-surface rounded-full shadow-sm">{icon}</div>
      </div>
      {(isCritical || isLow) && (
        <div className="mt-4 p-3 bg-surface rounded-lg border border-current">
          <p className={`text-sm ${textColor}`}>
            {isCritical
              ? "موجودی این کالا به اتمام رسیده است."
              : `موجودی این کالا به زیر حداقل (${min}) رسیده است.`}
          </p>
        </div>
      )}
    </div>
  );
}

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}

function InfoRow({ label, value, highlight = false }: InfoRowProps) {
  return (
    <div className="flex justify-between py-2 border-b border-border last:border-0">
      <span className="text-sm text-text-secondary">{label}</span>
      <span
        className={`text-sm ${highlight ? "font-medium text-text-primary" : "text-text-primary"}`}
      >
        {value || "—"}
      </span>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────
interface ItemDetailModalProps {
  itemId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  zIndex?: number;
}

export default function ItemDetailModal({
  itemId,
  isOpen,
  onClose,
}: ItemDetailModalProps) {
  const [item, setItem] = useState<Item | null>(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showQuickPurchase, setShowQuickPurchase] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);
  // The button that would set this has no counterpart in the header yet —
  // unlike the device and customer modals, which both have one.
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { openPurchaseInvoiceDetail } = useModal();

  const fetchData = async () => {
    if (!itemId) return;
    try {
      const [itemRes, txRes] = await Promise.all([
        getItem(itemId),
        getItemTransactions(itemId, { limit: 50 }),
      ]);
      setItem(itemRes.data);
      setTransactions(txRes.data.data || []);
    } catch {
      toast.error("خطا در دریافت اطلاعات");
    } finally {
      setLoading(false);
      setLoadingTransactions(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itemId]);

  const handleDelete = async () => {
    if (!itemId) return;
    setDeleting(true);
    try {
      await deleteItem(itemId);
      toast.success("کالا با موفقیت حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در حذف کالا"));
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-6xl my-8"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-text-primary">
            {loading
              ? "در حال بارگذاری..."
              : item
                ? `${item.name}`
                : "جزئیات کالا"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
          </div>
        ) : item ? (
          <div className="p-6">
            {/* Main Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <StockStatusCard
                  current={item.currentStock || 0}
                  min={item.minStock || 0}
                  unit={item.unit}
                />
                <div className="bg-surface shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-text-primary mb-4">
                    عملیات سریع
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowQuickPurchase(true)}
                      className="w-full px-4 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover flex items-center justify-center gap-2"
                    >
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                      افزایش موجودی (خرید سریع)
                    </button>
                    <button
                      onClick={() => setShowQuickSale(true)}
                      className="w-full px-4 py-2 border border-border text-text-primary rounded-lg hover:bg-surface-alt flex items-center justify-center gap-2"
                    >
                      <ArrowTrendingDownIcon className="w-4 h-4" />
                      کاهش موجودی (فروش)
                    </button>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-surface shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-text-primary mb-4">
                    اطلاعات کالا
                  </h3>
                  <div className="space-y-1">
                    <InfoRow label="کد کالا" value={item.code} highlight />
                    <InfoRow label="نام کالا" value={item.name} highlight />
                    <InfoRow label="دسته‌بندی" value={item.categoryName} />
                    <InfoRow label="واحد شمارش" value={item.unit} />
                    <InfoRow
                      label="حداقل موجودی"
                      value={`${item.minStock || 0} ${item.unit}`}
                    />
                    <InfoRow
                      label="میانگین قیمت خرید"
                      value={
                        item.avgPurchasePrice
                          ? ` ${formatPersianCurrency(item.avgPurchasePrice)} ریال`
                          : "—"
                      }
                    />
                    <InfoRow
                      label="تاریخ ایجاد"
                      value={
                        item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString("fa-IR")
                          : "—"
                      }
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-surface shadow rounded-lg p-6 mt-8">
              <h3 className="text-lg font-medium text-text-primary mb-4 flex items-center gap-2">
                <ClipboardDocumentListIcon className="w-5 h-5 text-text-secondary" />
                تاریخچه گردش موجودی
              </h3>
              {loadingTransactions ? (
                <div className="text-center py-10 text-text-secondary">
                  در حال بارگذاری...
                </div>
              ) : transactions.length === 0 ? (
                <div className="text-center py-10 text-text-secondary">
                  <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 text-text-secondary" />
                  <p>هنوز تراکنشی برای این کالا ثبت نشده است</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-border">
                    <thead className="bg-surface-alt">
                      <tr>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary">
                          تاریخ
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary">
                          نوع
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary">
                          تعداد
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary">
                          قیمت واحد
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-text-secondary">
                          توضیحات
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {transactions.map((tx) => {
                        // Captured in a local: TypeScript drops the narrowing
                        // on a property once it crosses into the onClick
                        // closure below.
                        const invoiceId = tx.reference_id;
                        return (
                          <tr key={tx.id}>
                            <td className="px-4 py-2 text-sm text-text-primary">
                              {new Date(tx.created_at).toLocaleDateString(
                                "fa-IR",
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {tx.type === "purchase" ? (
                                <span className="text-success">خرید</span>
                              ) : tx.type === "sale" ? (
                                <span className="text-danger">فروش</span>
                              ) : (
                                <span className="text-text-secondary">
                                  تنظیم موجودی
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              <span
                                className={
                                  tx.quantity > 0
                                    ? "text-success"
                                    : "text-danger"
                                }
                              >
                                {tx.quantity > 0 ? "+" : ""}
                                {tx.quantity}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-sm text-text-primary">
                              {tx.unit_price
                                ? formatPersianCurrency(tx.unit_price)
                                : "—"}
                            </td>
                            <td className="px-4 py-2 text-sm text-text-secondary">
                              {tx.purchase_invoice_number &&
                              invoiceId !== null ? (
                                <button
                                  onClick={() =>
                                    openPurchaseInvoiceDetail(invoiceId)
                                  }
                                  className="text-primary hover:underline"
                                >
                                  {tx.purchase_invoice_number}
                                </button>
                              ) : (
                                tx.note || "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Quick Purchase Modal */}
        <QuickPurchaseModal
          isOpen={showQuickPurchase}
          onClose={() => setShowQuickPurchase(false)}
          onSuccess={fetchData}
          item={item}
        />
        {/* Quick Sale Modal */}
        <QuickSaleModal
          isOpen={showQuickSale}
          onClose={() => setShowQuickSale(false)}
          onSuccess={fetchData}
          item={item}
        />
        {/* Delete Confirm */}
        <ConfirmModal
          isOpen={showDeleteConfirm}
          onClose={() => setShowDeleteConfirm(false)}
          onConfirm={handleDelete}
          title="حذف کالا"
          message={`آیا از حذف کالای "${item?.name}" مطمئن هستید؟`}
          confirmText="حذف"
          variant="danger"
          loading={deleting}
        />
      </div>
    </div>
  );
}
