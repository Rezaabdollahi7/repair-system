// src/pages/ItemDetail.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getItem, deleteItem } from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  PencilSquareIcon,
  TrashIcon,
  ArrowRightIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClipboardDocumentListIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";

function StockStatusCard({ current, min, unit }) {
  const isCritical = current === 0;
  const isLow = current > 0 && current <= min;
  const isGood = current > min;

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
              ? "موجودی این کالا به اتمام رسیده است. لطفاً سریعاً نسبت به خرید اقدام کنید."
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

export default function ItemDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAtLeast } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);

  // ─── Fetch Item Data ─────────────────────────────────────────
  useEffect(() => {
    getItem(id)
      .then((res) => {
        setItem(res.data);
      })
      .catch(() => {
        toast.error("خطا در دریافت اطلاعات کالا");
        navigate("/items");
      })
      .finally(() => {
        setLoading(false);
      });

    // TODO: Replace with real API in Sprint 7
    // فعلاً تراکنش‌ها رو خالی می‌ذاریم
    setLoadingTransactions(false);
  }, [id, navigate]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!confirm(`آیا از حذف کالای "${item.name}" مطمئن هستید؟`)) return;

    try {
      await deleteItem(id);
      toast.success("کالا با موفقیت حذف شد");
      navigate("/items");
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error(error.response.data.error || "این کالا قابل حذف نیست");
      } else {
        toast.error("خطا در حذف کالا");
      }
    }
  };

  const handleQuickStockUpdate = () => {
    // TODO: Open modal for stock update in Sprint 7
    toast("این قابلیت در اسپرینت ۷ اضافه خواهد شد", { icon: "🔜" });
  };

  // ─── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64" dir="rtl">
        <div className="text-gray-500">در حال بارگذاری...</div>
      </div>
    );
  }

  if (!item) {
    return null;
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/items"
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2"
        >
          <ArrowRightIcon className="w-4 h-4" />
          بازگشت به لیست کالاها
        </Link>
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-sm text-gray-600">کد: {item.code}</span>
              {item.categoryName && (
                <>
                  <span className="text-gray-400">•</span>
                  <span className="text-sm text-gray-600">
                    دسته‌بندی: {item.categoryName}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Link
              to={`/items/${id}/edit`}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
            >
              <PencilSquareIcon className="w-4 h-4" />
              ویرایش
            </Link>
            {isAtLeast("admin") && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-2 cursor-pointer"
              >
                <TrashIcon className="w-4 h-4" />
                حذف
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Stock Status Card */}
          <StockStatusCard
            current={item.currentStock || 0}
            min={item.minStock || 0}
            unit={item.unit}
          />

          {/* Quick Actions */}
          <div className="bg-white shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              عملیات سریع
            </h3>
            <div className="space-y-3">
              <button
                onClick={handleQuickStockUpdate}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowTrendingUpIcon className="w-4 h-4" />
                افزایش موجودی
              </button>
              <button
                onClick={handleQuickStockUpdate}
                className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowTrendingDownIcon className="w-4 h-4" />
                کاهش موجودی
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-4 text-center">
              * مدیریت دقیق موجودی از طریق فاکتور خرید و فروش در اسپرینت‌های
              بعدی
            </p>
          </div>

          {/* Details Card */}
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

          {/* Description */}
          {item.description && (
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">
                توضیحات
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                {item.description}
              </p>
            </div>
          )}
        </div>

        {/* Right Column - Transactions History */}
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
                <p className="text-xs mt-2 text-gray-400">
                  با ثبت فاکتور خرید یا فروش، تاریخچه اینجا نمایش داده می‌شود
                </p>
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
                    {/* Transactions will be mapped here in Sprint 7 */}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
