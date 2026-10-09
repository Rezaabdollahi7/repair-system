import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  AdjustmentsHorizontalIcon,
  PlusIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { createStockAdjustment, getItems } from "../api";
import SearchableSelect from "./SearchableSelect";
import type { SelectOption, SelectValue } from "./SearchableSelect";
import PersianDatePicker from "./PersianDatePicker";
import QuantityInput from "./QuantityInput";
import WarehouseSelect from "./WarehouseSelect";
import { errorText } from "../utils/errors";
import { formatPersianCurrency, formatQuantity } from "../utils/formatters";
import { reasonsFor } from "../utils/adjustmentReason";
import { useWarehouses } from "../utils/warehouses";
import { modalPanel } from "../motion";
import type {
  AdjustmentReason,
  Item,
  StockAdjustmentDetail,
} from "../types/api";

/** A line as the form holds it, before it is sent. */
interface FormLine {
  item_id: SelectValue;
  direction: "in" | "out";
  quantity: number;
  reason: AdjustmentReason | "";
  note: string;
  unit_cost: number | "";
}

const emptyLine = (): FormLine => ({
  item_id: "",
  direction: "out",
  quantity: 1,
  reason: "",
  note: "",
  unit_cost: "",
});

const today = () => new Date().toISOString().split("T")[0];

const fieldClass =
  "w-full border border-border-field rounded-field px-3 py-2 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]";

const labelClass = "block text-body-xs font-medium text-text-secondary mb-1";

interface StockAdjustmentFormModalProps {
  onClose: () => void;
  onSuccess?: (adjustment: StockAdjustmentDetail) => void;
}

/**
 * A new stock adjustment (14.14). Mounted only while open, so each opening
 * starts from an empty document.
 *
 * Each line says which way the stock moves and why. The reasons offered
 * follow the direction — a breakage can only take stock off the shelf — the
 * same rule the server enforces, so the form never offers what will be
 * refused. There is no edit afterwards: the document is applied when it is
 * saved, and the confirmation says so.
 */
