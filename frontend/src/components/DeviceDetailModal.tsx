import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { getDevice, deleteDevice, getDeviceImages } from "../api";
import ImageSlider from "./ImageSlider";
import { useAuth } from "../context/AuthContext";
import {
  XMarkIcon,
  PencilSquareIcon,
  TrashIcon,
  UserIcon,
  DevicePhoneMobileIcon,
  TagIcon,
  CalendarIcon,
  ClipboardDocumentListIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";
import LoadingSpinner from "./LoadingSpinner";
import type { Device, Id, ListedDeviceImage } from "../types/api";

/** "received", the schema default, is deliberately absent — as it was. */
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "در انتظار بررسی", color: "bg-warning-soft text-warning" },
  diagnosing: { label: "در حال بررسی", color: "bg-primary-soft text-primary" },
  waiting_for_parts: {
    label: "در انتظار قطعه",
    color: "bg-warning-soft text-warning",
  },
  repairing: { label: "در حال تعمیر", color: "bg-primary-soft text-primary" },
  repaired: { label: "تعمیر شده", color: "bg-success-soft text-success" },
  delivered: { label: "تحویل داده شده", color: "bg-success-soft text-success" },
  unrepairable: { label: "غیرقابل تعمیر", color: "bg-danger-soft text-danger" },
  ready_for_pickup: {
    label: "آماده تحویل",
    color: "bg-primary-soft text-primary",
  },
  not_repaired: { label: "تعمیر نشد", color: "bg-warning-soft text-danger" },
};

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
}

function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-border pb-2 sm:pb-3 mb-2 sm:mb-3 last:border-0">
      <span className="text-xs sm:text-sm text-text-secondary mb-1 sm:mb-0">
        {label}
      </span>
      <span className="text-sm sm:text-base text-text-primary font-medium break-words">
        {value || "—"}
      </span>
    </div>
  );
}

interface SectionTitleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
}

function SectionTitle({ icon: Icon, title, count }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-3 sm:mb-4 pb-2 border-b border-primary-soft">
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
      <span className="text-sm sm:text-base font-semibold text-text-primary">
        {title}
      </span>
      {count !== undefined && (
        <span className="bg-primary-soft text-primary text-xs px-1.5 sm:px-2 py-0.5 rounded-full mr-1">
          {count}
        </span>
      )}
    </div>
  );
}

interface DeviceDetailModalProps {
  deviceId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (deviceId: Id) => void;
  zIndex?: number;
}

