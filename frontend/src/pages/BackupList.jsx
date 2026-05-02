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
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ArchiveBoxIcon className="w-6 h-6 text-gray-600" />
          پشتیبان‌گیری
        </h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          بکاپ جدید
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text="در حال بارگذاری..." />
        </div>
      ) : backups.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <ArchiveBoxIcon className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <p>هیچ بکاپی ثبت نشده است</p>
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  نام فایل
                </th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  حجم
                </th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  شامل آپلود
                </th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  تاریخ
                </th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  ایجادکننده
                </th>
                <th className="px-4 py-3 text-center font-semibold text-indigo-700">
                  عملیات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {backups.map((backup, index) => (
                <tr
                  key={backup.id}
                  className={`hover:bg-gray-50 ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                >
                  <td className="px-4 py-3 text-sm font-mono">
                    {backup.filename}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatSize(backup.size_bytes)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    {backup.includes_uploads ? (
                      <span className="flex items-center gap-1 text-green-700">
                        <PhotoIcon className="w-4 h-4" />
                        بله
                      </span>
                    ) : (
                      "خیر"
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatDate(backup.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {backup.created_by_name || "خودکار"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => handleDownload(backup)}
                        className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        title="دانلود"
                      >
                        <ArrowDownTrayIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setRestoreTarget(backup)}
                        className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                        title="بازگردانی"
                      >
                        <ArrowPathIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setDeleteTarget(backup)}
                        className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors"
                        title="حذف"
                      >
                        <TrashIcon className="w-5 h-5" />
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md" dir="rtl">
            <h3 className="text-lg font-bold mb-4">ایجاد بکاپ جدید</h3>
            <label className="flex items-center gap-3 cursor-pointer mb-6">
              <input
                type="checkbox"
                checked={includeUploads}
                onChange={(e) => setIncludeUploads(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded"
              />
              <span className="text-sm text-gray-700">
                شامل فایل‌های آپلود شده (عکس‌ها)
              </span>
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                انصراف
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden"
            dir="rtl"
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                بکاپ با موفقیت بازگردانی شد!
              </h3>
              <p className="text-sm text-gray-600 mb-6">
                برای اعمال تغییرات، لطفاً برنامه را ببندید و دوباره با فایل{" "}
                <strong className="text-blue-600">start.bat</strong> اجرا کنید.
              </p>
              <button
                onClick={() => setShowRestartModal(false)}
                className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
