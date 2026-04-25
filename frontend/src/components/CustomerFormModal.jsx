// src/components/CustomerFormModal.jsx
import { useState, useEffect } from "react";
import { createCustomer, updateCustomer, getCustomer } from "../api";
import { toast } from "react-hot-toast";
import { XMarkIcon, UserIcon, PhoneIcon } from "@heroicons/react/24/solid";

export default function CustomerFormModal({
  customerId,
  isOpen,
  onClose,
  onSuccess,
}) {
  const isEdit = Boolean(customerId);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEdit) {
        getCustomer(customerId)
          .then((res) =>
            setForm({ name: res.data.name || "", phone: res.data.phone || "" }),
          )
          .catch(() => toast.error("خطا در بارگذاری اطلاعات"));
      } else {
        setForm({ name: "", phone: "" });
      }
    }
  }, [isOpen, customerId, isEdit]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("نام الزامی است");
    if (!form.phone.trim()) return toast.error("شماره تماس الزامی است");

    setLoading(true);
    try {
      if (isEdit) {
        await updateCustomer(customerId, form);
        toast.success("مشتری ویرایش شد");
      } else {
        await createCustomer(form);
        toast.success("مشتری اضافه شد");
      }
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در ذخیره‌سازی");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" dir="rtl">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <UserIcon className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">
              {isEdit ? "ویرایش مشتری" : "افزودن مشتری جدید"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              نام <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <UserIcon className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="نام کامل مشتری"
                className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              شماره تماس <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <PhoneIcon className="absolute right-3 top-2.5 w-4 h-4 text-gray-400" />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="09xxxxxxxxx"
                className="w-full pr-9 pl-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? "در حال ذخیره..."
                : isEdit
                  ? "ذخیره تغییرات"
                  : "افزودن مشتری"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
