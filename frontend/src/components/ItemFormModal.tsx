import { useState, useEffect } from "react";
import axios from "axios";
import {
  getItem,
  createItem,
  updateItem,
  getCategories,
  quickPurchase,
} from "../api";
import toast from "react-hot-toast";
import { XMarkIcon, CubeIcon } from "@heroicons/react/24/solid";
import type { Category, Id, ItemCreateBody } from "../types/api";

const unitOptions = [
  { value: "عدد", label: "عدد" },
  { value: "متر", label: "متر" },
  { value: "کیلوگرم", label: "کیلوگرم" },
  { value: "بسته", label: "بسته" },
  { value: "کارتن", label: "کارتن" },
  { value: "لیتر", label: "لیتر" },
  { value: "دستگاه", label: "دستگاه" },
];

/**
 * `currentStock` is display-only and read in edit mode; stock changes go
 * through purchase and sale invoices, never this form.
 */
interface ItemForm {
  code: string;
  name: string;
  categoryId: number | string;
  unit: string;
  minStock: number | string;
  description: string;
  currentStock?: number;
}

const EMPTY_FORM: ItemForm = {
  code: "",
  name: "",
  categoryId: "",
  unit: "عدد",
  minStock: 0,
  description: "",
};

type FormErrors = Partial<Record<keyof ItemForm | "initialStock", string>>;

interface ItemFormModalProps {
  itemId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  zIndex?: number;
}

export default function ItemFormModal({
  itemId,
  isOpen,
  onClose,
  onSuccess,
}: ItemFormModalProps) {
  const isEditMode = Boolean(itemId);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(isEditMode);
  const [initialStock, setInitialStock] = useState(0);
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<ItemForm>(EMPTY_FORM);

  useEffect(() => {
    if (isOpen) {
      getCategories()
        .then((res) => setCategories(res.data))
        .catch(() => {});

      if (isEditMode && itemId) {
        getItem(itemId)
          .then((res) => {
            const item = res.data;
            setFormData({
              code: item.code || "",
              name: item.name || "",
              categoryId: item.categoryId ?? "",
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
        setFormData(EMPTY_FORM);
        setInitialStock(0);
        setInitialLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itemId, isEditMode]);

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
    }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const validateForm = () => {
    const newErrors: FormErrors = {};
    if (!formData.code?.trim()) newErrors.code = "کد کالا الزامی است";
    if (!formData.name?.trim()) newErrors.name = "نام کالا الزامی است";
    if (!formData.unit?.trim()) newErrors.unit = "واحد کالا الزامی است";
    if (Number(formData.minStock) < 0)
      newErrors.minStock = "حداقل موجودی نمی‌تواند منفی باشد";
    if (initialStock < 0)
      newErrors.initialStock = "موجودی اولیه نمی‌تواند منفی باشد";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error("لطفاً خطاهای فرم را برطرف کنید");
      return;
    }
    setLoading(true);
    try {
      const payload: ItemCreateBody = {
        code: formData.code.trim(),
        name: formData.name.trim(),
        categoryId: formData.categoryId || null,
        unit: formData.unit.trim(),
        minStock: Number(formData.minStock),
        description: formData.description?.trim() || null,
      };

      if (isEditMode && itemId) {
        await updateItem(itemId, payload);
        toast.success("کالا با موفقیت ویرایش شد");
      } else {
        const res = await createItem(payload);
        toast.success("کالا با موفقیت ثبت شد");

        if (initialStock > 0) {
          try {
            // Recorded as a purchase at zero price so the opening stock lands
            // in the ledger like any other movement, rather than as a number
            // with no history behind it.
            await quickPurchase(res.data.id, {
              quantity: initialStock,
              unit_price: 0,
              note: "موجودی اولیه",
            });
          } catch (err) {
            console.error("Initial stock error:", err);
          }
        }
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      const errorMessage =
        (axios.isAxiosError(error) &&
          (error.response?.data as { error?: string } | undefined)?.error) ||
        undefined;
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
            {/* Code */}
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

            {/* Name */}
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

            {/* Category */}
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

            {/* Unit */}
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

            {/* Minimum stock */}
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

            {/* Opening stock, only when creating */}
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

            {/* Current stock, only when editing */}
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

          {/* Description */}
          <div className="mt-6">
            <label className="block text-sm font-medium text-text-primary mb-2">
              توضیحات
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              disabled={loading}
              rows={3}
              className="w-full border border-border rounded-lg px-4 py-2 text-sm bg-surface text-text-primary"
              placeholder="توضیحات اضافی درباره کالا..."
            />
          </div>

          {/* Actions */}
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
