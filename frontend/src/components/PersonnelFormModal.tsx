import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import axios from "axios";
import toast from "react-hot-toast";
import { getPersonnelOne, createPersonnel, updatePersonnel } from "../api";
import { useAuth } from "../context/AuthContext";
import { XMarkIcon, UserGroupIcon } from "@heroicons/react/24/solid";
import type { Id, PersonnelCreateBody, RoleName } from "../types/api";
import { modalPanel } from "../motion";

/**
 * Role ids as the seed writes them. Hardcoded rather than read from the
 * server, which exposes no endpoint for the roles table.
 */
const ALL_ROLES: { id: number; name: RoleName; label: string }[] = [
  { id: 1, name: "super_admin", label: "سوپر ادمین" },
  { id: 2, name: "admin", label: "ادمین" },
  { id: 3, name: "technician", label: "تکنسین" },
];

const TECHNICIAN_ROLE_ID = 3;

interface PersonnelForm {
  full_name: string;
  username: string;
  password: string;
  phone: string;
  role_id: number;
}

const EMPTY_FORM: PersonnelForm = {
  full_name: "",
  username: "",
  password: "",
  phone: "",
  role_id: TECHNICIAN_ROLE_ID,
};

interface PersonnelFormModalProps {
  personnelId?: Id | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  zIndex?: number;
}

export default function PersonnelFormModal({
  personnelId,
  isOpen,
  onClose,
  onSuccess,
}: PersonnelFormModalProps) {
  const { user } = useAuth();
  const isEdit = Boolean(personnelId);

  // The server enforces this too: an admin may only ever act on technicians.
  const allowedRoles =
    user?.role === "super_admin"
      ? ALL_ROLES
      : ALL_ROLES.filter((r) => r.name === "technician");

  const [form, setForm] = useState<PersonnelForm>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEdit && personnelId) {
        getPersonnelOne(personnelId)
          .then((res) => {
            const p = res.data;
            setForm({
              full_name: p.full_name || "",
              username: p.username || "",
              password: "",
              phone: p.phone || "",
              role_id: p.role_id || TECHNICIAN_ROLE_ID,
            });
          })
          .catch(() => toast.error("خطا در دریافت اطلاعات"));
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [isOpen, personnelId, isEdit]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({
      ...prev,
      // The role select carries its value as a string, as every DOM input
      // does; everything downstream expects a number.
      [name]: name === "role_id" ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isEdit && personnelId) {
        // An empty password field means "leave it alone", so the key is
        // dropped rather than sent blank.
        const { password, ...rest } = form;
        await updatePersonnel(
          personnelId,
          password ? { ...rest, password } : rest,
        );
        toast.success("اطلاعات بروزرسانی شد");
      } else {
        await createPersonnel(form satisfies PersonnelCreateBody);
        toast.success("پرسنل جدید اضافه شد");
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      const message =
        (axios.isAxiosError(err) &&
          (err.response?.data as { error?: string } | undefined)?.error) ||
        "خطا در ذخیره اطلاعات";
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-scrim/50 flex items-center justify-center z-50 p-4">
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="bg-surface border border-border rounded-card shadow-xl w-full max-w-md"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-soft rounded-field">
              <UserGroupIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              {isEdit ? "ویرایش پرسنل" : "افزودن پرسنل جدید"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-body-sm font-medium text-text-primary mb-1">
              نام و نام خانوادگی{" "}
              <span
                aria-hidden
                className="text-danger-fg text-[0.85em] leading-none align-super"
              >
                *
              </span>
            </label>
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              required
              className="w-full border border-border-field rounded-field px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
              placeholder="مثال: علی محمدی"
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-primary mb-1">
              شماره موبایل{" "}
              <span
                aria-hidden
                className="text-danger-fg text-[0.85em] leading-none align-super"
              >
                *
              </span>
            </label>
            <input
              type="tel"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
              dir="ltr"
              className="w-full border border-border-field rounded-field px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] font-mono"
              placeholder="09123456789"
            />
            <p className="text-body-xs text-text-secondary mt-1">
              این شماره، نام کاربری او برای ورود است
            </p>
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-primary mb-1">
              رمز عبور{" "}
              {isEdit ? (
                <span className="text-text-secondary font-normal">
                  (خالی = بدون تغییر)
                </span>
              ) : (
                <span
                  aria-hidden
                  className="text-danger-fg text-[0.85em] leading-none align-super"
                >
                  *
                </span>
              )}
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required={!isEdit}
              className="w-full border border-border-field rounded-field px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
              minLength={8}
              placeholder={
                isEdit ? "برای تغییر رمز وارد کنید" : "حداقل ۸ کاراکتر"
              }
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-primary mb-1">
              شماره تماس دیگر
            </label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              dir="ltr"
              className="w-full border border-border-field rounded-field px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
              placeholder="اختیاری — مثلاً تلفن ثابت"
            />
          </div>

          <div>
            <label className="block text-body-sm font-medium text-text-primary mb-1">
              نقش{" "}
              <span
                aria-hidden
                className="text-danger-fg text-[0.85em] leading-none align-super"
              >
                *
              </span>
            </label>
            <select
              name="role_id"
              value={form.role_id}
              onChange={handleChange}
              className="w-full border border-border-field rounded-field px-3 py-2 text-body-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]"
            >
              {allowedRoles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary text-primary-fg py-2 rounded-field hover:bg-primary-hover disabled:opacity-50 text-body-sm font-medium"
            >
              {loading
                ? "در حال ذخیره..."
                : isEdit
                  ? "بروزرسانی"
                  : "ایجاد پرسنل"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-surface-alt text-text-primary py-2 rounded-field hover:bg-surface-alt text-body-sm font-medium"
            >
              انصراف
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