export default function DeviceDetailModal({
  deviceId,
  isOpen,
  onClose,
  onEdit,
}: DeviceDetailModalProps) {
  const [device, setDevice] = useState<Device | null>(null);
  const [images, setImages] = useState<ListedDeviceImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sliderIndex, setSliderIndex] = useState<number | null>(null);
  const { isAtLeast } = useAuth();

  useEffect(() => {
    if (isOpen && deviceId) {
      fetchDevice();
      fetchImages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, deviceId]);

  async function fetchDevice() {
    if (!deviceId) return;
    try {
      setLoading(true);
      // Through the named helper rather than a bare api.get: the URL then
      // lives in one place and the response arrives typed.
      const res = await getDevice(deviceId);
      setDevice(res.data);
    } catch {
      toast.error("خطا در دریافت اطلاعات دستگاه");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function fetchImages() {
    if (!deviceId) return;
    try {
      const res = await getDeviceImages(deviceId);
      setImages(res.data);
    } catch {
      setImages([]);
    }
  }

  async function handleDelete() {
    if (!deviceId) return;
    try {
      setDeleting(true);
      await deleteDevice(deviceId);
      toast.success("دستگاه با موفقیت حذف شد");
      setShowDeleteModal(false);
      onClose();
    } catch {
      toast.error("خطا در حذف دستگاه");
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fa-IR");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl my-2 sm:my-8 animate-in fade-in zoom-in duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface rounded-t-2xl border-b border-primary-soft px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary-soft p-2 rounded-xl">
              <DevicePhoneMobileIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary">
                جزئیات دستگاه
              </h2>
              {device && (
                <p className="text-xs text-text-secondary mt-0.5 hidden sm:block">
                  شماره پذیرش: {device.id}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="md" text="در حال بارگذاری..." />
            </div>
          ) : device ? (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary card */}
              <div className="bg-gradient-to-r from-primary-soft to-surface rounded-2xl p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-text-secondary mb-1">
                      شماره پذیرش
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-primary font-mono">
                      {device.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">
                      تاریخ پذیرش
                    </p>
                    <p className="text-sm sm:text-base text-text-primary font-medium flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5 text-text-secondary" />
                      {formatDate(device.entry_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">
                      تاریخ تحویل
                    </p>
                    <p className="text-sm sm:text-base text-text-primary font-medium flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5 text-text-secondary" />
                      {formatDate(device.exit_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary mb-1">وضعیت</p>
                    <span
                      className={`inline-block px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium ${STATUS_MAP[device.status]?.color || "bg-surface-alt text-text-secondary"}`}
                    >
                      {STATUS_MAP[device.status]?.label || device.status}
                    </span>
                  </div>
                </div>

                {/* Assignees */}
                <div className="mt-4 pt-4 border-t border-primary-soft">
                  <p className="text-xs text-text-secondary mb-2">
                    مسئولین تعمیر
                  </p>
                  {device.assignees && device.assignees.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {device.assignees.map((person) => (
                        <span
                          key={person.id}
                          className="px-2 py-1 sm:px-3 sm:py-2 bg-primary-soft text-primary rounded-full text-xs sm:text-sm font-medium"
                        >
                          {person.name || person.username}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-text-secondary text-xs sm:text-sm">
                      مسئولی تعیین نشده
                    </p>
                  )}
                </div>
              </div>

              {/* Device and customer */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* Device */}
                <div className="bg-surface rounded-xl shadow-sm border border-border p-4 sm:p-5">
                  <SectionTitle icon={TagIcon} title="اطلاعات دستگاه" />
                  <div className="space-y-1">
                    <InfoRow label="نوع دستگاه" value={device.device_name} />
                    <InfoRow label="برند" value={device.brand} />
                    <InfoRow label="مدل" value={device.model} />
                    <InfoRow label="شماره سریال" value={device.serial_number} />
                  </div>
                </div>

                {/* Customer */}
                <div className="bg-surface rounded-xl shadow-sm border border-border p-4 sm:p-5">
                  <SectionTitle icon={UserIcon} title="اطلاعات مشتری" />
                  <div className="space-y-1">
                    <InfoRow label="نام مشتری" value={device.customer_name} />
                    <InfoRow label="شماره تماس" value={device.customer_phone} />
                  </div>
                </div>

                {/* Description */}
                <div className="bg-surface rounded-xl shadow-sm border border-border p-4 sm:p-5 md:col-span-2">
                  <SectionTitle
                    icon={ClipboardDocumentListIcon}
                    title="توضیحات"
                  />
                  <p className="text-sm sm:text-base text-text-primary leading-relaxed break-words">
                    {device.description || "—"}
                  </p>
                </div>

                {/* Images */}
                {images.length > 0 && (
                  <div className="bg-surface rounded-xl shadow-sm border border-border p-4 sm:p-5 md:col-span-2">
                    <SectionTitle
                      icon={PhotoIcon}
                      title="عکس‌های دستگاه"
                      count={images.length}
                    />
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3">
                      {images.map((img, i) => (
                        <div
                          key={img.id}
                          onClick={() => setSliderIndex(i)}
                          className="group cursor-pointer"
                        >
                          <img
                            // Signed by the server: the bucket is private, so
                            // the key alone would be useless here.
                            src={img.url}
                            alt={img.filename}
                            className="w-full h-24 sm:h-28 md:h-32 object-cover rounded-lg border border-border group-hover:border-primary group-hover:shadow-md transition-all"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-0 bg-surface-alt rounded-b-2xl border-t border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          {device && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs text-text-secondary order-2 sm:order-1">
              <span className="flex items-center gap-1">
                <CalendarIcon className="w-3 h-3" />
                ثبت: {formatDate(device.created_at)}
              </span>
              <span className="flex items-center gap-1">
                <PencilSquareIcon className="w-3 h-3" />
                آخرین ویرایش: {formatDate(device.updated_at)}
              </span>
            </div>
          )}
          <div className="flex gap-2 w-full sm:w-auto order-1 sm:order-2">
            <button
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2 border border-border rounded-xl text-text-primary hover:bg-surface-alt transition-colors text-sm"
            >
              بستن
            </button>
            <button
              onClick={() => {
                onClose();
                if (deviceId) onEdit?.(deviceId);
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-primary text-text-inverse rounded-xl hover:bg-primary-hover transition-colors text-sm flex items-center justify-center gap-1 shadow-sm"
            >
              <PencilSquareIcon className="w-4 h-4" />
              ویرایش
            </button>
            {isAtLeast("admin") && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-danger text-text-inverse rounded-xl hover:bg-danger-hover transition-colors text-sm flex items-center justify-center gap-1"
              >
                <TrashIcon className="w-4 h-4" />
                حذف
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="حذف دستگاه"
        message={`آیا از حذف دستگاه "${device?.device_name || "#" + deviceId}" مطمئن هستید؟ این عمل قابل بازگشت نیست.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />

      {/* Image Slider */}
      {sliderIndex !== null && (
        <ImageSlider
          images={images}
          initialIndex={sliderIndex}
          onClose={() => setSliderIndex(null)}
        />
      )}
    </div>
  );
}
