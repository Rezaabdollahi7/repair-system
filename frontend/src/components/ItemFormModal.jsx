// src/components/ItemFormModal.jsx
import { useState, useEffect } from "react";
import { getItem, createItem, updateItem, getCategories } from "../api";
import toast from "react-hot-toast";
import { XMarkIcon, CubeIcon } from "@heroicons/react/24/solid";

const unitOptions = [
  { value: "عدد", label: "عدد" },
  { value: "متر", label: "متر" },
  { value: "کیلوگرم", label: "کیلوگرم" },
  { value: "بسته", label: "بسته" },
  { value: "کارتن", label: "کارتن" },
  { value: "لیتر", label: "لیتر" },
];

export default function ItemFormModal({ itemId, isOpen, onClose, onSuccess }) {
  const isEditMode = Boolean(itemId);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [categories, setCategories] = useState([]);
  const [errors, setErrors] = useState({});
  const [formData, setFormData] = useState({
    code: "",
    name: "",
    categoryId: "",
    unit: "عدد",
    minStock: 0,
    description: "",
  });

  useEffect(() => {
    if (isOpen) {
      getCategories()
        .then((res) => {
          const cats = res.data?.data || res.data || [];
          setCategories(Array.isArray(cats) ? cats : []);
        })
        .catch(() => {});

      if (isEditMode) {
        getItem(itemId)
          .then((res) => {
            const item = res.data;
            setFormData({
              code: item.code || "",
              name: item.name || "",
              categoryId: item.categoryId || "",
              unit: item.unit || "عدد",
              minStock: item.minStock || 0,
              description: item.description || "",
            });
          })
          .catch(() => {
            toast.error("خطا در دریافت اطلاعات کالا");
            onClose();
          })
          .finally(() => setInitialLoading(false));
      } else {
        setFormData({
          code: "",
          name: "",
          categoryId: "",
          unit: "عدد",
          minStock: 0,
          description: "",
        });
        setInitialLoading(false);
      }
    }
  }, [isOpen, itemId, isEditMode]);

  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
    }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: null }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.code?.trim()) newErrors.code = "کد کالا الزامی است";
    if (!formData.name?.trim()) newErrors.name = "نام کالا الزامی است";
    if (!formData.unit?.trim()) newErrors.unit = "واحد کالا الزامی است";
    if (formData.minStock < 0)
      newErrors.minStock = "حداقل موجودی نمی‌تواند منفی باشد";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("لطفاً خطاهای فرم را برطرف کنید");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        categoryId: formData.categoryId || null,
        unit: formData.unit.trim(),
        minStock: formData.minStock,
        description: formData.description?.trim() || null,
      };
      if (isEditMode) {
        await updateItem(itemId, payload);
        toast.success("کالا با موفقیت ویرایش شد");
      } else {
        await createItem(payload);
        toast.success("کالا با موفقیت ثبت شد");
      }
      onSuccess && onSuccess();
      onClose();
    } catch (error) {
      const errorMessage = error.response?.data?.error;
      if (errorMessage?.includes("کد کالا قبلاً ثبت شده")) {
        setErrors((prev) => ({ ...prev, code: "این کد قبلاً ثبت شده است" }));
        toast.error("کد کالا تکراری است");
      } else {
        toast.error(errorMessage || "خطا در ذخیره کالا");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;
  if (initialLoading) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl my-8"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <CubeIcon className="w-5 h-5 text-gray-600" />
            {isEditMode ? `ویرایش کالا #${itemId}` : "ثبت کالای جدید"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                کد کالا <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                disabled={loading}
                className={`w-full border rounded-lg px-4 py-2 text-sm ${errors.code ? "border-red-500" : "border-gray-300"}`}
                placeholder="مثلاً: CAP-1000-16"
              />
              {errors.code && (
                <p className="mt-1 text-xs text-red-600">{errors.code}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                نام کالا <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
                className={`w-full border rounded-lg px-4 py-2 text-sm ${errors.name ? "border-red-500" : "border-gray-300"}`}
                placeholder="مثلاً: خازن ۱۰۰۰ میکروفاراد ۱۶ ولت"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                دسته‌بندی
              </label>
              <select
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                disabled={loading}
                className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white"
              >
                <option value="">بدون دسته‌بندی</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                واحد شمارش <span className="text-red-500">*</span>
              </label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                disabled={loading}
                className={`w-full border rounded-lg px-4 py-2 text-sm bg-white ${errors.unit ? "border-red-500" : "border-gray-300"}`}
              >
                {unitOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p className="mt-1 text-xs text-red-600">{errors.unit}</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                حداقل موجودی (هشدار)
              </label>
              <input
                type="number"
                name="minStock"
                value={formData.minStock}
                onChange={handleChange}
                disabled={loading}
                min="0"
                step="1"
                className={`w-full border rounded-lg px-4 py-2 text-sm ${errors.minStock ? "border-red-500" : "border-gray-300"}`}
              />
              {errors.minStock && (
                <p className="mt-1 text-xs text-red-600">{errors.minStock}</p>
              )}
              <p className="mt-1 text-xs text-gray-500">
                وقتی موجودی به این عدد برسد، هشدار کم‌موجودی نمایش داده می‌شود
              </p>
            </div>
            {isEditMode && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  موجودی فعلی
                </label>
                <div className="text-2xl font-bold text-gray-900">
                  {formData.currentStock || 0} {formData.unit}
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  برای تغییر موجودی از بخش فاکتور خرید یا فروش استفاده کنید
                </p>
              </div>
            )}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              توضیحات
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              disabled={loading}
              rows="3"
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm"
              placeholder="توضیحات اضافی درباره کالا..."
            />
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading
                ? "در حال ذخیره..."
                : isEditMode
                  ? "ویرایش کالا"
                  : "ثبت کالا"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
