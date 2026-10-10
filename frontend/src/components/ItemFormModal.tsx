import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import { getItem, createItem, updateItem, getCategories } from "../api";
import toast from "react-hot-toast";
import { XMarkIcon, CubeIcon } from "@heroicons/react/24/solid";
import type {
  Category,
  Id,
  ItemCreateBody,
  ItemWarehouseStock,
} from "../types/api";
import { modalPanel } from "../motion";
import QuantityInput from "./QuantityInput";
import MoneyInput from "./MoneyInput";
import WarehouseSelect from "./WarehouseSelect";
import { isFractionalByDefault } from "../utils/units";
import UnitSelect from "./UnitSelect";
import { formatQuantity } from "../utils/formatters";
import { useWarehouses } from "../utils/warehouses";
import { currencyLabel } from "../utils/currency";

/**
 * `currentStock` and `stocks` are display-only and read in edit mode; stock
 * changes go through documents, never this form.
 */
interface ItemForm {
  code: string;
  name: string;
  categoryId: number | string;
  unit: string;
  minStock: number;
  sellPrice: number | string;
  isFractional: boolean;
  description: string;
  currentStock?: number;
  stocks?: ItemWarehouseStock[];
}

const EMPTY_FORM: ItemForm = {
  code: "",
  name: "",
  categoryId: "",
  unit: "عدد",
  minStock: 0,
  sellPrice: "",
  isFractional: false,
  description: "",
};

type FormErrors = Partial<
  Record<keyof ItemForm | "openingStock" | "openingCost", string>
>;

interface ItemFormModalProps {
  itemId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  zIndex?: number;
}

const fieldBase =
  "w-full border rounded-field px-4 py-2 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]";

function fieldClass(error?: string) {
  return `${fieldBase} ${error ? "border-danger" : "border-border-field"}`;
}

