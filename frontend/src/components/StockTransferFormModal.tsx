import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowsUpDownIcon,
  PlusIcon,
  TrashIcon,
  TruckIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { createStockTransfer, getItems, getStockReport } from "../api";
import SearchableSelect from "./SearchableSelect";
import type { SelectOption, SelectValue } from "./SearchableSelect";
import PersianDatePicker from "./PersianDatePicker";
import QuantityInput from "./QuantityInput";
import WarehouseSelect from "./WarehouseSelect";
import { errorText } from "../utils/errors";
import { formatPersianCurrency, formatQuantity } from "../utils/formatters";
import { useWarehouses } from "../utils/warehouses";
import { modalPanel } from "../motion";
import type { Item, StockTransferDetail } from "../types/api";

/** A line as the form holds it, before it is sent. */
interface FormLine {
  item_id: SelectValue;
  quantity: number;
  note: string;
}

const emptyLine = (): FormLine => ({ item_id: "", quantity: 1, note: "" });

const today = () => new Date().toISOString().split("T")[0];

const fieldClass =
  "w-full border border-border-field rounded-field px-3 py-2 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]";

const labelClass = "block text-body-xs font-medium text-text-secondary mb-1";

interface StockTransferFormModalProps {
  onClose: () => void;
  onSuccess?: (transfer: StockTransferDetail) => void;
}

/**
 * A new transfer between two warehouses (14.16). Mounted only while open.
 *
 * The item picker offers only what the source warehouse holds, with how
 * much — a transfer can only take from one shelf, and offering the whole
 * catalogue would invite a line the server must refuse. Changing the source
 * reloads that list and re-checks the lines already on the form against it.
 */
