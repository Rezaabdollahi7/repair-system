// src/pages/Settings.jsx
import { useState, useEffect } from "react";
import { getSettings, updateSettings, uploadSettingImage } from "../api";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import {
  BuildingOfficeIcon,
  PhotoIcon,
  CurrencyDollarIcon,
  DocumentTextIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";

function ImageUploadBox({ label, imagePath, type, onUpload }) {
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      const res = await uploadSettingImage(type, file);
      onUpload(res.data.path);
      toast.success(`${label} با موفقیت آپلود شد`);
    } catch (error) {
      toast.error("خطا در آپلود تصویر");
    } finally {
      setUploading(false);
    }
  };

  const baseUrl = "http://localhost:5001";

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
        {imagePath ? (
          <div className="space-y-2">
            <img
              src={baseUrl + imagePath}
              alt={label}
              className="max-h-32 mx-auto object-contain"
            />
            <p className="text-xs text-gray-500">تصویر آپلود شده</p>
          </div>
        ) : (
          <PhotoIcon className="w-12 h-12 mx-auto text-gray-400 mb-2" />
        )}
        <label className="cursor-pointer inline-block mt-2">
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-lg text-sm hover:bg-blue-100 transition">
            {uploading ? "در حال آپلود..." : "انتخاب تصویر"}
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="hidden"
          />
        </label>
        <p className="text-xs text-gray-400 mt-1">PNG, JPG تا ۵MB</p>
      </div>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    company_name: "",
    company_address: "",
    company_phone: "",
    company_email: "",
    company_website: "",
    company_logo: "",
    stamp_image: "",
    signature_image: "",
    default_tax_rate: 0,
    default_warranty_months: 3,
    invoice_prefix: "INV-",
    invoice_footer_text: "",
  });

  // Only super_admin can access
  if (user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    getSettings()
      .then((res) => {
        setSettings(res.data);
      })
      .catch(() => {
        toast.error("خطا در دریافت تنظیمات");
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setSettings((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? 0 : Number(value)) : value,
    }));
  };

  const handleImageUpload = (type, path) => {
    setSettings((prev) => ({ ...prev, [type]: path }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      await updateSettings(settings);
      toast.success("تنظیمات با موفقیت ذخیره شد");
    } catch (error) {
      toast.error("خطا در ذخیره تنظیمات");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64" dir="rtl">
        <div className="text-gray-500">در حال بارگذاری...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">تنظیمات شرکت</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Information */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <BuildingOfficeIcon className="w-5 h-5 text-gray-600" />
            اطلاعات شرکت
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                نام شرکت/تعمیرگاه
              </label>
              <input
                type="text"
                name="company_name"
                value={settings.company_name || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                placeholder="مثلاً: تعمیرگاه تخصصی الکترونیک"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                شماره تماس (می‌توانید چند شماره وارد کنید)
              </label>
              <input
                type="text"
                name="company_phone"
                value={settings.company_phone || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                placeholder="مثلاً: 021-12345678, 09123456789"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                آدرس
              </label>
              <textarea
                name="company_address"
                value={settings.company_address || ""}
                onChange={handleChange}
                rows="2"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                placeholder="آدرس کامل تعمیرگاه..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ایمیل
              </label>
              <input
                type="email"
                name="company_email"
                value={settings.company_email || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                placeholder="info@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                وب‌سایت
              </label>
              <input
                type="text"
                name="company_website"
                value={settings.company_website || ""}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
                placeholder="www.example.com"
              />
            </div>
          </div>
        </div>

        {/* Images */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <PhotoIcon className="w-5 h-5 text-gray-600" />
            تصاویر فاکتور
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <ImageUploadBox
              label="لوگوی شرکت"
              imagePath={settings.company_logo}
              type="logo"
              onUpload={(path) => handleImageUpload("company_logo", path)}
            />
            <ImageUploadBox
              label="مهر"
              imagePath={settings.stamp_image}
              type="stamp"
              onUpload={(path) => handleImageUpload("stamp_image", path)}
            />
            <ImageUploadBox
              label="امضا"
              imagePath={settings.signature_image}
              type="signature"
              onUpload={(path) => handleImageUpload("signature_image", path)}
            />
          </div>
          <p className="text-xs text-gray-500 mt-3">
            * این تصاویر در فاکتورهای چاپی استفاده خواهند شد
          </p>
        </div>

        {/* Invoice Defaults */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4 flex items-center gap-2">
            <DocumentTextIcon className="w-5 h-5 text-gray-600" />
            تنظیمات پیش‌فرض فاکتور
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                پیشوند شماره فاکتور
              </label>
              <input
                type="text"
                name="invoice_prefix"
                value={settings.invoice_prefix || "INV-"}
                onChange={handleChange}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                نرخ مالیات پیش‌فرض (%)
              </label>
              <input
                type="number"
                name="default_tax_rate"
                value={settings.default_tax_rate || 0}
                onChange={handleChange}
                min="0"
                max="100"
                step="0.5"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                مدت گارانتی پیش‌فرض (ماه)
              </label>
              <input
                type="number"
                name="default_warranty_months"
                value={settings.default_warranty_months || 3}
                onChange={handleChange}
                min="0"
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              متن ثابت پایین فاکتور
            </label>
            <textarea
              name="invoice_footer_text"
              value={settings.invoice_footer_text || ""}
              onChange={handleChange}
              rows="2"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              placeholder="مثلاً: با تشکر از اعتماد شما - تحویل گرفته شد"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            <CheckCircleIcon className="w-5 h-5" />
            {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
          </button>
        </div>
      </form>
    </div>
  );
}
