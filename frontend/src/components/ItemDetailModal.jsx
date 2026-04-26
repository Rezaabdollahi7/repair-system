// src/components/ItemDetailModal.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getItem, deleteItem, getItemTransactions } from "../api";
import api from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "./ConfirmModal";
import {
  PencilSquareIcon,
  TrashIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";

// ─── Quick Purchase Modal (دقیقاً همون قبلیه) ──────────────────
function QuickPurchaseModal({ isOpen, onClose, onSuccess, item }) {
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(item?.avgPurchasePrice || 0);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/items/${item.id}/quick-purchase`, {
        quantity: parseInt(quantity),
        unit_price: parseInt(price),
      });
      toast.success("خرید سریع با موفقیت ثبت شد");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت خرید سریع");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">افزایش سریع موجودی</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">کالا</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                [{item?.code}] {item?.name}
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">تعداد</label>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                قیمت واحد (ریال)
              </label>
              <input
                type="number"
                min="0"
                value={price}
                onChange={(e) => setPrice(parseInt(e.target.value) || 0)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                required
              />
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex justify-between text-sm">
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
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "در حال ثبت..." : "ثبت خرید"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Sale Modal (دقیقاً همون قبلیه) ──────────────────────
function QuickSaleModal({ isOpen, onClose, onSuccess, item }) {
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
    if (!quantity || quantity <= 0)
      newErrors.quantity = "تعداد باید بیشتر از صفر باشد";
    if (quantity > (item?.currentStock || 0))
      newErrors.quantity = `موجودی کافی نیست (موجودی: ${item?.currentStock})`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await api.post(`/items/${item.id}/quick-sale`, {
        quantity: parseInt(quantity),
        customer_name: customerName?.trim() || "مشتری متفرقه",
      });
      toast.success("فروش سریع با موفقیت ثبت شد");
      onSuccess();
      onClose();
      setQuantity(1);
      setCustomerName("");
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در ثبت فروش سریع");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold">فروش سریع</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">کالا</label>
              <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm">
                [{item?.code}] {item?.name}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                موجودی فعلی: {item?.currentStock} {item?.unit}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                تعداد <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max={item?.currentStock}
                value={quantity}
                onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                className={`w-full border rounded-lg px-3 py-2 ${errors.quantity ? "border-red-500" : "border-gray-300"}`}
                required
              />
              {errors.quantity && (
                <p className="text-xs text-red-600 mt-1">{errors.quantity}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                نام مشتری
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                placeholder="مشتری متفرقه"
              />
            </div>
            <div className="bg-gray-50 p-3 rounded-lg">
              <div className="flex justify-between text-sm">
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
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
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
function StockStatusCard({ current, min, unit }) {
  const isCritical = current === 0;
  const isLow = current > 0 && current <= min;
  let bgColor = "bg-green-50 border-green-200";
  let textColor = "text-green-800";
  let icon = <ArrowTrendingUpIcon className="w-8 h-8 text-green-600" />;
  let statusText = "موجودی کافی";
  if (isCritical) {
    bgColor = "bg-red-50 border-red-200";
    textColor = "text-red-800";
    icon = <ExclamationTriangleIcon className="w-8 h-8 text-red-600" />;
    statusText = "اتمام موجودی";
  } else if (isLow) {
    bgColor = "bg-yellow-50 border-yellow-200";
    textColor = "text-yellow-800";
    icon = <ArrowTrendingDownIcon className="w-8 h-8 text-yellow-600" />;
    statusText = "کم‌موجود";
  }
  return (
    <div className={`border rounded-lg p-6 ${bgColor}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className={`text-sm font-medium ${textColor} mb-1`}>
            {statusText}
          </p>
          <p className="text-3xl font-bold text-gray-900">
            {current}{" "}
            <span className="text-lg font-normal text-gray-600">{unit}</span>
          </p>
          <p className="text-sm text-gray-600 mt-2">
            حداقل موجودی: {min} {unit}
          </p>
        </div>
        <div className="p-3 bg-white rounded-full shadow-sm">{icon}</div>
      </div>
      {(isCritical || isLow) && (
        <div className="mt-4 p-3 bg-white rounded-lg border border-current">
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

// ─── Main Component ────────────────────────────────────────────
export default function ItemDetailModal({ itemId, isOpen, onClose }) {
  const { isAtLeast } = useAuth();
  const { openItemEdit } = useModal();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [showQuickPurchase, setShowQuickPurchase] = useState(false);
  const [showQuickSale, setShowQuickSale] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

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
  }, [isOpen, itemId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteItem(itemId);
      toast.success("کالا با موفقیت حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || "خطا در حذف کالا");
    } finally {
      setDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-6xl my-8"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-gray-900">
            {loading
              ? "در حال بارگذاری..."
              : item
                ? `${item.name}`
                : "جزئیات کالا"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="text-gray-500">در حال بارگذاری...</div>
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
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
                    عملیات سریع
                  </h3>
                  <div className="space-y-3">
                    <button
                      onClick={() => setShowQuickPurchase(true)}
                      className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <ArrowTrendingUpIcon className="w-4 h-4" />
                      افزایش موجودی (خرید سریع)
                    </button>
                    <button
                      onClick={() => setShowQuickSale(true)}
                      className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                    >
                      <ArrowTrendingDownIcon className="w-4 h-4" />
                      کاهش موجودی (فروش)
                    </button>
                  </div>
                </div>
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">
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
                          ? `${Number(item.avgPurchasePrice).toLocaleString()} ریال`
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
                    <InfoRow
                      label="آخرین بروزرسانی"
                      value={
                        item.updatedAt
                          ? new Date(item.updatedAt).toLocaleDateString("fa-IR")
                          : "—"
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="lg:col-span-2">
                <div className="bg-white shadow rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-gray-600" />
                    تاریخچه گردش موجودی
                  </h3>
                  {loadingTransactions ? (
                    <div className="text-center py-10 text-gray-500">
                      در حال بارگذاری...
                    </div>
                  ) : transactions.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <ClipboardDocumentListIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      <p>هنوز تراکنشی برای این کالا ثبت نشده است</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                              تاریخ
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                              نوع
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                              تعداد
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                              قیمت واحد
                            </th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                              توضیحات
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {transactions.map((tx) => (
                            <tr key={tx.id}>
                              <td className="px-4 py-2 text-sm">
                                {new Date(tx.created_at).toLocaleDateString(
                                  "fa-IR",
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {tx.type === "purchase" ? (
                                  <span className="text-green-600">خرید</span>
                                ) : tx.type === "sale" ? (
                                  <span className="text-red-600">فروش</span>
                                ) : (
                                  <span className="text-gray-600">
                                    تنظیم موجودی
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-2 text-sm">
                                <span
                                  className={
                                    tx.quantity > 0
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }
                                >
                                  {tx.quantity > 0 ? "+" : ""}
                                  {tx.quantity}
                                </span>
                              </td>
                              <td className="px-4 py-2 text-sm">
                                {tx.unit_price
                                  ? Number(tx.unit_price).toLocaleString()
                                  : "—"}
                              </td>
                              <td className="px-4 py-2 text-sm text-gray-600">
                                {tx.purchase_invoice_number ? (
                                  <Link
                                    to={`/purchase-invoices/${tx.reference_id}`}
                                    className="text-blue-600 hover:underline"
                                  >
                                    {tx.purchase_invoice_number}
                                  </Link>
                                ) : (
                                  tx.note || "—"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
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
