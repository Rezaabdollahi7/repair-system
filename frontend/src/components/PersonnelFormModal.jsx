// src/components/PersonnelFormModal.jsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  getPersonnelOne,
  createPersonnel,
  updatePersonnel,
} from "../api/index";
import { useAuth } from "../context/AuthContext";
import { XMarkIcon, UserGroupIcon } from "@heroicons/react/24/solid";

const ALL_ROLES = [
  { id: 1, name: "super_admin", label: "سوپر ادمین" },
  { id: 2, name: "admin", label: "ادمین" },
  { id: 3, name: "technician", label: "تکنسین" },
];

export default function PersonnelFormModal({
  personnelId,
  isOpen,
  onClose,
  onSuccess,
}) {
  const { user } = useAuth();
  const isEdit = Boolean(personnelId);

  const allowedRoles =
    user?.role === "super_admin"
      ? ALL_ROLES
      : ALL_ROLES.filter((r) => r.name === "technician");

  const [form, setForm] = useState({
    full_name: "",
    username: "",
    password: "",
    phone: "",
    role_id: 3,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (isEdit) {
        getPersonnelOne(personnelId)
          .then((res) => {
            const p = res.data;
            setForm({
              full_name: p.full_name || "",
              username: p.username || "",
              password: "",
              phone: p.phone || "",
              role_id: p.role_id || 3,
            });
          })
          .catch(() => toast.error("خطا در دریافت اطلاعات"));
      } else {
        setForm({
          full_name: "",
          username: "",
          password: "",
          phone: "",
          role_id: 3,
        });
      }
    }
  }, [isOpen, personnelId, isEdit]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = { ...form };
      if (isEdit && !payload.password) delete payload.password;

      if (isEdit) {
        await updatePersonnel(personnelId, payload);
        toast.success("اطلاعات بروزرسانی شد");
      } else {
        await createPersonnel(payload);
        toast.success("پرسنل جدید اضافه شد");
      }
      onSuccess && onSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در ذخیره اطلاعات");
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
              <UserGroupIcon className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-lg font-bold text-text-primary">
              {isEdit ? "ویرایش پرسنل" : "افزودن پرسنل جدید"}
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
              نام و نام خانوادگی <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              name="full_name"
              value={form.full_name}
              onChange={handleChange}
              required
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
              placeholder="مثال: علی محمدی"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              شماره موبایل <span className="text-danger">*</span>
            </label>
            <input
              type="tel"
              name="username"
              value={form.username}
              onChange={handleChange}
              required
              dir="ltr"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary font-mono"
              placeholder="09123456789"
            />
            <p className="text-xs text-text-secondary mt-1">
              این شماره، نام کاربری او برای ورود است
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              رمز عبور{" "}
              {isEdit ? (
                <span className="text-text-secondary font-normal">
                  (خالی = بدون تغییر)
                </span>
              ) : (
                <span className="text-danger">*</span>
              )}
            </label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required={!isEdit}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
              minLength={8}
              placeholder={
                isEdit ? "برای تغییر رمز وارد کنید" : "حداقل ۸ کاراکتر"
              }
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              شماره تماس دیگر
            </label>
            <input
              type="text"
              name="phone"
              value={form.phone}
              onChange={handleChange}
              dir="ltr"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
              placeholder="اختیاری — مثلاً تلفن ثابت"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-primary mb-1">
              نقش <span className="text-danger">*</span>
            </label>
            <select
              name="role_id"
              value={form.role_id}
              onChange={handleChange}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
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
              className="flex-1 bg-primary text-text-inverse py-2 rounded-lg hover:bg-primary-hover disabled:opacity-50 text-sm font-medium"
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
              className="flex-1 bg-surface-alt text-text-primary py-2 rounded-lg hover:bg-surface-alt text-sm font-medium"
            >
              انصراف
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
