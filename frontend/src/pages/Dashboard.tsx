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
  BanknotesIcon,
  HomeIcon,
} from "@heroicons/react/24/solid";
import { formatPersianCurrency } from "../utils/formatters";
import type {
  DashboardStats,
  DashboardTopItem,
  DashboardTransaction,
} from "../types/api";

/** Two more than the four the schema's default status list carries. */
const DEVICE_STATUS_LABELS: Record<string, string> = {
  pending: "در انتظار",
  diagnosing: "در حال بررسی",
  waiting_for_parts: "منتظر قطعه",
  repairing: "در حال تعمیر",
  repaired: "تعمیر شده",
  delivered: "تحویل شده",
  unrepairable: "غیرقابل تعمیر",
  ready_for_pickup: "آماده تحویل",
  not_repaired: "تعمیر نشد",
};

interface StatCardProps {
  title: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  subtitle?: React.ReactNode;
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  subtitle,
}: StatCardProps) {
  return (
    <div className="bg-surface rounded-lg shadow p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-text-secondary mb-1">{title}</p>
          <p className="text-2xl font-bold text-text-primary">{value}</p>
          {subtitle && (
            <p className="text-xs text-text-secondary mt-1">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-full ${color}`}>
          <Icon className="w-6 h-6 text-text-inverse" />
        </div>
      </div>
    </div>
  );
}

function RecentTransactionItem({ tx }: { tx: DashboardTransaction }) {
  const getTypeLabel = (type: string) => {
    if (type === "purchase") return { label: "خرید", color: "text-success" };
    if (type === "sale") return { label: "فروش", color: "text-danger" };
    return { label: "تنظیم", color: "text-text-secondary" };
  };

  const typeInfo = getTypeLabel(tx.type);

  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <div
          className={`w-2 h-2 rounded-full ${tx.type === "purchase" ? "bg-success" : "bg-danger"}`}
        />
        <div>
          <p className="text-sm font-medium text-text-primary">
            [{tx.item_code}] {tx.item_name}
          </p>
          <p className="text-xs text-text-secondary">
            {new Date(tx.created_at).toLocaleDateString("fa-IR")}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-medium ${typeInfo.color}`}>
          {tx.type === "purchase" ? "+" : "-"}
          {Math.abs(tx.quantity)} عدد
        </p>
        <p className="text-xs text-text-secondary">{typeInfo.label}</p>
      </div>
    </div>
  );
}

interface TopItemItemProps {
  item: DashboardTopItem;
  index: number;
}

function TopItemItem({ item, index }: TopItemItemProps) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-border last:border-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-text-secondary w-5">
          {index + 1}
        </span>
        <div>
          <p className="text-sm font-medium text-text-primary">{item.name}</p>
          <p className="text-xs text-text-secondary">{item.code}</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-sm font-medium text-text-primary">
          {formatPersianCurrency(item.revenue)} ریال
        </p>
        <p className="text-xs text-text-secondary">
          {item.sold_quantity} عدد فروش
        </p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDashboardStats()
      .then((res) => setStats(res.data))
      .catch(() => toast.error("خطا در دریافت آمار"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64" dir="rtl">
        <div className="text-text-secondary">در حال بارگذاری...</div>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div dir="rtl" className="mx-auto">
      <h1 className="text-2xl font-bold text-text-primary mb-6 flex gap-2">
        <HomeIcon className="w-6 h-6 text-text-secondary" />
        داشبورد مدیریتی
      </h1>

      <hr className="border-border" />
      <h2 className="text-lg font-medium text-text-primary my-8">
        آمار دستگاه‌ها
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="کل دستگاه‌ها"
          value={stats.devices?.total || 0}
          icon={WrenchScrewdriverIcon}
          color="bg-primary"
        />
        <StatCard
          title="دستگاه‌های امروز"
          value={stats.devices?.today || 0}
          icon={CalendarIcon}
          color="bg-primary"
        />
        <StatCard
          title="در حال تعمیر"
          value={stats.devices?.repairing || 0}
          icon={CogIcon}
          color="bg-warning"
        />
        <Link
          to="/devices"
          className="bg-primary-soft hover:opacity-80 rounded-lg shadow p-4 border border-primary-soft transition"
        >
          <p className="text-sm text-primary mb-1">مشاهده همه دستگاه‌ها</p>
          <p className="text-lg font-medium text-primary">→</p>
        </Link>
      </div>

      {stats.devices.by_status.length > 0 && (
        <div className="bg-surface rounded-lg shadow p-4 mb-12">
          <h3 className="text-sm font-medium text-text-primary mb-3">
            توزیع وضعیت دستگاه‌ها
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.devices.by_status.map((item) => (
              <span
                key={item.status}
                className="px-3 py-1 bg-surface-alt rounded-full text-sm text-text-primary"
              >
                {DEVICE_STATUS_LABELS[item.status] || item.status}:{" "}
                <strong>{item.count}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      <hr className="border-border" />
      <h2 className="text-lg font-medium text-text-primary my-8 flex items-center gap-2">
        <DocumentTextIcon className="w-5 h-5 text-text-secondary" />
        آمار فاکتورهای تعمیر
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        <StatCard
          title="فاکتورهای امروز"
          value={stats.repair_invoices?.today_count || 0}
          icon={DocumentTextIcon}
          color="bg-primary"
        />
        <StatCard
          title="درآمد امروز (تعمیرات)"
          value={
            formatPersianCurrency(stats.repair_invoices?.today_revenue || 0) +
            " ریال"
          }
          icon={BanknotesIcon}
          color="bg-success"
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
          color="bg-warning"
        />
        <StatCard
          title="درآمد این ماه (تعمیرات)"
          value={
            formatPersianCurrency(stats.repair_invoices?.month_revenue || 0) +
            " ریال"
          }
          icon={CalendarIcon}
          color="bg-primary"
        />
      </div>

      <hr className="border-border" />
      <h2 className="text-lg font-medium text-text-primary mt-12 mb-4 flex items-center gap-2">
        <DocumentTextIcon className="w-5 h-5 text-text-secondary" />
        آمار کالا ها
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title="کل کالاها"
          value={stats.items.total}
          subtitle={`${stats.items.low_stock} کالا کم‌موجود`}
          icon={CubeIcon}
          color="bg-primary"
        />
        <StatCard
          title="فروش امروز"
          value={formatPersianCurrency(stats.today.sale) + " ریال"}
          icon={ArrowTrendingUpIcon}
          color="bg-success"
        />
        <StatCard
          title="خرید امروز"
          value={formatPersianCurrency(stats.today.purchase) + " ریال"}
          icon={ArrowTrendingDownIcon}
          color="bg-warning"
        />
        <StatCard
          title="سود خالص امروز"
          value={formatPersianCurrency(stats.today.net) + " ریال"}
          subtitle={stats.today.net >= 0 ? "مثبت" : "منفی"}
          icon={CurrencyDollarIcon}
          color={stats.today.net >= 0 ? "bg-success" : "bg-danger"}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-gradient-to-r from-primary-soft to-primary-soft/50 rounded-lg p-4 border border-primary-soft">
          <p className="text-sm text-primary mb-1">فروش این ماه</p>
          <p className="text-xl font-bold text-primary">
            {formatPersianCurrency(stats.month.sale)} ریال
          </p>
        </div>
        <div className="bg-gradient-to-r from-warning-soft to-warning-soft/50 rounded-lg p-4 border border-warning-soft">
          <p className="text-sm text-warning mb-1">خرید این ماه</p>
          <p className="text-xl font-bold text-warning">
            {formatPersianCurrency(stats.month.purchase)} ریال
          </p>
        </div>
        <div
          className={`bg-gradient-to-r rounded-lg p-4 border ${stats.month.net >= 0 ? "from-success-soft to-success-soft/50 border-success-soft" : "from-danger-soft to-danger-soft/50 border-danger-soft"}`}
        >
          <p
            className={`text-sm mb-1 ${stats.month.net >= 0 ? "text-success" : "text-danger"}`}
          >
            سود این ماه
          </p>
          <p
            className={`text-xl font-bold ${stats.month.net >= 0 ? "text-success" : "text-danger"}`}
          >
            {formatPersianCurrency(stats.month.net)} ریال
          </p>
        </div>
      </div>

      {stats.items.low_stock > 0 && (
        <div className="bg-warning-soft border border-warning-soft rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-warning" />
            <div>
              <p className="font-medium text-warning">هشدار کم‌موجودی</p>
              <p className="text-sm text-warning">
                {stats.items.low_stock} کالا به حداقل موجودی رسیده یا کمتر از آن
                است.
              </p>
            </div>
            <Link
              to="/reports/stock?lowStock=true"
              className="mr-auto text-sm text-warning hover:opacity-80 underline"
            >
              مشاهده کالاهای کم‌موجود
            </Link>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-surface rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
              <ClockIcon className="w-5 h-5 text-text-secondary" />
              آخرین تراکنش‌ها
            </h2>
            <Link
              to="/reports/transactions"
              className="text-sm text-primary hover:opacity-80"
            >
              مشاهده همه
            </Link>
          </div>
          <div className="space-y-1">
            {stats.recent_transactions.length === 0 ? (
              <p className="text-center text-text-secondary py-6">
                هنوز تراکنشی ثبت نشده
              </p>
            ) : (
              stats.recent_transactions.map((tx) => (
                <RecentTransactionItem key={tx.id} tx={tx} />
              ))
            )}
          </div>
        </div>
        <div className="bg-surface rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-text-primary flex items-center gap-2">
              <ArrowTrendingUpIcon className="w-5 h-5 text-text-secondary" />
              پرفروش‌ترین کالاها
            </h2>
            <Link
              to="/reports/profit"
              className="text-sm text-primary hover:opacity-80"
            >
              گزارش کامل
            </Link>
          </div>
          <div className="space-y-1">
            {stats.top_items.length === 0 ? (
              <p className="text-center text-text-secondary py-6">
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
    </div>
  );
}