export default function StockTransferFormModal({
  onClose,
  onSuccess,
}: StockTransferFormModalProps) {
  const [items, setItems] = useState<Item[]>([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [fromId, setFromId] = useState<number | null>(null);
  const [toId, setToId] = useState<number | null>(null);
  // Item id → what the source warehouse holds; null while it loads.
  const [sourceStock, setSourceStock] = useState<Map<number, number> | null>(
    null,
  );
  const [transferredAt, setTransferredAt] = useState(today);
  const [description, setDescription] = useState("");
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const warehouses = useWarehouses();

  const active = useMemo(
    () => warehouses.options.filter((w) => w.is_active),
    [warehouses.options],
  );

  // From the default, to the first other active warehouse — the move a shop
  // with a store room and a bench makes most.
  const from = fromId ?? warehouses.defaultWarehouse?.id ?? null;
  const to = toId ?? active.find((w) => w.id !== from)?.id ?? null;

  useEffect(() => {
    getItems({ limit: 1000 })
      .then((res) => setItems(res.data.data))
      .catch(() => toast.error("خطا در دریافت فهرست کالاها"))
      .finally(() => setLoadingItems(false));
  }, []);

  useEffect(() => {
    if (from === null) return;
    let cancelled = false;
    // The stock report filtered by a warehouse is exactly «what is on this
    // shelf, and how much» — only items holding stock there.
    getStockReport({ warehouseId: from })
      .then((res) => {
        if (cancelled) return;
        setSourceStock(
          new Map(
            res.data.data.map((row) => [row.id, row.warehouse_stock ?? 0]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) toast.error("خطا در دریافت موجودی انبار مبدأ");
      });
    return () => {
      cancelled = true;
    };
  }, [from]);

  const itemOf = (id: SelectValue) => items.find((item) => item.id === id);
  const available = (id: SelectValue) => sourceStock?.get(Number(id)) ?? 0;
  const fromName = active.find((w) => w.id === from)?.name ?? "";

  const itemOptions: SelectOption[] = items
    .filter((item) => available(item.id) > 0)
    .map((item) => ({
      value: item.id,
      label: `[${item.code}] ${item.name}`,
      subLabel: `در «${fromName}»: ${formatQuantity(available(item.id))} ${item.unit}`,
    }));

  const updateLine = (index: number, patch: Partial<FormLine>) => {
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
    setErrors((current) => {
      const next = { ...current };
      for (const key of Object.keys(patch)) delete next[`${key}_${index}`];
      return next;
    });
  };

  const changeFrom = (id: number) => {
    setFromId(id);
    // The destination cannot be the new source; move it out of the way.
    if (id === to) setToId(active.find((w) => w.id !== id)?.id ?? null);
    setSourceStock(null);
    setErrors({});
  };

  const swap = () => {
    if (from === null || to === null) return;
    setFromId(to);
    setToId(from);
    setSourceStock(null);
    setErrors({});
  };

  const value = lines.reduce((sum, line) => {
    const item = itemOf(line.item_id);
    return item ? sum + line.quantity * item.avgPurchasePrice : sum;
  }, 0);

  const validate = () => {
    const next: Record<string, string> = {};
    if (from === null || to === null || from === to)
      next.warehouses = "انبار مبدأ و مقصد را انتخاب کنید";
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
      else if (item && line.quantity > available(item.id))
        next[`quantity_${index}`] =
          `بیشتر از موجودی «${fromName}» است (${formatQuantity(available(item.id))})`;
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
      const res = await createStockTransfer({
        from_warehouse_id: from!,
        to_warehouse_id: to!,
        transferred_at: transferredAt,
        description: description.trim() || null,
        lines: lines.map((line) => ({
          item_id: Number(line.item_id),
          quantity: line.quantity,
          note: line.note.trim() || null,
        })),
      });
      toast.success(`سند ${res.data.number} ثبت و اعمال شد`);
      onSuccess?.(res.data);
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت سند انتقال"));
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
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-4xl my-2 sm:my-8"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-form-title"
      >
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-border sticky top-0 bg-surface rounded-t-card z-10">
          <h2
            id="transfer-form-title"
            className="text-lg sm:text-xl font-bold text-text-primary flex items-center gap-2"
          >
            <TruckIcon className="w-5 h-5 text-text-secondary" />
            انتقال بین انبارها
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
          {/* From → to */}
          <div className="bg-surface shadow rounded-field p-4 sm:p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 sm:gap-3 items-end">
              <WarehouseSelect
                id="transfer-from"
                label="از انبار"
                options={active}
                value={from}
                defaultWarehouse={warehouses.defaultWarehouse}
                onChange={changeFrom}
              />
              <button
                type="button"
                onClick={swap}
                aria-label="جابه‌جایی مبدأ و مقصد"
                title="جابه‌جایی مبدأ و مقصد"
                className="justify-self-center p-2 rounded-field border border-border text-text-secondary hover:text-text-primary hover:bg-surface-alt cursor-pointer"
              >
                {/* Up–down on a phone, where the two fields stack; turned
                    to point across them beside each other. */}
                <ArrowsUpDownIcon className="w-5 h-5 sm:rotate-90" />
              </button>
              <WarehouseSelect
                id="transfer-to"
                label="به انبار"
                options={active.filter((w) => w.id !== from)}
                value={to}
                defaultWarehouse={null}
                onChange={setToId}
              />
            </div>
            {errors.warehouses && (
              <p className="text-body-xs text-danger-fg">{errors.warehouses}</p>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div>
                <label className="block text-body-sm font-medium text-text-primary mb-1.5">
                  تاریخ سند
                </label>
                <PersianDatePicker
                  value={transferredAt}
                  onChange={setTransferredAt}
                />
              </div>
              <div className="sm:col-span-2">
                <label
                  htmlFor="transfer-description"
                  className="block text-body-sm font-medium text-text-primary mb-1.5"
                >
                  توضیح سند
                </label>
                <input
                  id="transfer-description"
                  type="text"
                  value={description}
                  maxLength={500}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="مثلاً: قطعات مورد نیاز تعمیرات این هفته"
                  className={fieldClass}
                />
              </div>
            </div>
          </div>

          {/* The lines */}
          <div className="bg-surface shadow rounded-field p-3 sm:p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-base sm:text-lg font-medium text-text-primary">
                کالاها
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

            {sourceStock !== null && sourceStock.size === 0 && (
              <p className="text-body-sm text-text-secondary bg-surface-alt rounded-field p-3 mb-3">
                «{fromName}» کالایی با موجودی ندارد که منتقل شود.
              </p>
            )}

            <div className="space-y-3">
              {lines.map((line, index) => {
                const item = itemOf(line.item_id);
                return (
                  <div
                    key={index}
                    className="border border-border rounded-field p-3 bg-surface-alt"
                  >
                    <div className="grid grid-cols-6 sm:grid-cols-12 gap-2 sm:gap-3 items-start">
                      <div className="col-span-6 sm:col-span-5">
                        <label className={labelClass}>کالا</label>
                        <SearchableSelect
                          options={itemOptions}
                          value={line.item_id}
                          onChange={(value) =>
                            updateLine(index, { item_id: value })
                          }
                          placeholder="جستجوی کالا..."
                          loading={loadingItems || sourceStock === null}
                          error={errors[`item_id_${index}`]}
                        />
                      </div>

                      <div className="col-span-5 sm:col-span-2">
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
                        {item && !errors[`quantity_${index}`] && (
                          <p className="mt-1 text-body-xs text-text-muted tabular-nums">
                            موجودی مبدأ: {formatQuantity(available(item.id))}
                          </p>
                        )}
                        {errors[`quantity_${index}`] && (
                          <p className="mt-1 text-body-xs text-danger-fg">
                            {errors[`quantity_${index}`]}
                          </p>
                        )}
                      </div>

                      <div className="col-span-6 sm:col-span-4 order-last sm:order-none">
                        <label className={labelClass}>توضیح ردیف</label>
                        <input
                          type="text"
                          value={line.note}
                          maxLength={500}
                          onChange={(e) =>
                            updateLine(index, { note: e.target.value })
                          }
                          placeholder="اختیاری"
                          className={fieldClass}
                        />
                      </div>

                      <div className="col-span-1 flex justify-center pt-6">
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
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-body-sm text-text-primary tabular-nums">
              ارزش کالاهای منتقل‌شده: {formatPersianCurrency(value)} ریال
            </p>
            <p className="text-body-xs text-text-secondary">
              موجودی کل و میانگین بها تغییر نمی‌کند؛ فقط جای کالا عوض می‌شود.
              سند با ثبت اعمال می‌شود و ویرایش نمی‌شود.
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
              {saving ? "در حال ثبت..." : "ثبت و اعمال انتقال"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
