import { useState } from "react";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { XMarkIcon, BuildingStorefrontIcon } from "@heroicons/react/24/solid";
import { createWarehouse, updateWarehouse } from "../api";
import { errorText } from "../utils/errors";
import { modalPanel } from "../motion";
import type { Warehouse } from "../types/api";

interface WarehouseFormModalProps {
  /** The warehouse being renamed; null to create one. */
  warehouse: Warehouse | null;
  onClose: () => void;
  onSuccess?: () => void;
}

const fieldClass =
  "w-full px-3 py-2 border border-border-field rounded-field text-body-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary";

/**
 * Create or rename a warehouse. Two fields and nothing else: whether it is
 * the default, and whether it is active, are actions on the list row, each
 * with a rule the server enforces and explains.
 *
 * Mounted only while open, keyed by the warehouse, so each opening starts
 * from that warehouse's own values without an effect copying them in.
 */
export default function WarehouseFormModal({
  warehouse,
  onClose,
  onSuccess,
}: WarehouseFormModalProps) {
  const isEdit = warehouse !== null;
  const [name, setName] = useState(warehouse?.name ?? "");
  const [note, setNote] = useState(warehouse?.note ?? "");
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("نام انبار الزامی است");

    setSaving(true);
    try {
      const body = { name: name.trim(), note: note.trim() || null };
      if (warehouse) {
        await updateWarehouse(warehouse.id, body);
        toast.success("انبار ویرایش شد");
      } else {
        await createWarehouse(body);
        toast.success("انبار اضافه شد");
      }
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(errorText(error, "خطا در ذخیره انبار"));
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
        aria-labelledby="warehouse-form-title"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-soft rounded-field">
              <BuildingStorefrontIcon className="w-5 h-5 text-primary" />
            </div>
            <h2
              id="warehouse-form-title"
              className="text-lg font-bold text-text-primary"
            >
              {isEdit ? "ویرایش انبار" : "افزودن انبار"}
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
          <div>
            <label
              htmlFor="warehouse-name"
              className="block text-body-sm font-medium text-text-primary mb-1"
            >
              نام انبار{" "}
              <span
                aria-hidden
                className="text-danger-fg text-[0.85em] leading-none align-super"
              >
                *
              </span>
            </label>
            <input
              id="warehouse-name"
              type="text"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثلاً انبار مغازه، قفسه تعمیرات"
              className={fieldClass}
              autoFocus
            />
          </div>

          <div>
            <label
              htmlFor="warehouse-note"
              className="block text-body-sm font-medium text-text-primary mb-1"
            >
              توضیح
            </label>
            <textarea
              id="warehouse-note"
              value={note}
              maxLength={500}
              rows={3}
              onChange={(e) => setNote(e.target.value)}
              placeholder="نشانی یا هر نکته‌ای که به کار می‌آید"
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 bg-primary text-primary-fg text-body-sm font-medium rounded-field hover:bg-primary-hover disabled:opacity-50"
            >
              {saving
                ? "در حال ذخیره..."
                : isEdit
                  ? "ذخیره تغییرات"
                  : "افزودن انبار"}
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
