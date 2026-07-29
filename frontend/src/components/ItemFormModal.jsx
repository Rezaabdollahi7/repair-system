// src/components/ItemFormModal.jsx
import { useState, useEffect } from "react";
import { getItem, createItem, updateItem, getCategories } from "../api";
import api from "../api";
import toast from "react-hot-toast";
import { XMarkIcon, CubeIcon } from "@heroicons/react/24/solid";

const unitOptions = [
  { value: "عدد", label: "عدد" },
  { value: "متر", label: "متر" },
  { value: "کیلوگرم", label: "کیلوگرم" },
  { value: "بسته", label: "بسته" },
  { value: "کارتن", label: "کارتن" },
  { value: "لیتر", label: "لیتر" },
  { value: "دستگاه", label: "دستگاه" },
];

export default function ItemFormModal({ itemId, isOpen, onClose, onSuccess }) {
  const isEditMode = Boolean(itemId);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [initialStock, setInitialStock] = useState(0);
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
              currentStock: item.currentStock || 0,
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
        setInitialStock(0);
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
    if (initialStock < 0)
      newErrors.initialStock = "موجودی اولیه نمی‌تواند منفی باشد";
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

      let newItemId = itemId;

      if (isEditMode) {
        await updateItem(itemId, payload);
        toast.success("کالا با موفقیت ویرایش شد");
      } else {
        const res = await createItem(payload);
        newItemId = res.data.id;
        toast.success("کالا با موفقیت ثبت شد");

        if (initialStock > 0) {
          try {
            await api.post(`/items/${newItemId}/quick-purchase`, {
              quantity: initialStock,
              unit_price: 0,
              note: "موجودی اولیه",
            });
          } catch (err) {
            console.error("Initial stock error:", err);
          }
        }
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
        className="bg-surface rounded-xl shadow-xl w-full max-w-3xl my-8"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface rounded-t-xl z-10">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <CubeIcon className="w-5 h-5 text-text-secondary" />
            {isEditMode ? `ویرایش کالا #${itemId}` : "ثبت کالای جدید"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* کد کالا */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                کد کالا <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                disabled={loading}
                className={`w-full border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary ${errors.code ? "border-danger" : "border-border"}`}
                placeholder="مثلاً: CAP-1000-16"
              />
              {errors.code && (
                <p className="mt-1 text-xs text-danger">{errors.code}</p>
              )}
            </div>

            {/* نام کالا */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                نام کالا <span className="text-danger">*</span>
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
                className={`w-full border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary ${errors.name ? "border-danger" : "border-border"}`}
                placeholder="مثلاً: خازن ۱۰۰۰ میکروفاراد ۱۶ ولت"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-danger">{errors.name}</p>
              )}
            </div>

            {/* دسته‌بندی */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
                دسته‌بندی
              </label>
              <select
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                disabled={loading}
                className="w-full border border-border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary"
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
              <label className="block text-sm font-medium text-text-primary mb-2">
                واحد شمارش <span className="text-danger">*</span>
              </label>
              <select
                name="unit"
                value={formData.unit}
                onChange={handleChange}
                disabled={loading}
                className={`w-full border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary ${errors.unit ? "border-danger" : "border-border"}`}
              >
                {unitOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              {errors.unit && (
                <p className="mt-1 text-xs text-danger">{errors.unit}</p>
              )}
            </div>

            {/* حداقل موجودی */}
            <div>
              <label className="block text-sm font-medium text-text-primary mb-2">
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
                className={`w-full border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary ${errors.minStock ? "border-danger" : "border-border"}`}
              />
              {errors.minStock && (
                <p className="mt-1 text-xs text-danger">{errors.minStock}</p>
              )}
              <p className="mt-1 text-xs text-text-secondary">
                وقتی موجودی به این عدد برسد، هشدار کم‌موجودی نمایش داده می‌شود
              </p>
            </div>

            {/* موجودی اولیه - فقط در حالت ایجاد */}
            {!isEditMode && (
              <div>
                <label className="block text-sm font-medium text-text-primary mb-2">
                  موجودی اولیه
                </label>
                <input
                  type="number"
                  name="initialStock"
                  value={initialStock}
                  onChange={(e) => setInitialStock(Number(e.target.value) || 0)}
                  disabled={loading}
                  min="0"
                  step="1"
                  className={`w-full border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary ${errors.initialStock ? "border-danger" : "border-border"}`}
                />
                {errors.initialStock && (
                  <p className="mt-1 text-xs text-danger">
                    {errors.initialStock}
                  </p>
                )}
                <p className="mt-1 text-xs text-text-secondary">
                  اگر از قبل موجودی دارید، تعداد را وارد کنید
                </p>
              </div>
            )}

            {/* موجودی فعلی - فقط در حالت ویرایش */}
            {isEditMode && (
              <div className="bg-surface-alt p-4 rounded-lg border border-border">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  موجودی فعلی
                </label>
                <div className="text-2xl font-bold text-text-primary">
                  {formData.currentStock || 0} {formData.unit}
                </div>
                <p className="mt-1 text-xs text-text-secondary">
                  برای تغییر موجودی از بخش فاکتور خرید یا فروش استفاده کنید
                </p>
              </div>
            )}
          </div>

          {/* توضیحات */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-text-primary mb-2">
              توضیحات
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              disabled={loading}
              rows="3"
              className="w-full border border-border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary"
              placeholder="توضیحات اضافی درباره کالا..."
            />
          </div>

          {/* دکمه‌ها */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg text-text-primary hover:bg-surface-alt"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50"
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
