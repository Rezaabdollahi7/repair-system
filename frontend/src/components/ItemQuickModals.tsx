import { useState } from "react";
import toast from "react-hot-toast";
import { XMarkIcon } from "@heroicons/react/24/solid";
import { quickPurchase, quickSale } from "../api";
import QuantityInput from "./QuantityInput";
import WarehouseSelect from "./WarehouseSelect";
import { errorText } from "../utils/errors";
import { formatPersianCurrency, formatQuantity } from "../utils/formatters";
import { useWarehouses } from "../utils/warehouses";
import type { Item } from "../types/api";
import NumberInput from "./NumberInput";

/*
 * The item's two quick operations — a purchase without an invoice form and
 * a counter sale — moved out of the old item modal when the item became a
 * page (14.18). Unchanged: each still posts through its own endpoint, which
 * draws a PUR- or SAL- number and moves stock through the stock service.
 */

interface QuickModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  item: Item | null;
}

// ─── Quick Purchase Modal ──────────────────────────────────
export function QuickPurchaseModal({
  isOpen,
  onClose,
  onSuccess,
  item,
}: QuickModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(item?.avgPurchasePrice || 0);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const warehouses = useWarehouses(warehouseId, isOpen);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    if (!(quantity > 0)) {
      toast.error("تعداد باید بیشتر از صفر باشد");
      return;
    }
    setLoading(true);
    try {
      await quickPurchase(item.id, {
        quantity,
        unit_price: price,
        warehouse_id: warehouseId,
      });
      toast.success("خرید سریع با موفقیت ثبت شد");
      onSuccess();
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت خرید سریع"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-field p-6 w-full max-w-md" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-text-primary">
            افزایش سریع موجودی
          </h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-body-sm font-medium text-text-primary mb-1">
                کالا
              </label>
              <div className="px-3 py-2 bg-surface-alt border border-border rounded-field text-body-sm text-text-primary">
                [{item?.code}] {item?.name}
              </div>
            </div>
            <div>
              <label className="block text-body-sm font-medium text-text-primary mb-1">
                تعداد
              </label>
              <QuantityInput
                value={quantity}
                fractional={item?.isFractional ?? false}
                onChange={setQuantity}
                aria-label="تعداد"
                className="w-full border border-border-field rounded-field px-3 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
              />
            </div>
            {warehouses.showPicker && (
              <WarehouseSelect
                id="quick-purchase-warehouse"
                label="ورود به انبار"
                options={warehouses.options}
                value={warehouseId}
                defaultWarehouse={warehouses.defaultWarehouse}
                onChange={setWarehouseId}
              />
            )}
            <div>
              <label className="block text-body-sm font-medium text-text-primary mb-1">
                قیمت واحد (ریال)
              </label>
              <NumberInput
                value={price}
                aria-label="قیمت واحد"
                onChange={(value) => setPrice(value ?? 0)}
                className="w-full border border-border-field rounded-field px-3 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
                required
              />
            </div>
            <div className="bg-surface-alt p-3 rounded-field">
              <div className="flex justify-between text-body-sm text-text-primary">
                <span>جمع کل:</span>
                <span className="font-medium">
                  {formatPersianCurrency(quantity * price)} ریال
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-field hover:bg-surface-alt text-text-primary"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover disabled:opacity-50"
            >
              {loading ? "در حال ثبت..." : "ثبت خرید"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Quick Sale Modal ──────────────────────────────────────
export function QuickSaleModal({
  isOpen,
  onClose,
  onSuccess,
  item,
}: QuickModalProps) {
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ quantity?: string }>({});
  const warehouses = useWarehouses(warehouseId, isOpen);

  const validate = () => {
    const newErrors: { quantity?: string } = {};
    if (!quantity || quantity <= 0)
      newErrors.quantity = "تعداد باید بیشتر از صفر باشد";
    // The total across warehouses; the server checks the chosen one.
    if (quantity > (item?.currentStock || 0))
      newErrors.quantity = `موجودی کافی نیست (موجودی: ${formatQuantity(item?.currentStock ?? 0)})`;
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item) return;
    if (!validate()) return;
    setLoading(true);
    try {
      await quickSale(item.id, {
        quantity,
        customer_name: customerName?.trim() || "مشتری متفرقه",
        warehouse_id: warehouseId,
      });
      toast.success("فروش سریع با موفقیت ثبت شد");
      onSuccess();
      onClose();
      setQuantity(1);
      setCustomerName("");
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت فروش سریع"));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50">
      <div className="bg-surface rounded-field p-6 w-full max-w-md" dir="rtl">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-text-primary">فروش سریع</h3>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-body-sm font-medium text-text-primary mb-1">
                کالا
              </label>
              <div className="px-3 py-2 bg-surface-alt border border-border rounded-field text-body-sm text-text-primary">
                [{item?.code}] {item?.name}
              </div>
              <p className="text-body-xs text-text-secondary mt-1">
                موجودی فعلی: {formatQuantity(item?.currentStock ?? 0)}{" "}
                {item?.unit}
              </p>
            </div>
            <div>
              <label className="block text-body-sm font-medium text-text-primary mb-1">
                تعداد{" "}
                <span
                  aria-hidden
                  className="text-danger-fg text-[0.85em] leading-none align-super"
                >
                  *
                </span>
              </label>
              <QuantityInput
                value={quantity}
                fractional={item?.isFractional ?? false}
                onChange={setQuantity}
                aria-label="تعداد"
                className={`w-full border rounded-field px-3 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] ${errors.quantity ? "border-danger" : "border-border"}`}
              />
              {errors.quantity && (
                <p className="text-body-xs text-danger-fg mt-1">
                  {errors.quantity}
                </p>
              )}
            </div>
            {warehouses.showPicker && (
              <WarehouseSelect
                id="quick-sale-warehouse"
                label="خروج از انبار"
                options={warehouses.options}
                value={warehouseId}
                defaultWarehouse={warehouses.defaultWarehouse}
                onChange={setWarehouseId}
              />
            )}
            <div>
              <label className="block text-body-sm font-medium text-text-primary mb-1">
                نام مشتری
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full border border-border-field rounded-field px-3 py-2 bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
                placeholder="مشتری متفرقه"
              />
            </div>
            <div className="bg-surface-alt p-3 rounded-field">
              <div className="flex justify-between text-body-sm text-text-primary">
                <span>موجودی بعد از فروش:</span>
                <span className="font-medium">
                  {formatQuantity((item?.currentStock || 0) - quantity)}{" "}
                  {item?.unit}
                </span>
              </div>
            </div>
          </div>
          <div className="flex gap-2 mt-6">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-border rounded-field hover:bg-surface-alt text-text-primary"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-danger-fill text-on-status rounded-field hover:bg-danger-hover disabled:opacity-50"
            >
              {loading ? "در حال ثبت..." : "ثبت فروش"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
