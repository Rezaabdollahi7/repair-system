import { useState, useEffect } from "react";
import {
  getCustomer,
  getCustomerStats,
  getCustomerDevices,
  deleteCustomer,
} from "../api";
import { toast } from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import {
  UserIcon,
  PhoneIcon,
  CalendarIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon,
  ClockIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  EnvelopeIcon,
  MapPinIcon,
} from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";
import LoadingSpinner from "./LoadingSpinner";
import { formatPersianPhone } from "../utils/formatters";

// ── helper ──────────────────────────────────────────────
const statusColor = {
  pending: "bg-yellow-100 text-yellow-700",
  diagnosing: "bg-purple-100 text-purple-700",
  repairing: "bg-orange-100 text-orange-700",
  repaired: "bg-green-100 text-green-700",
  delivered: "bg-blue-100 text-blue-700",
  unrepairable: "bg-red-100 text-red-700",
  not_repaired: "bg-red-100 text-red-700",
  ready_for_pickup: "bg-blue-100 text-blue-700",
  waiting_for_parts: "bg-orange-100 text-orange-700",
};

const statusLabel = {
  pending: "در انتظار",
  diagnosing: "در حال بررسی",
  repairing: "در حال تعمیر",
  repaired: "تعمیر شد",
  delivered: "تحویل داده شد",
  unrepairable: "غیر قابل تعمیر",
  not_repaired: "تعمیر نشد",
  ready_for_pickup: "آماده تحویل",
  waiting_for_parts: "در انتظار قطعه",
};

function toJalali(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR");
}

function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow">
      <div className={`p-2 sm:p-3 rounded-full ${color} shrink-0`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs sm:text-sm text-gray-500 truncate">{label}</p>
        <p className="text-base sm:text-xl font-bold text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function DeviceTimeline({ devices, openDeviceDetail }) {
  if (!devices.length) {
    return (
      <div className="text-center py-10 text-gray-400">
        <DevicePhoneMobileIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>هیچ دستگاهی ثبت نشده</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* خط زمان عمودی - در موبایل مخفی می‌شه */}
      <div className="hidden sm:block absolute right-5 top-0 bottom-0 w-0.5 bg-gray-200" />
      <div className="space-y-3 sm:space-y-4">
        {devices.map((device, index) => (
          <div
            key={device.id}
            className="relative flex items-start gap-3 sm:gap-4 pr-6 sm:pr-12"
          >
            {/* نقطه زمان - در موبایل کوچک‌تر */}
            <div className="absolute right-2 sm:right-3 mt-2 sm:mt-1.5 w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-white border-2 border-blue-400 z-10 shadow-sm" />

            {/* کارت دستگاه */}
            <button
              onClick={() => openDeviceDetail(device.id)}
              className="flex-1 bg-white rounded-xl shadow-sm border border-gray-100 p-3 sm:p-4 hover:border-blue-300 hover:shadow-md transition-all text-right group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm sm:text-base truncate">
                    {device.device_name}
                    <span className="text-gray-400 text-xs mr-1">
                      (#{device.id})
                    </span>
                  </p>
                  {device.brand && (
                    <p className="text-xs sm:text-sm text-gray-500 mt-0.5 truncate">
                      {device.brand}
                      {device.model && ` · ${device.model}`}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full whitespace-nowrap font-medium self-start sm:self-center ${statusColor[device.status] ?? "bg-gray-100 text-gray-600"}`}
                >
                  {statusLabel[device.status] ?? device.status}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 sm:mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                  <span>ورود: {toJalali(device.entry_date)}</span>
                </span>
                {device.exit_date && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                    <span>خروج: {toJalali(device.exit_date)}</span>
                  </span>
                )}
              </div>

              {device.description && (
                <p className="mt-2 text-xs text-gray-500 line-clamp-2 break-words">
                  {device.description}
                </p>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CustomerDetailModal({
  customerId,
  isOpen,
  onClose,
  onEdit,
}) {
  const { isAtLeast } = useAuth();
  const { openDeviceDetail, openCustomerEdit } = useModal();
  const [customer, setCustomer] = useState(null);
  const [stats, setStats] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (isOpen && customerId) {
      setLoading(true);
      Promise.all([
        getCustomer(customerId),
        getCustomerStats(customerId),
        getCustomerDevices(customerId),
      ])
        .then(([custRes, statsRes, devRes]) => {
          setCustomer(custRes.data);
          setStats(statsRes.data);
          setDevices(devRes.data);
        })
        .catch(() => {
          toast.error("خطا در بارگذاری اطلاعات");
          onClose();
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, customerId]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteCustomer(customerId);
      toast.success("مشتری حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در حذف");
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = () => {
    onClose();
    if (onEdit) {
      onEdit(customerId);
    } else if (openCustomerEdit) {
      openCustomerEdit(customerId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-2 sm:my-8 animate-in fade-in zoom-in duration-200"
        dir="rtl"
      >
        {/* هدر با تم آبی */}
        <div className="sticky top-0 z-20 bg-white rounded-t-2xl border-b border-blue-100 px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl">
              <UserIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                جزئیات مشتری
              </h2>
              {customer && (
                <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                  عضویت: {toJalali(customer.created_at)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="md" text="در حال بارگذاری..." />
            </div>
          ) : customer ? (
            <div className="space-y-4 sm:space-y-6">
              {/* کارت اطلاعات مشتری */}
              <div className="bg-gradient-to-r from-blue-50 to-white rounded-2xl shadow-sm border border-blue-100 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                      <UserIcon className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg sm:text-2xl font-bold text-gray-900 break-words">
                        {customer.name}
                      </h2>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1">
                        <div className="flex items-center gap-1 text-gray-500 text-xs sm:text-sm">
                          <PhoneIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="break-words">
                            {formatPersianPhone(customer.phone)}
                          </span>
                        </div>
                        <div className="hidden sm:block text-gray-300">|</div>
                        <div className="flex items-center gap-1 text-gray-400 text-xs">
                          <CalendarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          <span>عضویت: {toJalali(customer.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* دکمه‌های اقدام - در موبایل زیر اطلاعات */}
                  <div className="flex gap-2 sm:gap-2 justify-end">
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 text-white text-xs sm:text-sm rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                    >
                      <PencilIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">ویرایش</span>
                      <span className="sm:hidden">ویرایش</span>
                    </button>
                    {isAtLeast("admin") && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-red-50 text-red-600 text-xs sm:text-sm rounded-xl hover:bg-red-100 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">حذف</span>
                        <span className="sm:hidden">حذف</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* آمار - در موبایل ستونی */}
              {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
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
              <div className="bg-gray-50 rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4 sm:mb-6 pb-2 border-b border-gray-200">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-blue-600" />
                  <h2 className="text-base sm:text-lg font-semibold text-gray-800">
                    تاریخچه دستگاه‌ها
                  </h2>
                  {devices.length > 0 && (
                    <span className="bg-blue-100 text-blue-600 text-xs px-2 py-0.5 rounded-full mr-2">
                      {devices.length}
                    </span>
                  )}
                </div>
                <DeviceTimeline
                  devices={devices}
                  openDeviceDetail={openDeviceDetail}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <ConfirmModal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="حذف مشتری"
        message={`آیا از حذف مشتری "${customer?.name}" مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
