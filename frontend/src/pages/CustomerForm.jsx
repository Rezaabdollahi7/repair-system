// src/pages/CustomerForm.jsx
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createCustomer, updateCustomer, getCustomer } from "../api";
import { toast } from "react-hot-toast";
import { UserIcon, PhoneIcon } from "@heroicons/react/24/outline";

export default function CustomerForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState({ name: "", phone: "" });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
    if (!isEdit) return;
    const fetchCustomer = async () => {
      try {
        const res = await getCustomer(id);
        setForm({
          name: res.data.name || "",
          phone: res.data.phone || "",
        });
      } catch {
        toast.error("خطا در بارگذاری اطلاعات");
        navigate("/customers");
      } finally {
        setFetching(false);
      }
    };
    fetchCustomer();
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("نام الزامی است");
      return;
    }
    if (!form.phone.trim()) {
      toast.error("شماره تماس الزامی است");
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        await updateCustomer(id, form);
        toast.success("مشتری ویرایش شد");
        navigate(`/customers/${id}`);
      } else {
        const res = await createCustomer(form);
        toast.success("مشتری اضافه شد");
        navigate(`/customers/${res.data.id}`);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در ذخیره‌سازی");
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-md mx-auto">
      <div className="bg-white rounded-lg shadow p-6">
        {/* هدر */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-100 rounded-lg">
            <UserIcon className="w-6 h-6 text-blue-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            {isEdit ? "ویرایش مشتری" : "افزودن مشتری جدید"}
          </h1>
        </div>

        {/* فرم */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* نام */}
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

          {/* شماره تماس */}
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

          {/* دکمه‌ها */}
          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading
                ? "در حال ذخیره..."
                : isEdit
                  ? "ذخیره تغییرات"
                  : "افزودن مشتری"}
            </button>
            <button
              type="button"
              onClick={() =>
                navigate(isEdit ? `/customers/${id}` : "/customers")
              }
              className="flex-1 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
