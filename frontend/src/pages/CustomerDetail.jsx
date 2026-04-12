// src/pages/customers/CustomerDetail.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  getCustomer,
  getCustomerStats,
  getCustomerDevices,
  deleteCustomer,
} from "../api";
import { toast } from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  UserIcon,
  PhoneIcon,
  CalendarIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

// ── helper ──────────────────────────────────────────────
const statusColor = {
  pending: "bg-yellow-100 text-yellow-700",
  diagnosing: "bg-purple-100 text-purple-700",
  repairing: "bg-orange-100 text-orange-700",
  repaired: "bg-green-100 text-green-700",
  delivered: "bg-blue-100 text-blue-700",
  unrepairable: "bg-red-100 text-red-700",
};

const statusLabel = {
  pending: "در انتظار",
  diagnosing: "در حال بررسی",
  repairing: "در حال تعمیر",
  repaired: "تعمیر شد",
  delivered: "تحویل داده شد",
  unrepairable: "تعمیر نشد",
};

function toJalali(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR");
}

// ── StatCard ─────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex items-center gap-4">
      <div className={`p-3 rounded-full ${color}`}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-sm text-gray-500">{label}</p>
        <p className="text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

// ── DeviceTimeline ────────────────────────────────────────
function DeviceTimeline({ devices }) {
  if (!devices.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        هیچ دستگاهی ثبت نشده
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute right-5 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-4">
        {devices.map((device) => (
          <div
            key={device.id}
            className="relative flex items-start gap-4 pr-12"
          >
            <div className="absolute right-3 mt-1.5 w-5 h-5 rounded-full bg-white border-2 border-blue-400 z-10" />
            <Link
              to={`/devices/${device.id}`}
              className="flex-1 bg-white rounded-lg shadow-sm border border-gray-100 p-4 hover:border-blue-300 hover:shadow transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-gray-900">
                    {device.device_name}
                  </p>
                  {device.brand && (
                    <p className="text-sm text-gray-500 mt-0.5">
                      {device.brand}
                      {device.model && ` · ${device.model}`}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium ${
                    statusColor[device.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {statusLabel[device.status] ?? device.status}
                </span>
              </div>

              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3.5 h-3.5" />
                  ورود: {toJalali(device.entry_date)}
                </span>
                {device.exit_date && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-3.5 h-3.5" />
                    خروج: {toJalali(device.exit_date)}
                  </span>
                )}
              </div>

              {device.description && (
                <p className="mt-2 text-xs text-gray-500 line-clamp-2">
                  {device.description}
                </p>
              )}
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── main component ────────────────────────────────────────
export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAtLeast } = useAuth();

  const [customer, setCustomer] = useState(null);
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [custRes, statsRes, devRes] = await Promise.all([
          getCustomer(id),
          getCustomerStats(id),
          getCustomerDevices(id),
        ]);
        setCustomer(custRes.data);
        setStats(statsRes.data);
        setDevices(devRes.data);
      } catch {
        toast.error("خطا در بارگذاری اطلاعات");
        navigate("/customers");
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id]);

  const handleDelete = async () => {
    if (!confirm(`آیا مطمئنید؟ مشتری "${customer.name}" حذف شود؟`)) return;
    setDeleting(true);
    try {
      await deleteCustomer(id);
      toast.success("مشتری حذف شد");
      navigate("/customers");
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در حذف");
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="space-y-6">
      {/* breadcrumb */}
      <button
        onClick={() => navigate("/customers")}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowRightIcon className="w-4 h-4" />
        بازگشت به مشتریان
      </button>

      {/* هدر */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-100 flex items-center justify-center">
              <UserIcon className="w-8 h-8 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {customer.name}
              </h1>
              <div className="flex items-center gap-2 mt-1 text-gray-500 text-sm">
                <PhoneIcon className="w-4 h-4" />
                <span>{customer.phone || "—"}</span>
              </div>
              <div className="flex items-center gap-2 mt-1 text-gray-400 text-xs">
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>عضویت: {toJalali(customer.created_at)}</span>
              </div>
            </div>
          </div>

          {/* دکمه‌ها */}
          <div className="flex gap-2">
            <Link
              to={`/customers/${id}/edit`}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
            >
              <PencilIcon className="w-4 h-4" />
              ویرایش
            </Link>

            {/* فقط admin+ */}
            {isAtLeast("admin") && (
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-600 text-sm rounded-lg hover:bg-red-100 disabled:opacity-50"
              >
                <TrashIcon className="w-4 h-4" />
                {deleting ? "..." : "حذف"}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* آمار */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            icon={DevicePhoneMobileIcon}
            label="کل دستگاه‌ها"
            value={stats.total_devices ?? 0}
            color="bg-blue-100 text-blue-600"
          />
          <StatCard
            icon={CheckCircleIcon}
            label="تعمیر موفق"
            value={stats.successful_repairs ?? 0}
            color="bg-green-100 text-green-600"
          />
          <StatCard
            icon={ClockIcon}
            label="میانگین زمان تعمیر"
            value={
              stats.avg_repair_days
                ? `${Math.round(stats.avg_repair_days)} روز`
                : "—"
            }
            color="bg-orange-100 text-orange-600"
          />
        </div>
      )}

      {/* تاریخچه دستگاه‌ها */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800">
            تاریخچه دستگاه‌ها
          </h2>
          <Link
            to={`/devices/new?customer_id=${id}`}
            className="text-sm text-blue-600 hover:underline"
          >
            + افزودن دستگاه
          </Link>
        </div>
        <DeviceTimeline devices={devices} />
      </div>
    </div>
  );
}
