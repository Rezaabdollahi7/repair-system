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
  Cog6ToothIcon,
  DocumentIcon,
} from "@heroicons/react/24/solid";
import { getBaseUrl } from "../utils/helpers";

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
    } catch {
      toast.error("خطا در آپلود تصویر");
    } finally {
      setUploading(false);
    }
  };

  const baseUrl = getBaseUrl();

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
      </label>
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-3 sm:p-4 text-center">
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
          <PhotoIcon className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-gray-400 mb-2" />
        )}
        <label className="cursor-pointer inline-block mt-2">
          <span className="bg-blue-50 text-blue-700 px-2 sm:px-3 py-1 rounded-lg text-xs sm:text-sm hover:bg-blue-100 transition">
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

function ToggleSwitch({ label, description, checked, onChange }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 gap-2">
      <div>
        <span className="text-sm font-medium text-gray-700">{label}</span>
        {description && <p className="text-xs text-gray-500">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${
          checked ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <span
          className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
            checked ? "-translate-x-1" : "-translate-x-6"
          }`}
        />
      </button>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("company");
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
    sale_invoice_paper_size: "A5",
    sale_invoice_show_logo: true,
    sale_invoice_show_company_info: true,
    sale_invoice_show_email: false,
    sale_invoice_show_website: false,
    sale_invoice_show_device_info: false,
    sale_invoice_show_customer_phone: false,
    sale_invoice_show_discount: false,
    sale_invoice_show_tax: false,
    sale_invoice_show_stamp: false,
    sale_invoice_show_signature: false,
    sale_invoice_show_warranty: false,
    sale_invoice_show_technician: false,
    sale_invoice_header_text: "",
    sale_invoice_footer_text: "با تشکر از اعتماد شما",
  });

  if (user?.role !== "super_admin") {
    return <Navigate to="/dashboard" replace />;
  }

  useEffect(() => {
    getSettings()
      .then((res) => {
        const data = res.data;
        setSettings({
          ...data,
          sale_invoice_show_logo: data.sale_invoice_show_logo === 1,
          sale_invoice_show_company_info:
            data.sale_invoice_show_company_info === 1,
          sale_invoice_show_email: data.sale_invoice_show_email === 1,
          sale_invoice_show_website: data.sale_invoice_show_website === 1,
          sale_invoice_show_device_info:
            data.sale_invoice_show_device_info === 1,
          sale_invoice_show_customer_phone:
            data.sale_invoice_show_customer_phone === 1,
          sale_invoice_show_discount: data.sale_invoice_show_discount === 1,
          sale_invoice_show_tax: data.sale_invoice_show_tax === 1,
          sale_invoice_show_stamp: data.sale_invoice_show_stamp === 1,
          sale_invoice_show_signature: data.sale_invoice_show_signature === 1,
          sale_invoice_show_warranty: data.sale_invoice_show_warranty === 1,
          sale_invoice_show_technician: data.sale_invoice_show_technician === 1,
        });
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

  const handleToggle = (name, value) => {
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (type, path) => {
    setSettings((prev) => ({ ...prev, [type]: path }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      const payload = {
        ...settings,
        sale_invoice_show_logo: settings.sale_invoice_show_logo ? 1 : 0,
        sale_invoice_show_company_info: settings.sale_invoice_show_company_info
          ? 1
          : 0,
        sale_invoice_show_email: settings.sale_invoice_show_email ? 1 : 0,
        sale_invoice_show_website: settings.sale_invoice_show_website ? 1 : 0,
        sale_invoice_show_device_info: settings.sale_invoice_show_device_info
          ? 1
          : 0,
        sale_invoice_show_customer_phone:
          settings.sale_invoice_show_customer_phone ? 1 : 0,
        sale_invoice_show_discount: settings.sale_invoice_show_discount ? 1 : 0,
        sale_invoice_show_tax: settings.sale_invoice_show_tax ? 1 : 0,
        sale_invoice_show_stamp: settings.sale_invoice_show_stamp ? 1 : 0,
        sale_invoice_show_signature: settings.sale_invoice_show_signature
          ? 1
          : 0,
        sale_invoice_show_warranty: settings.sale_invoice_show_warranty ? 1 : 0,
        sale_invoice_show_technician: settings.sale_invoice_show_technician
          ? 1
          : 0,
      };

      await updateSettings(payload);
      toast.success("تنظیمات با موفقیت ذخیره شد");
    } catch {
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

  const tabs = [
    { id: "company", label: "اطلاعات شرکت", icon: BuildingOfficeIcon },
    { id: "images", label: "تصاویر", icon: PhotoIcon },
    { id: "invoice", label: "پیش‌فرض فاکتور", icon: DocumentTextIcon },
    { id: "template", label: "قالب فاکتور فروش", icon: Cog6ToothIcon },
  ];

  return (
    <div dir="rtl" className="px-2 sm:px-4 mx-auto">
      <h1 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4 sm:mb-6 flex gap-2 items-center">
        <Cog6ToothIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-600" />
        تنظیمات
      </h1>

      <div className="border-b border-gray-200 mb-4 sm:mb-6 overflow-x-auto">
        <nav className="flex gap-3 sm:gap-6 min-w-max">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-1 py-2 sm:py-3 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                <Icon className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-xs sm:text-sm font-medium whitespace-nowrap">
                  {tab.label}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {activeTab === "company" && (
          <div className="bg-white shadow rounded-lg p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <BuildingOfficeIcon className="w-5 h-5 text-gray-600" />
              اطلاعات شرکت
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  نام شرکت/تعمیرگاه
                </label>
                <input
                  type="text"
                  name="company_name"
                  value={settings.company_name || ""}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                  placeholder="مثلاً: تعمیرگاه تخصصی الکترونیک"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  شماره تماس
                </label>
                <input
                  type="text"
                  name="company_phone"
                  value={settings.company_phone || ""}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
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
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
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
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
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
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                  placeholder="www.example.com"
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === "images" && (
          <div className="bg-white shadow rounded-lg p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <PhotoIcon className="w-5 h-5 text-gray-600" />
              تصاویر
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
          </div>
        )}

        {activeTab === "invoice" && (
          <div className="bg-white shadow rounded-lg p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-gray-600" />
              تنظیمات پیش‌فرض فاکتور
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  پیشوند شماره فاکتور
                </label>
                <input
                  type="text"
                  name="invoice_prefix"
                  value={settings.invoice_prefix || "INV-"}
                  onChange={handleChange}
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
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
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
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
                  className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-3 sm:mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                متن ثابت پایین فاکتور (برای فاکتور تعمیر)
              </label>
              <textarea
                name="invoice_footer_text"
                value={settings.invoice_footer_text || ""}
                onChange={handleChange}
                rows="2"
                className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                placeholder="مثلاً: با تشکر از اعتماد شما - تحویل گرفته شد"
              />
            </div>
          </div>
        )}

        {activeTab === "template" && (
          <div className="bg-white shadow rounded-lg p-4 sm:p-6 overflow-x-auto">
            <h2 className="text-base sm:text-lg font-medium text-gray-900 mb-3 sm:mb-4 flex items-center gap-2">
              <Cog6ToothIcon className="w-5 h-5 text-gray-600" />
              قالب فاکتور فروش
            </h2>

            <div className="space-y-4 sm:space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اندازه کاغذ
                </label>
                <select
                  name="sale_invoice_paper_size"
                  value={settings.sale_invoice_paper_size || "A5"}
                  onChange={handleChange}
                  className="w-full sm:w-64 border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm bg-white"
                >
                  <option value="A4">A4 - حرفه‌ای (کامل)</option>
                  <option value="A5">A5 - نیمه‌حرفه‌ای (متوسط)</option>
                  <option value="Thermal">Thermal - رسید فروشگاهی</option>
                </select>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  بخش‌های قابل نمایش
                </h3>
                <div className="space-y-1 border border-gray-200 rounded-lg divide-y divide-gray-200">
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش لوگو"
                      checked={settings.sale_invoice_show_logo}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_logo", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش اطلاعات شرکت"
                      checked={settings.sale_invoice_show_company_info}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_company_info", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش ایمیل"
                      checked={settings.sale_invoice_show_email}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_email", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش وب‌سایت"
                      checked={settings.sale_invoice_show_website}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_website", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش اطلاعات دستگاه"
                      checked={settings.sale_invoice_show_device_info}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_device_info", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش شماره تماس مشتری"
                      checked={settings.sale_invoice_show_customer_phone}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_customer_phone", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش تخفیف"
                      checked={settings.sale_invoice_show_discount}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_discount", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش مالیات"
                      checked={settings.sale_invoice_show_tax}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_tax", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش مهر"
                      checked={settings.sale_invoice_show_stamp}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_stamp", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش امضا"
                      checked={settings.sale_invoice_show_signature}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_signature", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش گارانتی"
                      checked={settings.sale_invoice_show_warranty}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_warranty", val)
                      }
                    />
                  </div>
                  <div className="p-2 sm:p-3">
                    <ToggleSwitch
                      label="نمایش تعمیرکار"
                      checked={settings.sale_invoice_show_technician}
                      onChange={(val) =>
                        handleToggle("sale_invoice_show_technician", val)
                      }
                    />
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3">
                  متون سفارشی
                </h3>
                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      متن بالای فاکتور
                    </label>
                    <textarea
                      name="sale_invoice_header_text"
                      value={settings.sale_invoice_header_text || ""}
                      onChange={handleChange}
                      rows="2"
                      className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                      placeholder="متن دلخواه برای بالای فاکتور..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      متن پایین فاکتور
                    </label>
                    <textarea
                      name="sale_invoice_footer_text"
                      value={
                        settings.sale_invoice_footer_text ||
                        "با تشکر از اعتماد شما"
                      }
                      onChange={handleChange}
                      rows="2"
                      className="w-full border border-gray-300 rounded-lg px-3 sm:px-4 py-2 text-sm"
                      placeholder="متن دلخواه برای پایین فاکتور..."
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-center">
          <button
            type="submit"
            disabled={saving}
            className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 text-sm sm:text-base"
          >
            <CheckCircleIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
          </button>
        </div>
      </form>
    </div>
  );
}
