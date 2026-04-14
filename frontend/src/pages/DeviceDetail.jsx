import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../api";
import { getDeviceImages } from "../api";
import ImageSlider from "../components/ImageSlider";
import { useAuth } from "../context/AuthContext";

const STATUS_MAP = {
  pending: { label: "در انتظار بررسی", color: "bg-yellow-100 text-yellow-800" },
  diagnosing: { label: "در حال بررسی", color: "bg-blue-100 text-blue-800" },
  waiting_for_parts: {
    label: "در انتظار قطعه",
    color: "bg-orange-100 text-orange-800",
  },
  repairing: { label: "در حال تعمیر", color: "bg-purple-100 text-purple-800" },
  repaired: { label: "تعمیر شده", color: "bg-green-100 text-green-800" },
  delivered: { label: "تحویل داده شده", color: "bg-gray-100 text-gray-800" },
  unrepairable: { label: "غیرقابل تعمیر", color: "bg-red-100 text-red-800" },
};

export default function DeviceDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [device, setDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sliderIndex, setSliderIndex] = useState(null);
  const { isAtLeast } = useAuth();

  useEffect(() => {
    fetchDevice();
    fetchImages();
  }, [id]);

  async function fetchDevice() {
    try {
      setLoading(true);
      const res = await api.get(`/devices/${id}`);
      setDevice(res.data);
    } catch {
      toast.error("خطا در دریافت اطلاعات دستگاه");
      navigate("/devices");
    } finally {
      setLoading(false);
    }
  }

  async function fetchImages() {
    try {
      const res = await getDeviceImages(id);
      setImages(res.data);
    } catch {
      setImages([]);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      await api.delete(`/devices/${id}`);
      toast.success("دستگاه با موفقیت حذف شد");
      navigate("/devices");
    } catch {
      toast.error("خطا در حذف دستگاه");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fa-IR");
  }

  function formatCurrency(amount) {
    if (!amount) return "—";
    return Number(amount).toLocaleString("fa-IR") + " تومان";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">در حال بارگذاری...</div>
      </div>
    );
  }

  if (!device) return null;

  const status = STATUS_MAP[device.status] ?? {
    label: device.status,
    color: "bg-gray-100 text-gray-800",
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/devices"
            className="text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← بازگشت
          </Link>
          <h1 className="text-2xl font-bold text-gray-800">جزئیات دستگاه</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/devices/${id}/edit`}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
          >
            ویرایش
          </Link>
          {isAtLeast("admin") && (
            <button
              onClick={() => setShowDeleteModal(true)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
            >
              حذف
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">شماره پذیرش</p>
            <p className="text-2xl font-bold text-blue-600 font-mono tracking-wide">
              {device.id}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 mb-1">وضعیت</p>
            <span
              className={`px-4 py-2 rounded-full text-sm font-medium ${status.color}`}
            >
              {status.label}
            </span>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 mb-1">تاریخ پذیرش</p>
            <p className="text-gray-800 font-medium">
              {formatDate(device.created_at)}
            </p>
          </div>
        </div>
      </div>

      {images.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-4">
            📷 عکس‌های دستگاه ({images.length})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {images.map((img, i) => (
              <img
                key={img.id}
                src={`http://localhost:5001/uploads/devices/${img.filename}`}
                alt={img.filename}
                onClick={() => setSliderIndex(i)}
                className="w-full h-32 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 hover:scale-[1.02] transition-all"
              />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
            🔧 اطلاعات دستگاه
          </h2>
          <InfoRow label="نوع دستگاه" value={device.device_name} />
          <InfoRow label="برند" value={device.brand} />
          <InfoRow label="مدل" value={device.model} />
          <InfoRow label="شماره سریال" value={device.serial_number} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
            👤 اطلاعات مشتری
          </h2>
          <InfoRow label="نام مشتری" value={device.customer_name} />
          <InfoRow label="شماره تماس" value={device.customer_phone} />
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
            📋 شرح مشکل
          </h2>
          <p className="text-gray-700 leading-relaxed">
            {device.problem_description || "—"}
          </p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2">
            💰 هزینه‌ها
          </h2>
          <InfoRow
            label="هزینه تخمینی"
            value={formatCurrency(device.estimated_cost)}
          />
          <InfoRow
            label="هزینه نهایی"
            value={formatCurrency(device.final_cost)}
          />
        </div>
      </div>

      {device.notes && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-700 border-b pb-2 mb-4">
            📝 یادداشت‌ها
          </h2>
          <p className="text-gray-700 leading-relaxed">{device.notes}</p>
        </div>
      )}

      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 flex gap-6 text-sm text-gray-500">
        <span>ثبت: {formatDate(device.created_at)}</span>
        <span>آخرین ویرایش: {formatDate(device.updated_at)}</span>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-bold text-gray-800 mb-2">حذف دستگاه</h3>
            <p className="text-gray-600 mb-6">
              آیا از حذف دستگاه{" "}
              <span className="font-semibold text-red-600">{device.id}</span>{" "}
              مطمئن هستید؟ این عمل قابل بازگشت نیست.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                انصراف
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {deleting ? "در حال حذف..." : "حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
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
    <div className="flex justify-between border-b pb-2 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800 font-medium">{value || "—"}</span>
    </div>
  );
}
