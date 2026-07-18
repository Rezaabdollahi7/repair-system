import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api";
import { getDeviceImages } from "../api";
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
  UserGroupIcon,
} from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";
import LoadingSpinner from "./LoadingSpinner";
import { getImageUrl } from "../utils/helpers";

const STATUS_MAP = {
  pending: { label: "در انتظار بررسی", color: "bg-yellow-100 text-yellow-800" },
  diagnosing: { label: "در حال بررسی", color: "bg-cyan-100 text-cyan-800" },
  waiting_for_parts: {
    label: "در انتظار قطعه",
    color: "bg-orange-100 text-orange-800",
  },
  repairing: { label: "در حال تعمیر", color: "bg-purple-100 text-purple-800" },
  repaired: { label: "تعمیر شده", color: "bg-green-100 text-green-800" },
  delivered: { label: "تحویل داده شده", color: "bg-green-100 text-green-800" },
  unrepairable: { label: "غیرقابل تعمیر", color: "bg-red-100 text-red-800" },
  ready_for_pickup: {
    label: "آماده تحویل",
    color: "bg-blue-100 text-blue-800",
  },
  not_repaired: { label: "تعمیر نشد", color: "bg-orange-100 text-red-800" },
};

function InfoRow({ label, value }) {
  return (
    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center border-b border-gray-100 pb-2 sm:pb-3 mb-2 sm:mb-3 last:border-0">
      <span className="text-xs sm:text-sm text-gray-500 mb-1 sm:mb-0">
        {label}
      </span>
      <span className="text-sm sm:text-base text-gray-800 font-medium break-words">
        {value || "—"}
      </span>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, count }) {
  return (
    <div className="flex items-center gap-2 mb-3 sm:mb-4 pb-2 border-b border-blue-100">
      <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600" />
      <span className="text-sm sm:text-base font-semibold text-gray-700">
        {title}
      </span>
      {count !== undefined && (
        <span className="bg-blue-100 text-blue-600 text-xs px-1.5 sm:px-2 py-0.5 rounded-full mr-1">
          {count}
        </span>
      )}
    </div>
  );
}

