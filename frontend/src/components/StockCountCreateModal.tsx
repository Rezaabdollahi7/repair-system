import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ClipboardDocumentCheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/solid";
import { createStockCount, getCategories } from "../api";
import WarehouseSelect from "./WarehouseSelect";
import { errorText } from "../utils/errors";
import { useWarehouses } from "../utils/warehouses";
import { modalPanel } from "../motion";
import type { Category, StockCountDetail } from "../types/api";

const fieldClass =
  "w-full border border-border-field rounded-field px-3 py-2 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]";

interface StockCountCreateModalProps {
  onClose: () => void;
  onCreated: (count: StockCountDetail) => void;
}

/**
 * Opens a stock count (14.15): which warehouse, whether the whole catalogue
 * or one category, and whether the counter sees what the system expects.
 * The lines are written by the server, one per active item in scope.
 */
export default function StockCountCreateModal({
  onClose,
  onCreated,
}: StockCountCreateModalProps) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [warehouseId, setWarehouseId] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [blind, setBlind] = useState(false);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const warehouses = useWarehouses(warehouseId);

  useEffect(() => {
    getCategories()
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createStockCount({
        warehouse_id: warehouseId,
        category_id: categoryId ? Number(categoryId) : null,
        blind,
        description: description.trim() || null,
      });
      toast.success(`انبارگردانی ${res.data.number} باز شد`);
      onCreated(res.data);
    } catch (error) {
      toast.error(errorText(error, "خطا در شروع انبارگردانی"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50 p-4">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-panel shadow-xl w-full max-w-md"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="count-create-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-soft rounded-field">
              <ClipboardDocumentCheckIcon className="w-5 h-5 text-primary" />
            </div>
            <h2
              id="count-create-title"
              className="text-lg font-bold text-text-primary"
            >
              انبارگردانی جدید
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="بستن"
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {warehouses.showPicker && (
            <WarehouseSelect
              id="count-warehouse"
              options={warehouses.options}
              value={warehouseId}
              defaultWarehouse={warehouses.defaultWarehouse}
              onChange={setWarehouseId}
            />
          )}

          <div>
            <label
              htmlFor="count-category"
              className="block text-body-sm font-medium text-text-primary mb-1.5"
            >
              دامنه‌ی شمارش
            </label>
            <select
              id="count-category"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={fieldClass}
            >
              <option value="">همه‌ی کالاها</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  فقط {category.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-body-xs text-text-secondary">
              برای شمارش بخش‌به‌بخش، یک دسته‌بندی را انتخاب کنید.
            </p>
          </div>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={blind}
              onChange={(e) => setBlind(e.target.checked)}
              className="mt-1 w-4 h-4 accent-[var(--primary)] cursor-pointer"
            />
            <span className="text-body-sm text-text-primary leading-6">
              شمارش کور
              <span className="block text-body-xs text-text-secondary">
                موجودی سیستم به شمارنده نشان داده نمی‌شود تا قفسه را واقعاً
                بشمارد، نه اینکه عدد را تأیید کند. اختلاف‌ها در مرحله‌ی بررسی
                دیده می‌شوند.
              </span>
            </span>
          </label>

          <div>
            <label
              htmlFor="count-description"
              className="block text-body-sm font-medium text-text-primary mb-1.5"
            >
              توضیح
            </label>
            <input
              id="count-description"
              type="text"
              value={description}
              maxLength={500}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="مثلاً: شمارش پایان مهر"
              className={fieldClass}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-primary text-primary-fg text-body-sm font-medium rounded-field hover:bg-primary-hover disabled:opacity-50"
            >
              {saving ? "در حال شروع..." : "شروع شمارش"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-surface-alt text-text-primary text-body-sm font-medium rounded-field hover:bg-surface-alt"
            >
              انصراف
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
