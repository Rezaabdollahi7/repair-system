import { useState, useEffect } from "react";
import axios from "axios";
import { createCustomer, updateCustomer, getCustomer } from "../api";
import { toast } from "react-hot-toast";
import { XMarkIcon, UserIcon, PhoneIcon } from "@heroicons/react/24/solid";
import type { CustomerBody, Id } from "../types/api";

interface CustomerFormModalProps {
  customerId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  zIndex?: number;
}

export default function CustomerFormModal({
  customerId,
  isOpen,
  onClose,
  onSuccess,
}: CustomerFormModalProps) {
  const isEdit = Boolean(customerId);
  const [form, setForm] = useState<CustomerBody>({ name: "", phone: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEdit && customerId) {
        getCustomer(customerId)
          .then((res) =>
            setForm({ name: res.data.name || "", phone: res.data.phone || "" }),
          )
          .catch(() => toast.error("خطا در بارگذاری اطلاعات"));
      } else {
        setForm({ name: "", phone: "" });
      }
    }
  }, [isOpen, customerId, isEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("نام الزامی است");
    if (!form.phone.trim()) return toast.error("شماره تماس الزامی است");

    setLoading(true);
    try {
      if (isEdit && customerId) {
        await updateCustomer(customerId, form);
        toast.success("مشتری ویرایش شد");
      } else {
        await createCustomer(form);
        toast.success("مشتری اضافه شد");
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      const message =
        (axios.isAxiosError(err) &&
          (err.response?.data as { error?: string } | undefined)?.error) ||
        "خطا در ذخیره‌سازی";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className="bg-surface rounded-xl shadow-xl w-full max-w-md"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-soft rounded-lg">
              <UserIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              {isEdit ? "ویرایش مشتری" : "افزودن مشتری جدید"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              نام <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <UserIcon className="absolute right-3 top-2.5 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="نام کامل مشتری"
                className="w-full pr-9 pl-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              شماره تماس <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <PhoneIcon className="absolute right-3 top-2.5 w-4 h-4 text-text-secondary" />
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="09xxxxxxxxx"
                className="w-full pr-9 pl-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 py-2 bg-primary text-text-inverse text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50"
            >
              {loading
                ? "در حال ذخیره..."
                : isEdit
                  ? "ذخیره تغییرات"
                  : "افزودن مشتری"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 bg-surface-alt text-text-primary text-sm font-medium rounded-lg hover:bg-surface-alt"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