export default function DeviceDetailModal({
  deviceId,
  isOpen,
  onClose,
  onEdit,
}) {
  const [device, setDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sliderIndex, setSliderIndex] = useState(null);
  const { isAtLeast } = useAuth();

  useEffect(() => {
    if (isOpen && deviceId) {
      fetchDevice();
      fetchImages();
    }
  }, [isOpen, deviceId]);

  async function fetchDevice() {
    try {
      setLoading(true);
      const res = await api.get(`/devices/${deviceId}`);
      setDevice(res.data);
    } catch {
      toast.error("خطا در دریافت اطلاعات دستگاه");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  async function fetchImages() {
    try {
      const res = await getDeviceImages(deviceId);
      setImages(res.data);
    } catch {
      setImages([]);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      await api.delete(`/devices/${deviceId}`);
      toast.success("دستگاه با موفقیت حذف شد");
      setShowDeleteModal(false);
      onClose();
    } catch {
      toast.error("خطا در حذف دستگاه");
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fa-IR");
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-2 sm:my-8 animate-in fade-in zoom-in duration-200"
        dir="rtl"
      >
        {/* هدر با تم آبی */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-blue-100 px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-xl">
              <DevicePhoneMobileIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-gray-900">
                جزئیات دستگاه
              </h2>
              {device && (
                <p className="text-xs text-gray-500 mt-0.5 hidden sm:block">
                  شماره پذیرش: {device.id}
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

        {/* محتوا */}
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="md" text="در حال بارگذاری..." />
            </div>
          ) : device ? (
            <div className="space-y-4 sm:space-y-6">
              {/* کارت اطلاعات اصلی - در موبایل ستونی */}
              <div className="bg-gradient-to-r from-blue-50 to-white rounded-2xl p-4 sm:p-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 mb-1">شماره پذیرش</p>
                    <p className="text-lg sm:text-xl font-bold text-blue-600 font-mono">
                      {device.id}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">تاریخ پذیرش</p>
                    <p className="text-sm sm:text-base text-gray-800 font-medium flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                      {formatDate(device.entry_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">تاریخ تحویل</p>
                    <p className="text-sm sm:text-base text-gray-800 font-medium flex items-center gap-1">
                      <CalendarIcon className="w-3.5 h-3.5 text-gray-400" />
                      {formatDate(device.exit_date)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-1">وضعیت</p>
                    <span
                      className={`inline-block px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium ${STATUS_MAP[device.status]?.color || "bg-gray-100 text-gray-800"}`}
                    >
                      {STATUS_MAP[device.status]?.label || device.status}
                    </span>
                  </div>
                </div>

                {/* مسئولین - در موبایل با wrapping بهتر */}
                <div className="mt-4 pt-4 border-t border-blue-100">
                  <p className="text-xs text-gray-500 mb-2">مسئولین تعمیر</p>
                  {device.assignees && device.assignees.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {device.assignees.map((person) => (
                        <span
                          key={person.id}
                          className="px-2 py-1 sm:px-3 sm:py-2 bg-purple-100 text-purple-700 rounded-full text-xs sm:text-sm font-medium"
                        >
                          {person.name || person.username}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-xs sm:text-sm">
                      مسئولی تعیین نشده
                    </p>
                  )}
                </div>
              </div>

              {/* اطلاعات دستگاه و مشتری - گرید ریسپانسیو */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                {/* اطلاعات دستگاه */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
                  <SectionTitle icon={TagIcon} title="اطلاعات دستگاه" />
                  <div className="space-y-1">
                    <InfoRow label="نوع دستگاه" value={device.device_name} />
                    <InfoRow label="برند" value={device.brand} />
                    <InfoRow label="مدل" value={device.model} />
                    <InfoRow label="شماره سریال" value={device.serial_number} />
                  </div>
                </div>

                {/* اطلاعات مشتری */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5">
                  <SectionTitle icon={UserIcon} title="اطلاعات مشتری" />
                  <div className="space-y-1">
                    <InfoRow label="نام مشتری" value={device.customer_name} />
                    <InfoRow label="شماره تماس" value={device.customer_phone} />
                  </div>
                </div>

                {/* توضیحات - عرض کامل */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 md:col-span-2">
                  <SectionTitle
                    icon={ClipboardDocumentListIcon}
                    title="توضیحات"
                  />
                  <p className="text-sm sm:text-base text-gray-700 leading-relaxed break-words">
                    {device.description || "—"}
                  </p>
                </div>

                {/* عکس‌ها - عرض کامل */}
                {images.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 sm:p-5 md:col-span-2">
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
                            src={getImageUrl(
                              "/uploads/devices/" + img.filename,
                            )}
                            alt={img.filename}
                            className="w-full h-24 sm:h-28 md:h-32 object-cover rounded-lg border border-gray-200 group-hover:border-blue-400 group-hover:shadow-md transition-all"
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

        {/* فوتر با دکمه‌های اقدام */}
        <div className="sticky bottom-0 bg-gray-50 rounded-b-2xl border-t border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          {device && (
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-xs text-gray-400 order-2 sm:order-1">
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
              className="flex-1 sm:flex-none px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors text-sm"
            >
              بستن
            </button>
            <button
              onClick={() => {
                onClose();
                onEdit && onEdit(deviceId);
              }}
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors text-sm flex items-center justify-center gap-1 shadow-sm"
            >
              <PencilSquareIcon className="w-4 h-4" />
              ویرایش
            </button>
            {isAtLeast("admin") && (
              <button
                onClick={() => setShowDeleteModal(true)}
                className="flex-1 sm:flex-none px-4 py-2 bg-red-500 text-white rounded-xl hover:bg-red-600 transition-colors text-sm flex items-center justify-center gap-1"
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
