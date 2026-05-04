// src/pages/Dashboard.jsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { getDashboardStats } from "../api";
import toast from "react-hot-toast";
import {
  CubeIcon,
  ExclamationTriangleIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  CurrencyDollarIcon,
  ClockIcon,
  WrenchScrewdriverIcon,
  CalendarIcon,
  CogIcon,
  DocumentTextIcon,
  CreditCardIcon,
  BanknotesIcon,
  HomeIcon,
} from "@heroicons/react/24/solid";
import { formatPersianCurrency } from "../utils/formatters";

function StatCard({ title, value, icon: Icon, color, subtitle }) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600 mb-1">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
    </div>
  );
}

function RecentTransactionItem({ tx }) {
  const getTypeLabel = (type) => {
    if (type === "purchase") return { label: "خرید", color: "text-green-600" };
    if (type === "sale") return { label: "فروش", color: "text-red-600" };
    return { label: "تنظیم", color: "text-gray-600" };
  };

  const typeInfo = getTypeLabel(tx.type);

  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${tx.type === "purchase" ? "bg-green-500" : "bg-red-500"}`}
        />
        <div>
          <p className="text-sm font-medium text-gray-900">
            [{tx.item_code}] {tx.item_name}
          </p>
          <p className="text-xs text-gray-500">
            {new Date(tx.created_at).toLocaleDateString("fa-IR")}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${typeInfo.color}`}>
          {tx.type === "purchase" ? "+" : "-"}
          {Math.abs(tx.quantity)} عدد
        </p>
        <p className="text-xs text-gray-500">{typeInfo.label}</p>
      </div>
    </div>
  );
}

