// src/pages/ItemForm.jsx
import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { getItem, createItem, updateItem, getCategories } from "../api";
import toast from "react-hot-toast";
import { ArrowRightIcon } from "@heroicons/react/24/solid";

export default function ItemForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id);
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

  // واحدهای پیش‌فرض
  const unitOptions = [
    { value: "عدد", label: "عدد" },
    { value: "متر", label: "متر" },
    { value: "کیلوگرم", label: "کیلوگرم" },
    { value: "بسته", label: "بسته" },
    { value: "کارتن", label: "کارتن" },
    { value: "لیتر", label: "لیتر" },
  ];

  // ─── Fetch Categories & Item Data ─────────────────────────────
  useEffect(() => {
    // دریافت دسته‌بندی‌ها
    getCategories()
      .then((res) => {
        const cats = res.data?.data || res.data || [];
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(() => {
        toast.error("خطا در دریافت دسته‌بندی‌ها");
      });

    // دریافت اطلاعات کالا در حالت ویرایش
    if (isEditMode) {
      getItem(id)
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
          navigate("/items");
        })
        .finally(() => {
          setInitialLoading(false);
        });
    }
  }, [id, isEditMode, navigate]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleChange = (e) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
    }));
    // پاک کردن خطای فیلد
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.code?.trim()) {
      newErrors.code = "کد کالا الزامی است";
    } else if (formData.code.length < 2) {
      newErrors.code = "کد کالا باید حداقل ۲ کاراکتر باشد";
    }

    if (!formData.name?.trim()) {
      newErrors.name = "نام کالا الزامی است";
    }

    if (!formData.unit?.trim()) {
      newErrors.unit = "واحد کالا الزامی است";
    }

    if (formData.minStock < 0) {
      newErrors.minStock = "حداقل موجودی نمی‌تواند منفی باشد";
    }

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
        await updateItem(id, payload);
        toast.success("کالا با موفقیت ویرایش شد");
      } else {
        await createItem(payload);
        toast.success("کالا با موفقیت ثبت شد");
      }
      navigate("/items");
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

  // ─── Render ───────────────────────────────────────────────────
  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-64" dir="rtl">
        <div className="text-gray-500">در حال بارگذاری...</div>
      </div>
    );
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          to="/items"
          className="text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-2"
        >
          <ArrowRightIcon className="w-4 h-4" />
          بازگشت به لیست کالاها
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEditMode ? "ویرایش کالا" : "ثبت کالای جدید"}
        </h1>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-white shadow rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* کد کالا */}
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
              className={`w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.code ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="مثلاً: CAP-1000-16"
            />
            {errors.code && (
              <p className="mt-1 text-xs text-red-600">{errors.code}</p>
            )}
          </div>

          {/* نام کالا */}
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
              className={`w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? "border-red-500" : "border-gray-300"
              }`}
              placeholder="مثلاً: خازن ۱۰۰۰ میکروفاراد ۱۶ ولت"
            />
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name}</p>
            )}
          </div>

          {/* دسته‌بندی */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              دسته‌بندی
            </label>
            <select
              name="categoryId"
              value={formData.categoryId}
              onChange={handleChange}
              disabled={loading}
              className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">بدون دسته‌بندی</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </div>

          {/* واحد */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              واحد شمارش <span className="text-red-500">*</span>
            </label>
            <select
              name="unit"
              value={formData.unit}
              onChange={handleChange}
              disabled={loading}
              className={`w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white ${
                errors.unit ? "border-red-500" : "border-gray-300"
              }`}
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

          {/* حداقل موجودی */}
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
              className={`w-full border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.minStock ? "border-red-500" : "border-gray-300"
              }`}
            />
            {errors.minStock && (
              <p className="mt-1 text-xs text-red-600">{errors.minStock}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              وقتی موجودی به این عدد برسد، هشدار کم‌موجودی نمایش داده می‌شود
            </p>
          </div>

          {/* اطلاعات موجودی فعلی (فقط در حالت ویرایش) */}
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

        {/* توضیحات */}
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
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="توضیحات اضافی درباره کالا..."
          />
        </div>

        {/* Buttons */}
        <div className="mt-6 flex justify-end gap-3">
          <Link
            to="/items"
            className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
          >
            انصراف
          </Link>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                در حال ذخیره...
              </>
            ) : isEditMode ? (
              "ویرایش کالا"
            ) : (
              "ثبت کالا"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
