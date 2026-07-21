// src/pages/BackupList.jsx
import { useEffect, useState } from "react";
import {
  getBackups,
  createBackup,
  downloadBackup,
  restoreBackup,
  deleteBackup,
} from "../api";
import ConfirmModal from "../components/ConfirmModal";
import LoadingSpinner from "../components/LoadingSpinner";
import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  PlusIcon,
  ArrowDownTrayIcon,
  ArrowPathIcon,
  TrashIcon,
  ArchiveBoxIcon,
  PhotoIcon,
  XMarkIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/solid";

export default function BackupList() {
  const { user } = useAuth();
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [includeUploads, setIncludeUploads] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [showRestartModal, setShowRestartModal] = useState(false);

  if (user?.role !== "super_admin" && user?.role !== "admin") {
    return <Navigate to="/dashboard" replace />;
  }

  const fetchBackups = async () => {
    setLoading(true);
    try {
      const res = await getBackups();
      setBackups(res.data);
    } catch {
      toast.error("خطا در دریافت لیست بکاپ‌ها");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await createBackup({ include_uploads: includeUploads });
      toast.success("بکاپ با موفقیت ایجاد شد");
      setShowCreateModal(false);
      fetchBackups();
    } catch {
      toast.error("خطا در ایجاد بکاپ");
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = async (backup) => {
    try {
      const res = await downloadBackup(backup.id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", backup.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      toast.success("دانلود شروع شد");
    } catch {
      toast.error("خطا در دانلود");
    }
  };

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      await restoreBackup(restoreTarget.id);
      toast.success("بکاپ بازگردانی شد");
      setRestoreTarget(null);
      setShowRestartModal(true);
    } catch {
      toast.error("خطا در بازگردانی");
    } finally {
      setRestoring(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteBackup(deleteTarget.id);
      toast.success("بکاپ حذف شد");
      setDeleteTarget(null);
      fetchBackups();
    } catch {
      toast.error("خطا در حذف");
    } finally {
      setDeleting(false);
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (date) =>
    date ? new Date(date).toLocaleDateString("fa-IR") : "—";

  return (
    <div dir="rtl" className="px-2 sm:px-0">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
          <ArchiveBoxIcon className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
          پشتیبان‌گیری
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-primary text-text-inverse px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-primary-hover flex items-center gap-2 text-sm sm:text-base w-full sm:w-auto justify-center"
        >
          <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          بکاپ جدید
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text="در حال بارگذاری..." />
        </div>
      ) : backups.length === 0 ? (
        <div className="text-center py-16 sm:py-20 text-text-secondary">
          <ArchiveBoxIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 text-text-secondary" />
          <p className="text-sm sm:text-base">هیچ بکاپی ثبت نشده است</p>
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden overflow-x-auto">
          <table className="min-w-[640px] sm:min-w-full divide-y divide-border">
            <thead className="bg-gradient-to-r from-primary-soft to-primary-soft/50">
              <tr>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-primary text-xs sm:text-sm">
                  نام فایل
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-primary text-xs sm:text-sm">
                  حجم
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-primary text-xs sm:text-sm">
                  شامل آپلود
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-primary text-xs sm:text-sm">
                  تاریخ
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-right font-semibold text-primary text-xs sm:text-sm">
                  ایجادکننده
                </th>
                <th className="px-3 sm:px-4 py-2 sm:py-3 text-center font-semibold text-primary text-xs sm:text-sm">
                  عملیات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {backups.map((backup, index) => (
                <tr
                  key={backup.id}
                  className={`hover:bg-surface-alt ${index % 2 === 0 ? "bg-surface" : "bg-surface-alt"}`}
                >
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm font-mono truncate max-w-[120px] sm:max-w-none text-text-primary">
                    {backup.filename}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-secondary">
                    {formatSize(backup.size_bytes)}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    {backup.includes_uploads ? (
                      <span className="flex items-center gap-1 text-success">
                        <PhotoIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                        <span className="hidden sm:inline">بله</span>
                      </span>
                    ) : (
                      "خیر"
                    )}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-secondary">
                    {formatDate(backup.created_at)}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm text-text-secondary">
                    {backup.created_by_name || "خودکار"}
                  </td>
                  <td className="px-3 sm:px-4 py-2 sm:py-3 text-xs sm:text-sm">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => handleDownload(backup)}
                        className="p-1.5 sm:p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                        title="دانلود"
                      >
                        <ArrowDownTrayIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => setRestoreTarget(backup)}
                        className="p-1.5 sm:p-2 rounded-lg bg-success-soft text-success hover:opacity-80 transition-colors"
                        title="بازگردانی"
                      >
                        <ArrowPathIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(backup)}
                        className="p-1.5 sm:p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors"
                        title="حذف"
                      >
                        <TrashIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div
            className="bg-surface rounded-lg p-4 sm:p-6 w-full max-w-md"
            dir="rtl"
          >
            <h3 className="text-base sm:text-lg font-bold mb-3 sm:mb-4 text-text-primary">
              ایجاد بکاپ جدید
            </h3>
            <label className="flex items-center gap-2 sm:gap-3 cursor-pointer mb-4 sm:mb-6">
              <input
                type="checkbox"
                checked={includeUploads}
                onChange={(e) => setIncludeUploads(e.target.checked)}
                className="w-4 h-4 sm:w-5 sm:h-5 text-primary rounded"
              />
              <span className="text-xs sm:text-sm text-text-primary">
                شامل فایل‌های آپلود شده (عکس‌ها)
              </span>
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 border border-border rounded-lg hover:bg-surface-alt order-2 sm:order-1 text-text-primary"
              >
                انصراف
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-4 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50 order-1 sm:order-2"
              >
                {creating ? "در حال ایجاد..." : "ایجاد بکاپ"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Confirm */}
      <ConfirmModal
        isOpen={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={handleRestore}
        title="بازگردانی بکاپ"
        message={`دیتابیس فعلی با بکاپ "${restoreTarget?.filename}" جایگزین می‌شود. قبل از بازگردانی، بکاپ خودکار از وضعیت فعلی گرفته می‌شود. ادامه می‌دهید؟`}
        confirmText="بازگردانی"
        variant="warning"
        loading={restoring}
      />

      {/* Delete Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف بکاپ"
        message={`آیا از حذف "${deleteTarget?.filename}" مطمئن هستید؟`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />

      {/* Restart Instruction Modal */}
      {showRestartModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2 sm:p-4">
          <div
            className="bg-surface rounded-xl shadow-xl w-full max-w-sm mx-auto overflow-hidden"
            dir="rtl"
          >
            <div className="p-4 sm:p-6 text-center">
              <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-success-soft flex items-center justify-center mx-auto mb-3 sm:mb-4">
                <ExclamationTriangleIcon className="w-6 h-6 sm:w-8 sm:h-8 text-success" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-text-primary mb-2">
                بکاپ با موفقیت بازگردانی شد!
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary mb-4 sm:mb-6">
                برای اعمال تغییرات، لطفاً برنامه را ببندید و دوباره با فایل{" "}
                <strong className="text-primary">start.bat</strong> اجرا کنید.
              </p>
              <button
                onClick={() => setShowRestartModal(false)}
                className="w-full px-4 py-2 sm:py-2.5 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover transition-colors text-sm sm:text-base"
              >
                متوجه شدم
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