function TopItemItem({ item, index }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-500 w-5">
          {index + 1}
        </span>
        <div>
          <p className="text-sm font-medium text-gray-900">{item.name}</p>
          <p className="text-xs text-gray-500">{item.code}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-gray-900">
          {Number(item.revenue).toLocaleString()} ریال
        </p>
        <p className="text-xs text-gray-500">{item.sold_quantity} عدد فروش</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((res) => {
        setStats(res.data);
      })
      .catch(() => {
        toast.error("خطا در دریافت آمار");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64" dir="rtl">
        <div className="text-gray-500">در حال بارگذاری...</div>
      </div>
    );
  }

  if (!stats) return null;

  const formatCurrency = (amount) => Number(amount).toLocaleString();

  return (
    <div dir="rtl" className=" mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6 flex gap-2">
        <HomeIcon className="w-6 h-6 text-gray-600" />
        داشبورد مدیریتی
      </h1>

      <hr className="text-gray-300 " />
      {/* Device Stats */}
      <h2 className="text-lg font-medium text-gray-900 my-8">آمار دستگاه‌ها</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="کل دستگاه‌ها"
          value={stats.devices?.total || 0}
          icon={WrenchScrewdriverIcon}
          color="bg-indigo-500"
        />
        <StatCard
          title="دستگاه‌های امروز"
          value={stats.devices?.today || 0}
          icon={CalendarIcon}
          color="bg-cyan-500"
        />
        <StatCard
          title="در حال تعمیر"
          value={stats.devices?.repairing || 0}
          icon={CogIcon}
          color="bg-amber-500"
        />
        <Link
          to="/devices"
          className="bg-purple-50 hover:bg-purple-100 rounded-lg shadow p-4 border border-purple-200 transition"
        >
          <p className="text-sm text-purple-700 mb-1">مشاهده همه دستگاه‌ها</p>
          <p className="text-lg font-medium text-purple-800">→</p>
        </Link>
      </div>

      {/* Status Breakdown */}
      {stats.devices?.by_status?.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4 mb-12">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            توزیع وضعیت دستگاه‌ها
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.devices.by_status.map((item) => {
              const statusMap = {
                pending: "در انتظار",
                diagnosing: "در حال بررسی",
                waiting_for_parts: "منتظر قطعه",
                repairing: "در حال تعمیر",
                repaired: "تعمیر شده",
                delivered: "تحویل شده",
                unrepairable: "غیرقابل تعمیر",
              };
              return (
                <span
                  key={item.status}
                  className="px-3 py-1 bg-gray-100 rounded-full text-sm"
                >
                  {statusMap[item.status] || item.status}:{" "}
                  <strong>{item.count}</strong>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <hr className="text-gray-300 " />
      {/* Repair Invoice Stats */}
      <h2 className="text-lg font-medium text-gray-900 my-8 flex items-center gap-2">
        <DocumentTextIcon className="w-5 h-5 text-gray-600" />
        آمار فاکتورهای تعمیر
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        <StatCard
          title="فاکتورهای امروز"
          value={stats.repair_invoices?.today_count || 0}
          icon={DocumentTextIcon}
          color="bg-indigo-500"
        />
        <StatCard
          title="درآمد امروز (تعمیرات)"
          value={
            formatPersianCurrency(stats.repair_invoices?.today_revenue || 0) +
            " ریال"
          }
          icon={BanknotesIcon}
          color="bg-emerald-500"
        />
        <StatCard
          title="در انتظار پرداخت"
          value={stats.repair_invoices?.pending_payment_count || 0}
          subtitle={
            stats.repair_invoices?.issued_unpaid_amount
              ? `${formatPersianCurrency(stats.repair_invoices.issued_unpaid_amount)} ریال`
              : "—"
          }
          icon={ClockIcon}
          color="bg-amber-500"
        />
        <StatCard
          title="درآمد این ماه (تعمیرات)"
          value={
            formatPersianCurrency(stats.repair_invoices?.month_revenue || 0) +
            " ریال"
          }
          icon={CalendarIcon}
          color="bg-cyan-500"
        />
      </div>

      <hr className="text-gray-300" />

      <h2 className="text-lg font-medium text-gray-900 mt-12 mb-4 flex items-center gap-2">
        <DocumentTextIcon className="w-5 h-5 text-gray-600" />
        آمار کالا ها
      </h2>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="کل کالاها"
          value={stats.items.total}
          subtitle={`${stats.items.low_stock} کالا کم‌موجود`}
          icon={CubeIcon}
          color="bg-blue-500"
        />
        <StatCard
          title="فروش امروز"
          value={formatPersianCurrency(stats.today.sale) + " ریال"}
          icon={ArrowTrendingUpIcon}
          color="bg-green-500"
        />
        <StatCard
          title="خرید امروز"
          value={formatPersianCurrency(stats.today.purchase) + " ریال"}
          icon={ArrowTrendingDownIcon}
          color="bg-orange-500"
        />
        <StatCard
          title="سود خالص امروز"
          value={formatPersianCurrency(stats.today.net) + " ریال"}
          subtitle={stats.today.net >= 0 ? "مثبت" : "منفی"}
          icon={CurrencyDollarIcon}
          color={stats.today.net >= 0 ? "bg-emerald-500" : "bg-red-500"}
        />
      </div>

      {/* Monthly Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
          <p className="text-sm text-blue-700 mb-1">فروش این ماه</p>
          <p className="text-xl font-bold text-blue-900">
            {formatPersianCurrency(stats.month.sale)} ریال
          </p>
        </div>
        <div className="bg-gradient-to-r from-orange-50 to-orange-100 rounded-lg p-4 border border-orange-200">
          <p className="text-sm text-orange-700 mb-1">خرید این ماه</p>
          <p className="text-xl font-bold text-orange-900">
            {formatPersianCurrency(stats.month.purchase)} ریال
          </p>
        </div>
        <div
          className={`bg-gradient-to-r rounded-lg p-4 border ${stats.month.net >= 0 ? "from-emerald-50 to-emerald-100 border-emerald-200" : "from-red-50 to-red-100 border-red-200"}`}
        >
          <p
            className={`text-sm mb-1 ${stats.month.net >= 0 ? "text-emerald-700" : "text-red-700"}`}
          >
            سود این ماه
          </p>
          <p
            className={`text-xl font-bold ${stats.month.net >= 0 ? "text-emerald-900" : "text-red-900"}`}
          >
            {formatPersianCurrency(stats.month.net)} ریال
          </p>
        </div>
      </div>

      {/* Low Stock Alert */}
      {stats.items.low_stock > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800">هشدار کم‌موجودی</p>
              <p className="text-sm text-yellow-700">
                {stats.items.low_stock} کالا به حداقل موجودی رسیده یا کمتر از آن
                است.
              </p>
            </div>
            <Link
              to="/reports/stock?lowStock=true"
              className="mr-auto text-sm text-yellow-700 hover:text-yellow-900 underline"
            >
              مشاهده کالاهای کم‌موجود
            </Link>
          </div>
        </div>
      )}

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-gray-600" />
              آخرین تراکنش‌ها
            </h2>
            <Link
              to="/reports/transactions"
              className="text-sm text-blue-600 hover:underline"
            >
              مشاهده همه
            </Link>
          </div>

          <div className="space-y-1">
            {stats.recent_transactions.length === 0 ? (
              <p className="text-center text-gray-400 py-6">
                هنوز تراکنشی ثبت نشده
              </p>
            ) : (
              stats.recent_transactions.map((tx) => (
                <RecentTransactionItem key={tx.id} tx={tx} />
              ))
            )}
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <ArrowTrendingUpIcon className="w-5 h-5 text-gray-600" />
              پرفروش‌ترین کالاها
            </h2>
            <Link
              to="/reports/profit"
              className="text-sm text-blue-600 hover:underline"
            >
              گزارش کامل
            </Link>
          </div>

          <div className="space-y-1">
            {stats.top_items.length === 0 ? (
              <p className="text-center text-gray-400 py-6">
                هنوز فروشی ثبت نشده
              </p>
            ) : (
              stats.top_items.map((item, index) => (
                <TopItemItem key={item.id} item={item} index={index} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Link
          to="/purchase-invoices/new"
          className="bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg p-3 text-center text-sm font-medium transition"
        >
          ➕ فاکتور خرید جدید
        </Link>
        <Link
          to="/sale-invoices/new"
          className="bg-green-50 hover:bg-green-100 text-green-700 rounded-lg p-3 text-center text-sm font-medium transition"
        >
          🛒 فاکتور فروش جدید
        </Link>
        <Link
          to="/repair-invoices/new"
          className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg p-3 text-center text-sm font-medium transition"
        >
          🔧 فاکتور تعمیر جدید
        </Link>
        <Link
          to="/items"
          className="bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg p-3 text-center text-sm font-medium transition"
        >
          📦 مدیریت کالاها
        </Link>
      </div>
    </div>
  );
}