function Required() {
  return (
    <span
      aria-hidden
      className="text-danger-fg text-[0.85em] leading-none align-super"
    >
      *
    </span>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-body-xs text-danger-fg">{message}</p>;
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formData, setFormData] = useState<ItemForm>(EMPTY_FORM);
  // Once the user has set the «کسری» box themselves, choosing a unit stops
  // overriding it.
  const [fractionalTouched, setFractionalTouched] = useState(false);

  // Opening stock (14.8): quantity, what each unit cost, and where it sits —
  // sent with the item in one request. Editable afterwards too: a cost typed
  // with one zero too many used to be there for good.
  const [openingStock, setOpeningStock] = useState(0);
  const [openingCost, setOpeningCost] = useState<number | string>("");
  const [openingWarehouse, setOpeningWarehouse] = useState<number | null>(null);
  const warehouses = useWarehouses(openingWarehouse, isOpen);

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
              sellPrice: item.sellPrice || "",
              isFractional: item.isFractional,
              description: item.description || "",
              currentStock: item.currentStock || 0,
              stocks: item.stocks,
            });
            setOpeningStock(item.opening?.quantity ?? 0);
            setOpeningCost(item.opening?.unitCost ?? "");
            setOpeningWarehouse(item.opening?.warehouseId ?? null);
            setFractionalTouched(true);
          })
          .catch(() => {
            toast.error("خطا در دریافت اطلاعات کالا");
            onClose();
          })
          .finally(() => setInitialLoading(false));
      } else {
        setFormData(EMPTY_FORM);
        setFractionalTouched(false);
        setOpeningStock(0);
        setOpeningCost("");
        setOpeningWarehouse(null);
        setInitialLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, itemId, isEditMode]);

  const clearError = (name: keyof FormErrors) => {
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]: type === "number" ? (value === "" ? "" : Number(value)) : value,
      };
      // Metres, kilos and litres are measured, not counted — offered as a
      // default the user can still undo.
      if (name === "unit" && !fractionalTouched) {
        next.isFractional = isFractionalByDefault(value);
      }
      return next;
    });
    clearError(name as keyof FormErrors);
  };

  const validateForm = () => {
    const newErrors: FormErrors = {};
    if (!formData.code?.trim()) newErrors.code = "کد کالا الزامی است";
    if (!formData.name?.trim()) newErrors.name = "نام کالا الزامی است";
    if (!formData.unit?.trim()) newErrors.unit = "واحد کالا الزامی است";
    if (formData.minStock < 0)
      newErrors.minStock = "حداقل موجودی نمی‌تواند منفی باشد";
    if (formData.sellPrice !== "" && Number(formData.sellPrice) < 0)
      newErrors.sellPrice = "قیمت فروش نمی‌تواند منفی باشد";
    if (openingStock > 0 && !(Number(openingCost) > 0)) {
      // The server refuses it too (14.8): stock with no cost would value the
      // shelf, and every later margin, at nothing.
      newErrors.openingCost = "بهای خرید هر واحد را وارد کنید";
    }
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
        minStock: formData.minStock,
        sell_price: Number(formData.sellPrice) || 0,
        isFractional: formData.isFractional,
        description: formData.description?.trim() || null,
      };

      if (isEditMode && itemId) {
        // The opening goes back every time; the server corrects it only when
        // it differs from what is on the ledger.
        await updateItem(itemId, {
          ...payload,
          openingStock,
          openingCost: openingStock > 0 ? Number(openingCost) : null,
          warehouseId: openingWarehouse,
        });
        toast.success("کالا با موفقیت ویرایش شد");
      } else {
        // One request, one transaction: the item and its opening stock land
        // together or not at all.
        await createItem({
          ...payload,
          ...(openingStock > 0
            ? {
                openingStock,
                openingCost: Number(openingCost),
                warehouseId: openingWarehouse,
              }
            : {}),
        });
        toast.success("کالا با موفقیت ثبت شد");
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

  const showStocksByWarehouse = (formData.stocks?.length ?? 0) > 1;

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-start justify-center z-50 p-4 overflow-y-auto">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-3xl my-8"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-surface rounded-t-card z-10">
          <h2 className="text-xl font-bold text-text-primary flex items-center gap-2">
            <CubeIcon className="w-5 h-5 text-text-secondary" />
            {isEditMode ? `ویرایش کالا #${itemId}` : "ثبت کالای جدید"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Code */}
            <div>
              <label
                htmlFor="item-code"
                className="block text-body-sm font-medium text-text-primary mb-2"
              >
                کد کالا <Required />
              </label>
              <input
                id="item-code"
                type="text"
                name="code"
                value={formData.code}
                onChange={handleChange}
                disabled={loading}
                className={fieldClass(errors.code)}
                placeholder="مثلاً: CAP-1000-16"
              />
              <FieldError message={errors.code} />
            </div>

            {/* Name */}
            <div>
              <label
                htmlFor="item-name"
                className="block text-body-sm font-medium text-text-primary mb-2"
              >
                نام کالا <Required />
              </label>
              <input
                id="item-name"
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                disabled={loading}
                className={fieldClass(errors.name)}
                placeholder="مثلاً: خازن ۱۰۰۰ میکروفاراد ۱۶ ولت"
              />
              <FieldError message={errors.name} />
            </div>

            {/* Category */}
            <div>
              <label
                htmlFor="item-category"
                className="block text-body-sm font-medium text-text-primary mb-2"
              >
                دسته‌بندی
              </label>
              <select
                id="item-category"
                name="categoryId"
                value={formData.categoryId}
                onChange={handleChange}
                disabled={loading}
                className={fieldClass()}
              >
                <option value="">بدون دسته‌بندی</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Unit, and whether it is measured in fractions */}
            <div>
              <label
                htmlFor="item-unit"
                className="block text-body-sm font-medium text-text-primary mb-2"
              >
                واحد شمارش <Required />
              </label>
              <UnitSelect
                id="item-unit"
                value={formData.unit}
                onChange={(unit) => {
                  setFormData((prev) => ({
                    ...prev,
                    unit,
                    // Metres, kilos and litres are measured, not counted —
                    // offered as a default the user can still undo.
                    isFractional: fractionalTouched
                      ? prev.isFractional
                      : isFractionalByDefault(unit),
                  }));
                  clearError("unit");
                }}
                disabled={loading}
                className={fieldClass(errors.unit)}
              />
              <FieldError message={errors.unit} />
              <label className="mt-2 flex items-start gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  checked={formData.isFractional}
                  onChange={(e) => {
                    setFractionalTouched(true);
                    setFormData((prev) => ({
                      ...prev,
                      isFractional: e.target.checked,
                    }));
                  }}
                  disabled={loading}
                  className="mt-1 w-4 h-4 accent-[var(--primary)] cursor-pointer"
                />
                <span className="text-body-sm text-text-primary leading-6">
                  کالای کسری
                  <span className="block text-body-xs text-text-secondary">
                    مقدار اعشاری می‌پذیرد — مثل ۲٫۵ متر سیم یا ۰٫۲۵ کیلو
                  </span>
                </span>
              </label>
            </div>

            {/* Sell price */}
            <div>
              <label
                htmlFor="item-sell-price"
                className="block text-body-sm font-medium text-text-primary mb-2"
              >
                قیمت فروش ({currencyLabel()})
              </label>
              <MoneyInput
                id="item-sell-price"
                name="sellPrice"
                value={
                  formData.sellPrice === "" ? null : Number(formData.sellPrice)
                }
                onChange={(value) => {
                  setFormData((prev) => ({ ...prev, sellPrice: value ?? "" }));
                  clearError("sellPrice");
                }}
                disabled={loading}
                className={fieldClass(errors.sellPrice)}
                placeholder="۰"
              />
              <FieldError message={errors.sellPrice} />
              <p className="mt-1 text-body-xs text-text-secondary">
                قیمت پیشنهادی در فاکتور فروش و تعمیر؛ در هر فاکتور قابل تغییر
                است
              </p>
            </div>

            {/* Minimum stock */}
            <div>
              <label
                htmlFor="item-min-stock"
                className="block text-body-sm font-medium text-text-primary mb-2"
              >
                حداقل موجودی (هشدار)
              </label>
              <QuantityInput
                id="item-min-stock"
                value={formData.minStock}
                fractional={formData.isFractional}
                onChange={(value) => {
                  setFormData((prev) => ({ ...prev, minStock: value }));
                  clearError("minStock");
                }}
                disabled={loading}
                placeholder="۰"
                className={fieldClass(errors.minStock)}
              />
              <FieldError message={errors.minStock} />
              <p className="mt-1 text-body-xs text-text-secondary">
                وقتی موجودی به این عدد برسد، هشدار کم‌موجودی نمایش داده می‌شود
              </p>
            </div>

            {/* Current stock, only when editing */}
            {isEditMode && (
              <div className="bg-surface-alt p-4 rounded-field border border-border">
                <p className="block text-body-sm font-medium text-text-primary mb-2">
                  موجودی فعلی
                </p>
                <div className="text-2xl font-bold text-text-primary tabular-nums">
                  {formatQuantity(formData.currentStock || 0)} {formData.unit}
                </div>
                {showStocksByWarehouse && (
                  <ul className="mt-2 space-y-1">
                    {formData.stocks!.map((stock) => (
                      <li
                        key={stock.warehouseId}
                        className="flex justify-between gap-3 text-body-xs text-text-secondary"
                      >
                        <span>{stock.warehouseName}</span>
                        <span className="tabular-nums">
                          {formatQuantity(stock.quantity)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-body-xs text-text-secondary">
                  خرید، فروش و مصرف بعدی از فاکتورها و اسناد انبار ثبت می‌شوند؛
                  اینجا فقط موجودی اولیه را می‌توان اصلاح کرد
                </p>
              </div>
            )}
          </div>

          {/* Opening stock: entered with the item, correctable afterwards */}
          <fieldset className="mt-6 border border-border rounded-field p-4">
            <legend className="px-2 text-body-sm font-bold text-text-primary">
              موجودی اولیه
            </legend>
            <p className="text-body-xs text-text-secondary mb-4">
              {isEditMode
                ? "اگر مقدار یا بهای موجودی اولیه را اشتباه وارد کرده‌اید، اینجا اصلاحش کنید. خرید و فروش‌های بعدی سر جایشان می‌مانند و اصلاح در کاردکس کالا ثبت می‌شود."
                : "اگر از این کالا از قبل در انبار دارید، مقدار و بهای خرید هر واحد را وارد کنید تا ارزش انبار و سود فروش‌های بعدی درست حساب شود."}
            </p>
            <div
              className={`grid grid-cols-1 gap-4 ${warehouses.showPicker ? "md:grid-cols-3" : "md:grid-cols-2"}`}
            >
              <div>
                <label
                  htmlFor="item-opening-stock"
                  className="block text-body-sm font-medium text-text-primary mb-2"
                >
                  مقدار
                </label>
                <QuantityInput
                  id="item-opening-stock"
                  value={openingStock}
                  fractional={formData.isFractional}
                  onChange={(value) => {
                    setOpeningStock(value);
                    clearError("openingCost");
                  }}
                  disabled={loading}
                  placeholder="۰"
                  className={fieldClass(errors.openingStock)}
                />
              </div>

              <div>
                <label
                  htmlFor="item-opening-cost"
                  className="block text-body-sm font-medium text-text-primary mb-2"
                >
                  بهای خرید هر واحد ({currencyLabel()})
                  {openingStock > 0 && (
                    <>
                      {" "}
                      <Required />
                    </>
                  )}
                </label>
                <MoneyInput
                  id="item-opening-cost"
                  value={openingCost === "" ? null : Number(openingCost)}
                  onChange={(value) => {
                    setOpeningCost(value ?? "");
                    clearError("openingCost");
                  }}
                  disabled={loading || openingStock <= 0}
                  placeholder="۰"
                  className={`${fieldClass(errors.openingCost)} disabled:opacity-50`}
                />
                <FieldError message={errors.openingCost} />
              </div>

              {warehouses.showPicker && (
                <WarehouseSelect
                  id="item-opening-warehouse"
                  options={warehouses.options}
                  value={openingWarehouse}
                  defaultWarehouse={warehouses.defaultWarehouse}
                  onChange={setOpeningWarehouse}
                />
              )}
            </div>
          </fieldset>

          {/* Description */}
          <div className="mt-6">
            <label
              htmlFor="item-description"
              className="block text-body-sm font-medium text-text-primary mb-2"
            >
              توضیحات
            </label>
            <textarea
              id="item-description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              disabled={loading}
              rows={3}
              className={fieldClass()}
              placeholder="توضیحات اضافی درباره کالا..."
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-field text-text-primary hover:bg-surface-alt"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover disabled:opacity-50"
            >
              {loading
                ? "در حال ذخیره..."
                : isEditMode
                  ? "ویرایش کالا"
                  : "ثبت کالا"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
