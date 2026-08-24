import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  createExport,
  deleteExport,
  getExportDownload,
  getExports,
} from "../api";
import ConfirmModal from "../components/ConfirmModal";
import LoadingSpinner from "../components/LoadingSpinner";
import { errorText } from "../utils/errors";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  TrashIcon,
} from "@heroicons/react/24/solid";
import type { DataExport } from "../types/api";

/** How often the list refreshes while a build is running. */
const POLL_MS = 5000;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Bytes as the workshop reads them, not as the API sends them. */
function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toFixed(1)} مگابایت`;
  return `${Math.round(bytes / 1024)} کیلوبایت`;
}

function StatusBadge({ status }: { status: DataExport["status"] }) {
  if (status === "ready") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-success-soft text-success">
        <CheckCircleIcon className="w-3.5 h-3.5" />
        آماده
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-danger-soft text-danger">
        <ExclamationTriangleIcon className="w-3.5 h-3.5" />
        ناموفق
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-warning-soft text-warning">
      <ArrowPathIcon className="w-3.5 h-3.5 animate-spin" />
      در حال ساخت
    </span>
  );
}

export default function ExportList() {
  const [exports, setExports] = useState<DataExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [includeImages, setIncludeImages] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DataExport | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExports = useCallback(async () => {
    try {
      const res = await getExports();
      setExports(res.data);
    } catch {
      toast.error("خطا در دریافت فهرست خروجی‌ها");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchExports();
  }, [fetchExports]);

  const building = exports.some((row) => row.status === "pending");

  // Polls only while something is being built. A page left open on a settled
  // list should not keep asking the server what it already knows.
  const pollRef = useRef<number | null>(null);
  useEffect(() => {
    if (!building) return;

    pollRef.current = window.setInterval(() => {
      void fetchExports();
    }, POLL_MS);

    return () => {
      if (pollRef.current !== null) window.clearInterval(pollRef.current);
    };
  }, [building, fetchExports]);

  const handleRequest = async () => {
    setRequesting(true);
    try {
      await createExport({ include_images: includeImages });
      toast.success("درخواست ثبت شد. تا آماده شدن فایل چند لحظه صبر کنید");
      await fetchExports();
    } catch (error) {
      toast.error(errorText(error, "خطا در ثبت درخواست"));
    } finally {
      setRequesting(false);
    }
  };

  const handleDownload = async (row: DataExport) => {
    try {
      const res = await getExportDownload(row.id);
      // A signed URL valid for fifteen minutes: opened rather than stored,
      // so nothing on this page is a working credential.
      window.location.href = res.data.url;
    } catch (error) {
      toast.error(errorText(error, "خطا در دریافت فایل"));
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteExport(deleteTarget.id);
      toast.success("خروجی حذف شد");
      setDeleteTarget(null);
      await fetchExports();
    } catch (error) {
      toast.error(errorText(error, "خطا در حذف خروجی"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div dir="rtl" className="px-2 sm:px-0">
      <div className="mb-4 sm:mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
          <ArrowDownTrayIcon className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
          خروجی اطلاعات
        </h1>
      </div>

      {/* What this page is, and what it is not */}
      <div className="bg-primary-soft border border-primary-soft rounded-lg p-4 mb-4 sm:mb-6">
        <p className="text-sm text-primary leading-7">
          نگهداری و پشتیبان‌گیری از اطلاعات به‌صورت خودکار توسط سرویس انجام
          می‌شود و نیازی به اقدام شما نیست. این صفحه برای زمانی است که بخواهید
          یک نسخه از اطلاعات کارگاه خود را روی رایانه داشته باشید.
        </p>
      </div>

      {/* Request */}
      <div className="bg-surface shadow rounded-lg p-4 sm:p-6 mb-4 sm:mb-6">
        <h2 className="text-base sm:text-lg font-medium text-text-primary mb-3">
          درخواست خروجی تازه
        </h2>
        <p className="text-sm text-text-secondary leading-7 mb-4">
          یک فایل zip شامل مشتریان، دستگاه‌ها، کالاها و همه‌ی فاکتورها در قالب
          اکسل.
        </p>

        <label className="flex items-center gap-2 cursor-pointer mb-4">
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(e) => setIncludeImages(e.target.checked)}
            disabled={requesting || building}
            className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
          />
          <span className="text-sm text-text-primary flex items-center gap-1">
            <PhotoIcon className="w-4 h-4 text-text-secondary" />
            عکس‌های دستگاه‌ها هم اضافه شود
          </span>
        </label>

        {includeImages && (
          <p className="text-xs text-warning mb-4">
            با احتساب عکس‌ها، حجم فایل بیشتر و ساخت آن طولانی‌تر می‌شود.
          </p>
        )}

        <button
          onClick={handleRequest}
          disabled={requesting || building}
          className="px-4 py-2 bg-primary text-text-inverse rounded-lg hover:bg-primary-hover disabled:opacity-50 flex items-center gap-2 text-sm"
        >
          <ArrowDownTrayIcon className="w-4 h-4" />
          {building ? "خروجی قبلی در حال ساخت است" : "ساخت خروجی"}
        </button>
      </div>

      {/* History */}
      {loading ? (
        <div className="flex justify-center items-center h-40">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : exports.length === 0 ? (
        <div className="text-center py-16 text-text-secondary">
          هنوز خروجی‌ای ساخته نشده است
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[700px] lg:min-w-full divide-y divide-border">
              <thead className="bg-primary-soft">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تاریخ
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    وضعیت
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    حجم
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    عکس‌ها
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    درخواست‌کننده
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {exports.map((row, index) => (
                  <tr
                    key={row.id}
                    className={index % 2 === 0 ? "bg-surface" : "bg-surface-alt"}
                  >
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-primary">
                      {formatDate(row.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center border-l border-border">
                      <StatusBadge status={row.status} />
                      {row.error && (
                        <p className="text-xs text-danger mt-1">{row.error}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-secondary">
                      {formatSize(row.size_bytes)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-secondary">
                      {row.includes_images ? "دارد" : "ندارد"}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-secondary">
                      {row.created_by_name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1 justify-center">
                        {row.status === "ready" && (
                          <button
                            onClick={() => handleDownload(row)}
                            className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                            title="دانلود"
                          >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                          </button>
                        )}
                        {row.status !== "pending" && (
                          <button
                            onClick={() => setDeleteTarget(row)}
                            className="p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors cursor-pointer"
                            title="حذف"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف خروجی"
        message="این فایل حذف می‌شود. اطلاعات کارگاه شما دست‌نخورده می‌ماند و هر زمان می‌توانید خروجی تازه بگیرید."
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
