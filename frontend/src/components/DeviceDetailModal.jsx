// src/components/DeviceDetailModal.jsx
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
} from "@heroicons/react/24/solid";
import ConfirmModal from "./ConfirmModal";
import LoadingSpinner from "./LoadingSpinner";
import { getImageUrl } from "../utils/helpers";

const STATUS_MAP = {
  pending: { label: "در انتظار بررسی", color: "bg-yellow-100 text-yellow-800" },
  diagnosing: { label: "در حال بررسی", color: "bg-blue-100 text-blue-800" },
  waiting_for_parts: {
    label: "در انتظار قطعه",
    color: "bg-orange-100 text-orange-800",
  },
  repairing: { label: "در حال تعمیر", color: "bg-purple-100 text-purple-800" },
  repaired: { label: "تعمیر شده", color: "bg-gray-100 text-green-800" },
  delivered: { label: "تحویل داده شده", color: "bg-green-100 text-gray-800" },
  unrepairable: { label: "غیرقابل تعمیر", color: "bg-red-100 text-red-800" },
  ready_for_pickup: { label: "آماده تحویل", color: "bg-blue-100 text-red-800" },
  not_repaired: { label: "تعمیر نشد", color: "bg-orange-100 text-red-800" },
};

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
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-gray-800">جزئیات دستگاه</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content - دقیقاً مثل DeviceDetail */}
        <div className="p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
            </div>
          ) : device ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-sm text-gray-500 mb-1">شماره پذیرش</p>
                  <p className="text-2xl font-bold text-blue-600 font-mono tracking-wide">
                    {device.id}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">تاریخ پذیرش</p>
                  <p className="text-gray-800 font-medium">
                    {formatDate(device.entry_date)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">تاریخ تحویل</p>
                  <p className="text-gray-800 font-medium">
                    {formatDate(device.exit_date)}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">وضعیت</p>
                  <span
                    className={`px-4 py-2 rounded-full text-sm font-medium ${STATUS_MAP[device.status]?.color || "bg-gray-100 text-gray-800"}`}
                  >
                    {STATUS_MAP[device.status]?.label || device.status}
                  </span>
                </div>

                <div className="text-right">
                  <p className="text-sm text-gray-500 mb-2">مسئولین تعمیر </p>
                  {device.assignees && device.assignees.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {device.assignees.map((person) => (
                        <span
                          key={person.id}
                          className="px-3 py-2 bg-purple-100 text-purple-800 rounded-full text-sm font-medium"
                        >
                          {person.name || person.username}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">مسئولی تعیین نشده</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2">
                    اطلاعات دستگاه
                  </h2>
                  <InfoRow label="نوع دستگاه" value={device.device_name} />
                  <InfoRow label="برند" value={device.brand} />
                  <InfoRow label="مدل" value={device.model} />
                  <InfoRow label="شماره سریال" value={device.serial_number} />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2">
                    اطلاعات مشتری
                  </h2>
                  <InfoRow label="نام مشتری" value={device.customer_name} />
                  <InfoRow label="شماره تماس" value={device.customer_phone} />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                  <h2 className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2">
                    توضیحات
                  </h2>
                  <p className="text-gray-700 leading-relaxed">
                    {device.description || "—"}
                  </p>
                </div>

                {images.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
                    <h2 className="text-lg font-semibold text-gray-700 border-b border-gray-200 pb-2 mb-4">
                      عکس‌های دستگاه ({images.length})
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {images.map((img, i) => (
                        <img
                          key={img.id}
                          src={getImageUrl("/uploads/devices/" + img.filename)}
                          alt={img.filename}
                          onClick={() => setSliderIndex(i)}
                          className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl ">
          {device && (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex gap-6 text-sm text-gray-500 ml-auto">
              <span>ثبت: {formatDate(device.created_at)}</span>
              <span>آخرین ویرایش: {formatDate(device.updated_at)}</span>
            </div>
          )}
          {isAtLeast("admin") && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm flex items-center gap-1"
            >
              <TrashIcon className="w-4 h-4" />
              حذف
            </button>
          )}
          <button
            onClick={() => {
              onClose();
              onEdit && onEdit(deviceId);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm flex items-center gap-1"
          >
            <PencilSquareIcon className="w-4 h-4" />
            ویرایش
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
          >
            بستن
          </button>
        </div>
      </div>

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="حذف دستگاه"
        message={`آیا از حذف دستگاه "#${deviceId}" مطمئن هستید؟ این عمل قابل بازگشت نیست.`}
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

function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between border-b border-gray-200 pb-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium">{value || "—"}</span>
    </div>
  );
}
