import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
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
} from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";
import LoadingSpinner from "./LoadingSpinner";
import { formatPersianPhone, toPersianDigits } from "../utils/formatters";
import type { Customer, CustomerDevice, CustomerStats, Id } from "../types/api";
import { modalPanel } from "../motion";
import DeviceStatusBadge from "./DeviceStatusBadge";

/**
 * Neither map covers "received", the schema's default, so a device nobody
 * has touched yet falls through to its raw status. Left as it was.
 */
function toJalali(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR");
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  color: string;
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  return (
    <div className="bg-surface rounded-card shadow-sm border border-border p-3 sm:p-4 flex items-center gap-3 sm:gap-4 hover:shadow-md transition-shadow">
      <div className={`p-2 sm:p-3 rounded-full ${color} shrink-0`}>
        <Icon className="w-5 h-5 sm:w-6 sm:h-6" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-body-xs sm:text-body-sm text-text-secondary truncate">
          {label}
        </p>
        <p className="text-base sm:text-xl font-bold text-text-primary">
          {value}
        </p>
      </div>
    </div>
  );
}

interface DeviceTimelineProps {
  devices: CustomerDevice[];
  openDeviceDetail: (deviceId: number) => void;
}

function DeviceTimeline({ devices, openDeviceDetail }: DeviceTimelineProps) {
  if (!devices.length) {
    return (
      <div className="text-center py-10 text-text-secondary">
        <DevicePhoneMobileIcon className="w-12 h-12 mx-auto mb-3 text-text-secondary" />
        <p>هیچ دستگاهی ثبت نشده</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Vertical timeline, hidden on mobile */}
      <div className="hidden sm:block absolute right-5 top-0 bottom-0 w-0.5 bg-border" />
      <div className="space-y-3 sm:space-y-4">
        {devices.map((device) => (
          <div
            key={device.id}
            className="relative flex items-start gap-3 sm:gap-4 pr-6 sm:pr-12"
          >
            {/* Timeline dot */}
            <div className="absolute right-2 sm:right-3 mt-2 sm:mt-1.5 w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-surface border-2 border-primary z-10 shadow-sm" />

            {/* Device card */}
            <button
              onClick={() => openDeviceDetail(device.id)}
              className="flex-1 bg-surface rounded-card shadow-sm border border-border p-3 sm:p-4 hover:border-primary-soft hover:shadow-md transition-all text-right group"
            >
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text-primary text-body-sm sm:text-base truncate">
                    {device.device_name}
                    <span className="text-text-secondary text-body-xs mr-1">
                      (#{device.id})
                    </span>
                  </p>
                  {device.brand && (
                    <p className="text-body-xs sm:text-body-sm text-text-secondary mt-0.5 truncate">
                      {device.brand}
                      {device.model && ` · ${device.model}`}
                    </p>
                  )}
                </div>
                <span className="self-start sm:self-center">
                  <DeviceStatusBadge status={device.status} />
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:gap-4 mt-2 sm:mt-3 text-body-xs text-text-secondary">
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
                <p className="mt-2 text-body-xs text-text-secondary line-clamp-2 break-words">
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

interface CustomerDetailModalProps {
  customerId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (customerId: Id) => void;
  zIndex?: number;
}

export default function CustomerDetailModal({
  customerId,
  isOpen,
  onClose,
  onEdit,
}: CustomerDetailModalProps) {
  const { isAtLeast } = useAuth();
  const { openDeviceDetail, openCustomerEdit } = useModal();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [devices, setDevices] = useState<CustomerDevice[]>([]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, customerId]);

  const handleDelete = async () => {
    if (!customerId) return;
    setDeleting(true);
    try {
      await deleteCustomer(customerId);
      toast.success("مشتری حذف شد");
      setShowDeleteConfirm(false);
      onClose();
    } catch (err) {
      const message =
        (axios.isAxiosError(err) &&
          (err.response?.data as { error?: string } | undefined)?.error) ||
        "خطا در حذف";
      toast.error(message);
    } finally {
      setDeleting(false);
    }
  };

  const handleEdit = () => {
    if (!customerId) return;
    onClose();
    if (onEdit) {
      onEdit(customerId);
    } else if (openCustomerEdit) {
      openCustomerEdit(customerId);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-3xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 z-20 bg-surface rounded-t-card border-b border-primary-soft px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary-soft p-2 rounded-card">
              <UserIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary">
                جزئیات مشتری
              </h2>
              {customer && (
                <p className="text-body-xs text-text-secondary mt-0.5 hidden sm:block">
                  عضویت: {toJalali(customer.created_at)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field transition-colors"
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
              {/* Customer card */}
              <div className="bg-gradient-to-r from-primary-soft to-surface rounded-card shadow-sm border border-primary-soft p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                      <UserIcon className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg sm:text-2xl font-bold text-text-primary break-words">
                        {customer.name}
                      </h2>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mt-1">
                        <div className="flex items-center gap-1 text-text-secondary text-body-xs sm:text-body-sm">
                          <PhoneIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span className="break-words">
                            {formatPersianPhone(customer.phone)}
                          </span>
                        </div>
                        <div className="hidden sm:block text-border">|</div>
                        <div className="flex items-center gap-1 text-text-secondary text-body-xs">
                          <CalendarIcon className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                          <span>عضویت: {toJalali(customer.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 sm:gap-2 justify-end">
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-primary text-primary-fg text-body-xs sm:text-body-sm rounded-card hover:bg-primary-hover transition-colors shadow-sm"
                    >
                      <PencilIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span className="hidden sm:inline">ویرایش</span>
                      <span className="sm:hidden">ویرایش</span>
                    </button>
                    {isAtLeast("admin") && (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 sm:px-4 sm:py-2 bg-danger-soft text-danger-fg text-body-xs sm:text-body-sm rounded-card hover:opacity-80 transition-colors"
                      >
                        <TrashIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">حذف</span>
                        <span className="sm:hidden">حذف</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Stats */}
              {stats && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                  <StatCard
                    icon={DevicePhoneMobileIcon}
                    label="کل دستگاه‌ها"
                    value={toPersianDigits(stats.total_devices ?? 0)}
                    color="bg-primary-soft text-primary"
                  />
                  <StatCard
                    icon={CheckCircleIcon}
                    label="تعمیر موفق"
                    value={toPersianDigits(stats.successful_repairs ?? 0)}
                    color="bg-success-soft text-success-fg"
                  />
                  <StatCard
                    icon={ClockIcon}
                    label="میانگین زمان تعمیر"
                    value={
                      stats.avg_repair_days
                        ? `${toPersianDigits(Math.round(Number(stats.avg_repair_days)))} روز`
                        : "—"
                    }
                    color="bg-warning-soft text-warning-fg"
                  />
                </div>
              )}

              {/* Device history */}
              <div className="bg-surface-alt rounded-card p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4 sm:mb-6 pb-2 border-b border-border">
                  <DevicePhoneMobileIcon className="w-5 h-5 text-primary" />
                  <h2 className="text-base sm:text-lg font-semibold text-text-primary">
                    تاریخچه دستگاه‌ها
                  </h2>
                  {devices.length > 0 && (
                    <span className="bg-primary-soft text-primary text-body-xs px-2 py-0.5 rounded-full mr-2">
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
      </motion.div>

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