export default function StockAdjustmentFormModal({
  onClose,
  onSuccess,
}: StockAdjustmentFormModalProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [adjustedAt, setAdjustedAt] = useState(today);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const warehouses = useWarehouses(warehouseId);

  useEffect(() => {
    getItems({ limit: 1000 })
      .then((res) => setItems(res.data.data))
      .catch(() => toast.error("خطا در دریافت فهرست کالاها"))
      .finally(() => setLoadingItems(false));
  }, []);

  const itemOf = (id: SelectValue) => items.find((item) => item.id === id);

  const itemOptions: SelectOption[] = items.map((item) => ({
    value: item.id,
    label: `[${item.code}] ${item.name}`,
    subLabel: `موجودی: ${formatQuantity(item.currentStock)} ${item.unit} | میانگین بها: ${formatPersianCurrency(item.avgPurchasePrice)} ریال`,
  }));

  const updateLine = (index: number, patch: Partial<FormLine>) => {
    setLines((current) =>
      current.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        // A reason that does not fit the new direction is cleared rather
        // than silently kept: «خرابی» on an increase is what the server
        // would refuse.
        if (
          patch.direction &&
          next.reason &&
          !reasonsFor(patch.direction).some((r) => r.value === next.reason)
        ) {
          next.reason = "";
        }
        if (patch.direction === "out") next.unit_cost = "";
        return next;
      }),
    );
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[`${key}_${index}`];
      return next;
    });
  };

  /** What a line is worth, at the cost it will move at. */
  const lineValue = (line: FormLine) => {
    const item = itemOf(line.item_id);
    if (!item || !line.quantity) return 0;
    const cost =
      line.direction === "in" && line.unit_cost !== ""
        ? Number(line.unit_cost)
        : item.avgPurchasePrice;
    return line.quantity * cost;
  };

  const valueIn = lines
    .filter((line) => line.direction === "in")
    .reduce((sum, line) => sum + lineValue(line), 0);
  const valueOut = lines
    .filter((line) => line.direction === "out")
    .reduce((sum, line) => sum + lineValue(line), 0);

  const validate = () => {
    const next: Record<string, string> = {};
    const seen = new Set<SelectValue>();
    lines.forEach((line, index) => {
      const item = itemOf(line.item_id);
      if (!line.item_id) next[`item_id_${index}`] = "کالا را انتخاب کنید";
      else if (seen.has(line.item_id))
        next[`item_id_${index}`] = "این کالا در ردیف دیگری هست";
      seen.add(line.item_id);

      if (!(line.quantity > 0))
        next[`quantity_${index}`] = "مقدار باید بیشتر از صفر باشد";
      else if (item && !item.isFractional && !Number.isInteger(line.quantity))
        next[`quantity_${index}`] = "این کالا فقط عدد صحیح می‌پذیرد";
      else if (
        item &&
        line.direction === "out" &&
        line.quantity > item.currentStock
      )
        // A first, friendly check against the total; the server checks the
        // chosen warehouse itself.
        next[`quantity_${index}`] =
          `بیشتر از موجودی است (موجودی: ${formatQuantity(item.currentStock)})`;

      if (!line.reason) next[`reason_${index}`] = "دلیل را انتخاب کنید";
      if (line.reason === "other" && !line.note.trim())
        next[`note_${index}`] = "برای «سایر» توضیح بنویسید";
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      toast.error("لطفاً خطاهای فرم را برطرف کنید");
      return;
    }
    setSaving(true);
    try {
      const res = await createStockAdjustment({
        warehouse_id: warehouseId,
        adjusted_at: adjustedAt,
        description: description.trim() || null,
        lines: lines.map((line) => ({
          item_id: Number(line.item_id),
          direction: line.direction,
          quantity: line.quantity,
          reason: line.reason as AdjustmentReason,
          note: line.note.trim() || null,
          unit_cost:
            line.direction === "in" && line.unit_cost !== ""
              ? Number(line.unit_cost)
              : null,
        })),
      });
      toast.success(`سند ${res.data.number} ثبت و اعمال شد`);
      onSuccess?.(res.data);
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت سند اصلاح موجودی"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-start justify-center z-50 p-2 sm:p-4 overflow-y-auto">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-5xl my-2 sm:my-8"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="adjustment-form-title"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border sticky top-0 bg-surface rounded-t-card z-10">
          <h2
            id="adjustment-form-title"
            className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2"
          >
            <AdjustmentsHorizontalIcon className="w-5 h-5 text-text-secondary" />
            سند اصلاح موجودی
          </h2>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={handleSubmit}
          className="p-3 sm:p-6 space-y-4 sm:space-y-6"
        >
          {/* The document */}
          <div className="bg-surface shadow rounded-field p-4 sm:p-5">
            <div
              className={`grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 ${warehouses.showPicker ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
            >
              {warehouses.showPicker && (
                <WarehouseSelect
                  id="adjustment-warehouse"
                  options={warehouses.options}
                  value={warehouseId}
                  defaultWarehouse={warehouses.defaultWarehouse}
                  onChange={setWarehouseId}
                />
              )}
              <div>
                <label className="block text-body-sm font-medium text-text-primary mb-1.5">
                  تاریخ سند
                </label>
                <PersianDatePicker
                  value={adjustedAt}
                  onChange={setAdjustedAt}
                />
              </div>
              <div className="sm:col-span-2 lg:col-span-2">
                <label
                  htmlFor="adjustment-description"
                  className="block text-body-sm font-medium text-text-primary mb-1.5"
                >
                  توضیح سند
                </label>
                <input
                  id="adjustment-description"
                  type="text"
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثلاً: بازبینی قفسه‌ی قطعات، آبان"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* The lines */}
          <div className="bg-surface shadow rounded-field p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-base sm:text-lg font-medium text-text-primary">
                ردیف‌ها
              </h3>
              <button
                type="button"
                onClick={() => setLines((current) => [...current, emptyLine()])}
                className="px-3 py-1.5 sm:py-2 rounded-field border border-border bg-surface text-text-primary font-bold hover:bg-surface-alt hover:border-border-strong transition-colors cursor-pointer text-body-xs sm:text-body-sm flex items-center gap-1"
              >
                <PlusIcon className="w-4 h-4" />
                افزودن ردیف
              </button>
            </div>

            <div className="space-y-3">
              {lines.map((line, index) => {
                const item = itemOf(line.item_id);
                const reasons = reasonsFor(line.direction);
                return (
                  <div
                    key={index}
                    className="border border-border rounded-field p-3 bg-surface-alt"
                  >
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 sm:gap-3 items-start">
                      <div className="col-span-6 sm:col-span-4">
                        <label className={labelClass}>کالا</label>
                        <SearchableSelect
                          options={itemOptions}
                          value={line.item_id}
                          onChange={(value) =>
                            updateLine(index, { item_id: value })
                          }
                          placeholder="جستجوی کالا..."
                          loading={loadingItems}
                          error={errors[`item_id_${index}`]}
                        />
                        {item && (
                          <p className="mt-1 text-body-xs text-text-muted tabular-nums">
                            موجودی فعلی: {formatQuantity(item.currentStock)}{" "}
                            {item.unit}
                          </p>
                        )}
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <span className={labelClass}>جهت</span>
                        {/* Two buttons rather than a select: the one choice
                            on the line that changes its meaning entirely. */}
                        <div
                          role="radiogroup"
                          aria-label="جهت"
                          className="grid grid-cols-2 rounded-field border border-border-field overflow-hidden"
                        >
                          {(["out", "in"] as const).map((direction) => {
                            const active = line.direction === direction;
                            const tone =
                              direction === "out"
                                ? "bg-danger-soft text-danger-fg"
                                : "bg-success-soft text-success-fg";
                            return (
                              <button
                                key={direction}
                                type="button"
                                role="radio"
                                aria-checked={active}
                                onClick={() => updateLine(index, { direction })}
                                className={`py-2 text-body-sm font-bold transition-colors cursor-pointer ${
                                  active
                                    ? tone
                                    : "bg-surface text-text-muted hover:text-text-primary"
                                }`}
                              >
                                {direction === "out" ? "کاهش" : "افزایش"}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="col-span-3 sm:col-span-2">
                        <label className={labelClass}>
                          مقدار{item ? ` (${item.unit})` : ""}
                        </label>
                        <QuantityInput
                          value={line.quantity}
                          fractional={item?.isFractional ?? false}
                          onChange={(value) =>
                            updateLine(index, { quantity: value })
                          }
                          aria-label="مقدار"
                          className={`${fieldClass} ${errors[`quantity_${index}`] ? "border-danger" : ""}`}
                        />
                        {errors[`quantity_${index}`] && (
                          <p className="mt-1 text-body-xs text-danger-fg">
                            {errors[`quantity_${index}`]}
                          </p>
                        )}
                      </div>

                      <div className="col-span-5 sm:col-span-3">
                        <label
                          htmlFor={`adjustment-reason-${index}`}
                          className={labelClass}
                        >
                          دلیل
                        </label>
                        <select
                          id={`adjustment-reason-${index}`}
                          value={line.reason}
                          onChange={(e) =>
                            updateLine(index, {
                              reason: e.target.value as AdjustmentReason,
                            })
                          }
                          className={`${fieldClass} ${errors[`reason_${index}`] ? "border-danger" : ""}`}
                        >
                          <option value="">انتخاب دلیل...</option>
                          {reasons.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>
                        {errors[`reason_${index}`] && (
                          <p className="mt-1 text-body-xs text-danger-fg">
                            {errors[`reason_${index}`]}
                          </p>
                        )}
                      </div>

                      <div className="col-span-1 sm:col-span-1 flex justify-center pt-6">
                        <button
                          type="button"
                          onClick={() =>
                            setLines((current) =>
                              current.length === 1
                                ? [emptyLine()]
                                : current.filter((_, i) => i !== index),
                            )
                          }
                          aria-label="حذف ردیف"
                          className="p-1.5 text-danger-fg hover:bg-danger-soft rounded-field"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div
                        className={`col-span-6 ${line.direction === "in" ? "sm:col-span-8" : "sm:col-span-12"}`}
                      >
                        <label className={labelClass}>
                          توضیح ردیف
                          {line.reason === "other" ? " (الزامی)" : ""}
                        </label>
                        <input
                          type="text"
                          value={line.note}
                          maxLength={500}
                          onChange={(e) =>
                            updateLine(index, { note: e.target.value })
                          }
                          placeholder="مثلاً: شکست موقع نصب روی دستگاه"
                          className={`${fieldClass} ${errors[`note_${index}`] ? "border-danger" : ""}`}
                        />
                        {errors[`note_${index}`] && (
                          <p className="mt-1 text-body-xs text-danger-fg">
                            {errors[`note_${index}`]}
                          </p>
                        )}
                      </div>

                      {line.direction === "in" && (
                        <div className="col-span-6 sm:col-span-4">
                          <label className={labelClass}>
                            بهای هر واحد (اختیاری، ریال)
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            dir="ltr"
                            value={line.unit_cost}
                            onChange={(e) =>
                              updateLine(index, {
                                unit_cost:
                                  e.target.value === ""
                                    ? ""
                                    : Number(e.target.value),
                              })
                            }
                            placeholder={
                              item
                                ? `خالی: ${formatPersianCurrency(item.avgPurchasePrice)}`
                                : ""
                            }
                            className={fieldClass}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* What it amounts to, and the warning that matters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-body-sm tabular-nums">
              <span className="text-success-fg">
                ورود: {formatPersianCurrency(valueIn)} ریال
              </span>
              <span className="text-danger-fg">
                خروج: {formatPersianCurrency(valueOut)} ریال
              </span>
            </div>
            <p className="text-body-xs text-text-secondary">
              سند با ثبت، بلافاصله روی موجودی اعمال می‌شود و ویرایش نمی‌شود.
              برای اصلاح، سند دیگری ثبت کنید.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-field text-text-primary hover:bg-surface-alt order-2 sm:order-1"
            >
              انصراف
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 bg-primary text-primary-fg rounded-field hover:bg-primary-hover disabled:opacity-50 order-1 sm:order-2"
            >
              {saving ? "در حال ثبت..." : "ثبت و اعمال سند"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
