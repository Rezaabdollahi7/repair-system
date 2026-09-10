import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowPathIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  ClockIcon,
  ClipboardDocumentCheckIcon,
  IdentificationIcon,
  PencilSquareIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { getPersonnelOverview, togglePersonnelActive } from "../api";
import { useModal } from "../context/ModalContext";
import { usePageCrumb } from "../context/BreadcrumbContext";
import { useAuth } from "../context/AuthContext";
import ConfirmModal from "../components/ConfirmModal";
import StatusPill from "../components/StatusPill";
import DonutChart from "../components/charts/DonutChart";
import ColumnChart from "../components/charts/ColumnChart";
import { ChartTable } from "../components/charts/chartKit";
import { DEVICE_STATUSES, deviceStatusOf } from "../utils/deviceStatus";
import { roleStyleOf } from "../utils/roleStatus";
import { errorText } from "../utils/errors";
import { formatPersianDate, toPersianDigits } from "../utils/formatters";
import { staggerContainer, staggerItem } from "../motion";
import {
  actionConfirm,
  actionNeutral,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdBare,
  tdMuted,
  th,
  thead,
  trClickable,
} from "../utils/tableClasses";
import type { PersonnelOverview } from "../types/api";

/* ── Section shell ─────────────────────────────────────────────────── */

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: typeof ChartBarIcon;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={staggerItem}
      className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-6"
    >
      <div className="mb-4">
        <h2 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-secondary" />
          {title}
        </h2>
        {subtitle && (
          <p className="text-body-xs text-text-muted mt-1">{subtitle}</p>
        )}
      </div>
      {children}
    </motion.section>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-text-primary",
}: {
  icon: typeof ChartBarIcon;
  label: string;
  value: React.ReactNode;
  tone?: string;
}) {
  return (
    <div className="bg-surface-alt border border-border rounded-field p-3 sm:p-4">
      <div className="flex items-center gap-2 mb-2 text-text-secondary">
        <Icon className="w-4 h-4 shrink-0" />
        <span className="text-body-xs sm:text-body-sm truncate">{label}</span>
      </div>
      <p className={`text-title-sm font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

/* ── Skeleton ──────────────────────────────────────────────────────── */

function DetailSkeleton() {
  return (
    <div className="animate-pulse space-y-4 sm:space-y-6">
      <div className="bg-surface border border-border rounded-panel p-6">
        <div className="h-6 w-48 rounded-field bg-surface-alt mb-3" />
        <div className="h-4 w-64 rounded-field bg-surface-alt" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-field bg-surface border border-border"
          />
        ))}
      </div>
      <div className="h-72 rounded-panel bg-surface border border-border" />
    </div>
  );
}

/* ── The page ──────────────────────────────────────────────────────── */

export default function PersonnelDetail() {
  const { id } = useParams<{ id: string }>();
  const personnelId = Number(id);
  const { user, isAtLeast } = useAuth();
  const { openPersonnelEdit, openDeviceDetail, refreshList } = useModal();

  const [data, setData] = useState<PersonnelOverview | null>(null);
  /*
   * A route param that is not a number never reaches the server: there is
   * nothing to load, so the page is not loading — it is already at its
   * "no such record" state.
   */
  const validId = Number.isFinite(personnelId);
  const [loading, setLoading] = useState(validId);
  const [failed, setFailed] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const [toggling, setToggling] = useState(false);

  /*
   * Never raises `loading` — it starts true and only ever falls. A reload
   * after a modal closes is a background refresh, and blanking a page the
   * reader is looking at, to redraw the same thing a moment later, is a
   * flash rather than feedback.
   */
  const load = useCallback(async () => {
    if (!validId) return;

    try {
      const res = await getPersonnelOverview(personnelId);
      setData(res.data);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(errorText(error, "خطا در دریافت اطلاعات پرسنل"));
    } finally {
      setLoading(false);
    }
  }, [personnelId, validId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    refreshList(load);
    return () => refreshList(null);
  }, [refreshList, load]);

  usePageCrumb({
    name: data?.personnel.full_name ?? "پرسنل",
    parent: { name: "پرسنل", path: "/personnel" },
  });

  const toggleActive = async () => {
    setToggling(true);
    try {
      await togglePersonnelActive(personnelId);
      toast.success(
        `کاربر ${data?.personnel.is_active ? "غیرفعال" : "فعال"} شد`,
      );
      setConfirmToggle(false);
      await load();
    } catch (error) {
      toast.error(errorText(error, "خطا در تغییر وضعیت"));
    } finally {
      setToggling(false);
    }
  };

  if (loading) return <DetailSkeleton />;

  if (!validId || failed || !data) {
    return (
      <div className="bg-surface border border-border rounded-panel p-10 text-center">
        <p className="text-body-md text-text-secondary mb-4">
          این کاربر پیدا نشد.
        </p>
        <a href="/personnel" className={secondaryButton}>
          بازگشت به فهرست پرسنل
        </a>
      </div>
    );
  }

  const { personnel, kpi, status_breakdown, history, monthly } = data;
  const role = roleStyleOf(personnel.role_name);

  /*
   * An admin may act on technicians only; a super admin has no such limit.
   * The same rule the personnel list applies, and the same rule the server
   * enforces — this only hides a control the API would refuse anyway.
   */
  const outranked =
    user?.role === "admin" &&
    (personnel.role_name === "super_admin" || personnel.role_name === "admin");
  const canManage = isAtLeast("admin") && !outranked;
  const canToggle = canManage && personnel.id !== user?.id;

  /*
   * Ring slices in the workflow's own order, taking each status's own
   * colour. Ordering by the workflow rather than by size is what makes the
   * palette's colour-blindness check mean anything: only neighbours touch,
   * so a ring sorted by count has no fixed adjacency to have validated.
   */
  const counts = new Map(
    status_breakdown.map((entry) => [entry.status, entry.count]),
  );
  const slices = DEVICE_STATUSES.filter((status) => counts.has(status.key)).map(
    (status) => ({
      label: status.label,
      value: counts.get(status.key) ?? 0,
      color: status.color,
    }),
  );

  const assignedTotal = status_breakdown.reduce(
    (sum, entry) => sum + entry.count,
    0,
  );
  const monthlyTotal = monthly.reduce((sum, point) => sum + point.count, 0);

  return (
    <motion.div
      dir="rtl"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className="space-y-4 sm:space-y-6"
    >
      {/* ── ۱. هدر اطلاعات ────────────────────────────────────────── */}
      <motion.header
        variants={staggerItem}
        className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span
              className="w-12 h-12 shrink-0 rounded-full bg-primary-soft
                         text-primary flex items-center justify-center"
            >
              <IdentificationIcon className="w-7 h-7" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-title-sm sm:text-title-md font-bold text-text-primary truncate">
                  {personnel.full_name}
                </h2>
                <StatusPill
                  label={personnel.role_label}
                  color={role.color}
                  tone={role.tone}
                  size="sm"
                />
                {/* Active vs not is a state with a severity, so it takes a
                    reserved tone rather than a series colour. */}
                <StatusPill
                  label={personnel.is_active ? "فعال" : "غیرفعال"}
                  color={
                    personnel.is_active
                      ? "var(--success-strong-fg)"
                      : "var(--text-muted)"
                  }
                  tone={
                    personnel.is_active
                      ? "bg-success-soft text-success-fg"
                      : "bg-surface-alt text-text-secondary"
                  }
                  size="sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-body-sm text-text-secondary">
                {/* The username *is* the phone number — one field, said
                    once, rather than twice under two labels. `phone` is a
                    separate optional contact number. */}
                <span className="tabular-nums" dir="ltr">
                  {toPersianDigits(personnel.username)}
                </span>
                {personnel.phone && personnel.phone !== personnel.username && (
                  <span className="tabular-nums" dir="ltr">
                    {toPersianDigits(personnel.phone)}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <CalendarDaysIcon className="w-4 h-4" />
                  عضویت از {formatPersianDate(personnel.created_at)}
                </span>
              </div>
            </div>
          </div>

          {canManage && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openPersonnelEdit(personnel.id)}
                className={secondaryButton}
              >
                <PencilSquareIcon className="w-4 h-4" />
                ویرایش
              </button>
              {canToggle && (
                <button
                  type="button"
                  onClick={() => setConfirmToggle(true)}
                  /* The button wears the colour of the state it moves to.
                     Switching someone off is the quiet, reversible one. */
                  className={`${
                    personnel.is_active ? actionNeutral : actionConfirm
                  } flex items-center gap-2 px-4`}
                >
                  {personnel.is_active ? (
                    <>
                      <XCircleIcon className="w-4 h-4" />
                      غیرفعال‌سازی
                    </>
                  ) : (
                    <>
                      <CheckCircleIcon className="w-4 h-4" />
                      فعال‌سازی
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </motion.header>

      {/* ── ۲. آمار عملکرد ────────────────────────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="grid grid-cols-2 lg:grid-cols-4 gap-3"
      >
        <Stat
          icon={ArrowPathIcon}
          label="دستگاه‌های فعال"
          value={toPersianDigits(kpi.active_devices)}
        />
        <Stat
          icon={ClipboardDocumentCheckIcon}
          label="تعمیرات تکمیل‌شده"
          value={toPersianDigits(kpi.completed_repairs)}
        />
        <Stat
          icon={CheckCircleIcon}
          label="تعمیرات موفق"
          value={toPersianDigits(kpi.successful_repairs)}
          tone="text-success-fg"
        />
        <Stat
          icon={ClockIcon}
          label="میانگین زمان تعمیر"
          value={
            kpi.avg_repair_days === null
              ? "—"
              : `${toPersianDigits(kpi.avg_repair_days.toFixed(1))} روز`
          }
        />
      </motion.div>

      {/* ── وضعیت دستگاه‌های سپرده‌شده ─────────────────────────────── */}
      <Section
        icon={WrenchScrewdriverIcon}
        title="وضعیت دستگاه‌های سپرده‌شده"
        subtitle={`${toPersianDigits(assignedTotal)} دستگاه در مجموع به این تعمیرکار سپرده شده است`}
      >
        <DonutChart
          slices={slices}
          centreLabel="دستگاه"
          emptyMessage="هنوز دستگاهی به این تعمیرکار سپرده نشده است."
        />
      </Section>

      {/* ── ۴. عملکرد تعمیرات ماهانه ──────────────────────────────── */}
      <Section
        icon={ChartBarIcon}
        title="عملکرد ماهانه"
        subtitle={`دستگاه‌های تکمیل‌شده در دوازده ماه گذشته — ${toPersianDigits(monthlyTotal)} دستگاه`}
      >
        <ColumnChart
          columns={monthly.map((point) => ({
            label: point.label,
            value: point.count,
          }))}
          unit="دستگاه"
          emptyMessage="در دوازده ماه گذشته دستگاهی تکمیل نشده است."
        />
        {/* The relief channel the palette's contrast check requires, and the
            only way to read an exact month on a touch screen. */}
        <ChartTable
          caption="نمایش جدول اعداد"
          columns={["ماه", "دستگاه"]}
          rows={monthly.map((point) => [
            point.label,
            toPersianDigits(point.count),
          ])}
        />
      </Section>

      {/* ── ۳. تاریخچه تعمیرات ────────────────────────────────────── */}
      <Section
        icon={ClipboardDocumentCheckIcon}
        title="تاریخچه تعمیرات"
        subtitle="دستگاه‌هایی که به این تعمیرکار سپرده شده‌اند، تازه‌ترین اول"
      >
        {history.length === 0 ? (
          <p className="text-body-sm text-text-muted text-center py-8">
            هنوز دستگاهی به این تعمیرکار سپرده نشده است.
          </p>
        ) : (
          <div className={tableCard}>
            <div className={tableScroll}>
              {/* A minimum width so the columns keep their shape and the
                  card scrolls, rather than `w-full` crushing six of them
                  into a phone. */}
              <table className="w-full min-w-[44rem]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>پذیرش</th>
                    <th className={th}>دستگاه</th>
                    <th className={th}>برند و مدل</th>
                    <th className={th}>نتیجه</th>
                    <th className={th}>زمان تعمیر</th>
                    <th className={th}>تاریخ ثبت</th>
                    <th className={th}>تاریخ خروج</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {history.map((row) => {
                    const status = deviceStatusOf(row.status);
                    return (
                      <tr
                        key={row.device_id}
                        onClick={() => openDeviceDetail(row.device_id)}
                        className={trClickable}
                      >
                        <td className={`${td} tabular-nums`}>
                          {toPersianDigits(row.device_id)}
                        </td>
                        <td className={td}>{row.device_name}</td>
                        <td className={tdMuted}>
                          {[row.brand, row.model].filter(Boolean).join(" ") ||
                            "—"}
                        </td>
                        <td className={tdBare}>
                          <StatusPill
                            label={status.label}
                            color={status.color}
                            size="sm"
                          />
                        </td>
                        <td className={`${td} tabular-nums`}>
                          {row.repair_days === null
                            ? "—"
                            : `${toPersianDigits(row.repair_days)} روز`}
                        </td>
                        <td className={tdMuted}>
                          {formatPersianDate(row.entry_date)}
                        </td>
                        <td className={tdMuted}>
                          {row.exit_date
                            ? formatPersianDate(row.exit_date)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <ConfirmModal
        isOpen={confirmToggle}
        title={personnel.is_active ? "غیرفعال‌سازی کاربر" : "فعال‌سازی کاربر"}
        message={
          personnel.is_active
            ? `«${personnel.full_name}» دیگر نمی‌تواند وارد شود. دستگاه‌های سپرده‌شده به او دست‌نخورده می‌مانند.`
            : `«${personnel.full_name}» دوباره می‌تواند وارد شود.`
        }
        confirmText={personnel.is_active ? "غیرفعال کن" : "فعال کن"}
        variant={personnel.is_active ? "warning" : "info"}
        loading={toggling}
        onConfirm={toggleActive}
        onClose={() => setConfirmToggle(false)}
      />
    </motion.div>
  );
}
