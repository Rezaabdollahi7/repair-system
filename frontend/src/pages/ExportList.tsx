import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  createExport,
  deleteExport,
  getExportDownload,
  getExports,
} from "../api";
import ConfirmModal from "../components/ConfirmModal";
import StatusPill from "../components/StatusPill";
import { errorText } from "../utils/errors";
import { toPersianDigits } from "../utils/formatters";
import { motion } from "framer-motion";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  InformationCircleIcon,
  PhotoIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 20px is a disc. */
import {
  ArrowDownTrayIcon as ArrowDownTrayOutline,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { staggerContainer, staggerItem } from "../motion";
import {
  actionConfirm,
  actionDelete,
  primaryButton,
  rowCard,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  tr,
} from "../utils/tableClasses";
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

/**
 * Bytes as the workshop reads them, not as the API sends them.
 *
 * Persian digits, like every other figure in the app — this was the last
 * place still printing `12.4 مگابایت` with Latin numerals, and the decimal
 * separator has to match them.
 */
function formatSize(bytes: number): string {
  if (bytes === 0) return "—";
  const mb = bytes / (1024 * 1024);
  const value =
    mb >= 1
      ? mb.toFixed(1).replace(/\.0$/, "")
      : String(Math.round(bytes / 1024));
  const unit = mb >= 1 ? "مگابایت" : "کیلوبایت";
  return `${toPersianDigits(value).replace(".", "٫")} ${unit}`;
}

/**
 * Where a build has got to.
 *
 * Three states with a fixed reading — ready is good, failed is not, building
 * is neither yet — so they take the reserved semantic tones rather than
 * chart colours. The spinner on the pending pill is the one place in the app
 * a badge animates, and it earns it: the row is the only thing telling the
 * user the server is still working.
 */
const EXPORT_STATUSES: Record<
  DataExport["status"],
  { label: string; color: string; tone: string }
> = {
  ready: {
    label: "آماده",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
  failed: {
    label: "ناموفق",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
  pending: {
    label: "در حال ساخت",
    color: "var(--warning)",
    tone: "bg-warning-soft text-warning-fg",
  },
};

function StatusBadge({ status }: { status: DataExport["status"] }) {
  const { label, color, tone } = EXPORT_STATUSES[status];

  if (status === "pending") {
    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill
                    text-body-xs font-bold whitespace-nowrap ${tone}`}
      >
        <ArrowPathIcon
          className="w-3.5 h-3.5 animate-spin"
          aria-hidden="true"
        />
        {label}
      </span>
    );
  }

  return <StatusPill label={label} color={color} tone={tone} size="sm" />;
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

  /*
   * Row actions, neutral until hovered — the same treatment the other lists
   * got. Download was a tinted square and delete a red one on every settled
   * row, which put two colours beside a status badge already saying what the
   * row is.
   */

  const rowActions = (row: DataExport) => (
    <div className="flex gap-1 justify-end items-center">
      {row.status === "ready" && (
        <button
          onClick={() => handleDownload(row)}
          className={actionConfirm}
          title="دانلود"
        >
          <ArrowDownTrayOutline className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
      {row.status !== "pending" && (
        <button
          onClick={() => setDeleteTarget(row)}
          className={actionDelete}
          title="حذف"
        >
          <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
    </div>
  );

  const skeleton = (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 4 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[3, 2, 2, 2, 3, 2].map((span, cell) => (
              <div
                key={cell}
                className="h-4 rounded-field bg-surface-alt"
                style={{ flexGrow: span, flexBasis: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="lg:hidden space-y-3">
        {[0, 1, 2].map((card) => (
          <div
            key={card}
            className="h-28 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div dir="rtl">
      {/*
        What this page is, and what it is not.
        -----------------------------------------------------------------
        The informational tone, not the brand one. It was `bg-primary-soft
        border-primary-soft` with `text-primary` text, and the palette change
        turned all three into sand and ink — a notice with no border and
        barely a background, sitting on a cream page. This is exactly what
        --info is for, and nothing else in the app was using it.
      */}
      <div className="flex items-start gap-3 bg-info-soft border border-info/25 rounded-panel p-4 mb-4">
        <span className="shrink-0 w-9 h-9 rounded-field bg-info/15 flex items-center justify-center">
          <InformationCircleIcon
            className="w-5 h-5 text-info-fg"
            aria-hidden="true"
          />
        </span>
        <p className="text-body-sm text-info-fg leading-7">
          نگهداری و پشتیبان‌گیری از اطلاعات به‌صورت خودکار توسط سرویس انجام
          می‌شود و نیازی به اقدام شما نیست. این صفحه برای زمانی است که بخواهید
          یک نسخه از اطلاعات کارگاه خود را روی رایانه داشته باشید.
        </p>
      </div>

      {/* Request */}
      <div className="bg-surface border border-border rounded-panel shadow-sm p-5 mb-4">
        <h2 className="text-title-sm font-bold text-text-primary mb-1">
          درخواست خروجی تازه
        </h2>
        <p className="text-body-sm text-text-secondary leading-7 mb-4">
          یک فایل zip شامل مشتریان، دستگاه‌ها، کالاها و همه‌ی فاکتورها در قالب
          اکسل.
        </p>

        <label className="flex items-center gap-2 cursor-pointer mb-4 w-fit">
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(e) => setIncludeImages(e.target.checked)}
            disabled={requesting || building}
            className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
          />
          <span className="text-body-sm text-text-primary flex items-center gap-1.5">
            <PhotoIcon className="w-4 h-4 text-text-muted" aria-hidden="true" />
            عکس‌های دستگاه‌ها هم اضافه شود
          </span>
        </label>

        {includeImages && (
          <p className="text-body-xs text-warning-fg mb-4">
            با احتساب عکس‌ها، حجم فایل بیشتر و ساخت آن طولانی‌تر می‌شود.
          </p>
        )}

        <button
          onClick={handleRequest}
          disabled={requesting || building}
          className={`${primaryButton} flex-none disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <ArrowDownTrayIcon
            className="w-[1.15rem] h-[1.15rem]"
            aria-hidden="true"
          />
          {building ? "خروجی قبلی در حال ساخت است" : "ساخت خروجی"}
        </button>
      </div>

      {/* History */}
      {loading ? (
        skeleton
      ) : exports.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <ArrowDownTrayIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            هنوز خروجی‌ای ساخته نشده
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            با دکمهٔ بالا یک نسخه از اطلاعات کارگاه بسازید؛ فایل تا چند دقیقه
            آماده می‌شود.
          </p>
        </div>
      ) : (
        <>
          {/* Below lg the table becomes one card per export — six columns
              needed 700px, which a phone had to be dragged across. */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {exports.map((row) => (
              <motion.li key={row.id} variants={staggerItem}>
                <div className={rowCard}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-text-primary tabular-nums">
                        {formatDate(row.created_at)}
                      </p>
                      <p className="text-body-xs text-text-muted">
                        {row.created_by_name ?? "—"}
                      </p>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>

                  {row.error && (
                    <p className="text-body-xs text-danger-fg mt-2">
                      {row.error}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle">
                    <span className="text-body-xs text-text-muted tabular-nums">
                      {formatSize(row.size_bytes)}
                      {row.includes_images ? " — با عکس" : ""}
                    </span>
                    {rowActions(row)}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[820px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>تاریخ</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>حجم</th>
                    <th className={th}>عکس‌ها</th>
                    <th className={th}>درخواست‌کننده</th>
                    <th className={th}>عملیات</th>
                  </tr>
                </thead>
                {/*
                  divide-y, not zebra stripes. The rows were painted on
                  alternating surfaces, which no other table in the app does,
                  and against the cream page the striped rows read as two
                  different kinds of row rather than as a rhythm.
                */}
                <tbody className={tbody}>
                  {exports.map((row) => (
                    <tr key={row.id} className={tr}>
                      <td className={`${td} tabular-nums`}>
                        {formatDate(row.created_at)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={row.status} />
                        {row.error && (
                          <p className="text-body-xs text-danger-fg mt-1">
                            {row.error}
                          </p>
                        )}
                      </td>
                      <td className={`${tdMuted} tabular-nums`}>
                        {formatSize(row.size_bytes)}
                      </td>
                      <td className={tdMuted}>
                        {row.includes_images ? "دارد" : "ندارد"}
                      </td>
                      <td className={tdMuted}>{row.created_by_name ?? "—"}</td>
                      <td className="px-3 py-3">{rowActions(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
