import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import {
  ArrowPathIcon,
  BanknotesIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CubeIcon,
  DocumentTextIcon,
  PencilSquareIcon,
  PlusIcon,
  UserCircleIcon,
  WrenchScrewdriverIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
import { getCustomerOverview, updateCustomerNotes } from "../api";
import { useModal } from "../context/ModalContext";
import { usePageCrumb } from "../context/BreadcrumbContext";
import { useAuth } from "../context/AuthContext";
import StatusPill from "../components/StatusPill";
import PersonnelLink from "../components/PersonnelLink";
import { deviceStatusOf } from "../utils/deviceStatus";
import { paymentStatusOf } from "../utils/invoiceStatus";
import { errorText } from "../utils/errors";
import {
  formatPersianCurrency,
  formatPersianDate,
  formatPersianPhone,
  toPersianDigits,
} from "../utils/formatters";
import { staggerContainer, staggerItem } from "../motion";
import {
  primaryButton,
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
import type {
  CustomerInvoiceRow,
  CustomerOverview,
  CustomerTimelineEntry,
  CustomerTimelineEvent,
} from "../types/api";

/* ── Section shell ─────────────────────────────────────────────────── */

/**
 * Every block on this page is the same card with the same heading, so the
 * page reads as one document rather than six widgets that happen to be
 * stacked. Same shape as the invoice forms' bands.
 */
function Section({
  icon: Icon,
  title,
  action,
  children,
}: {
  icon: typeof CubeIcon;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      variants={staggerItem}
      className="bg-surface border border-border rounded-panel shadow-sm p-4 sm:p-6"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
          <Icon className="w-5 h-5 text-text-secondary" />
          {title}
        </h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-body-sm text-text-muted text-center py-8">{children}</p>
  );
}

/* ── 2. Summary ────────────────────────────────────────────────────── */

/**
 * A figure and what it counts.
 *
 * `tone` colours the figure only where the colour means something: the
 * failed-repair count earns the danger tone, the successful one the success
 * tone, and the rest stay ink. Six coloured numbers in a row would say
 * nothing at all.
 */
function Stat({
  icon: Icon,
  label,
  value,
  tone = "text-text-primary",
}: {
  icon: typeof CubeIcon;
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

/* ── 4. Repair history ─────────────────────────────────────────────── */

/*
 * The custom property, not the Tailwind class name: `text-info-fg` is a
 * class that maps to `--info-strong-fg`, and `var(--info-fg)` is nothing at
 * all — which paints a transparent dot rather than failing loudly.
 */
const EVENT_COPY: Record<
  CustomerTimelineEvent["type"],
  { verb: string; color: string }
> = {
  registered: { verb: "ثبت شد", color: "var(--info-strong-fg)" },
  invoiced: { verb: "فاکتور صادر شد", color: "var(--warning-strong-fg)" },
  paid: { verb: "پرداخت شد", color: "var(--success-strong-fg)" },
  delivered: { verb: "تحویل داده شد", color: "var(--text-secondary)" },
};

function TimelineEntry({ entry }: { entry: CustomerTimelineEntry }) {
  const status = deviceStatusOf(entry.status);
  const subtitle = [entry.brand, entry.model].filter(Boolean).join(" ");

  return (
    <li className="border border-border rounded-field p-3 sm:p-4 bg-surface-alt">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="font-bold text-text-primary">{entry.device_name}</span>
        {subtitle && (
          <span className="text-body-sm text-text-secondary">{subtitle}</span>
        )}
        <span className="ms-auto">
          <StatusPill label={status.label} color={status.color} size="sm" />
        </span>
      </div>

      {/*
        A rail down one side with a dot per event. `border-inline-start` is
        the right edge in RTL, which is the side the eye starts on — the
        logical property rather than `border-l`, which would put the rail on
        the wrong side of the text.
      */}
      <ol className="ps-4 space-y-2.5 border-s-2 border-border">
        {entry.events.map((event, index) => {
          const copy = EVENT_COPY[event.type];
          return (
            <li key={index} className="relative">
              <span
                aria-hidden="true"
                className="absolute -start-[1.3rem] top-1.5 w-2.5 h-2.5 rounded-full
                           ring-2 ring-surface-alt"
                style={{ backgroundColor: copy.color }}
              />
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-body-sm text-text-primary">
                  {copy.verb}
                </span>
                {event.invoice_number && (
                  <span
                    dir="ltr"
                    className="text-body-xs text-text-secondary tabular-nums"
                  >
                    {event.invoice_number}
                  </span>
                )}
                {event.amount !== undefined && (
                  <span className="text-body-xs text-text-secondary tabular-nums">
                    {formatPersianCurrency(event.amount)} ریال
                  </span>
                )}
                <span className="ms-auto text-body-xs text-text-muted">
                  {formatPersianDate(event.date)}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </li>
  );
}

/* ── 6. Internal note ──────────────────────────────────────────────── */

function NotesPanel({
  initial,
  onSave,
}: {
  initial: string | null;
  onSave: (notes: string | null) => Promise<void>;
}) {
  /*
   * Seeded once and then owned by the field. The panel is keyed on the
   * customer id by its parent, so moving to another customer remounts it
   * with their note — the React-sanctioned way to reset state on a prop
   * change, and one that cannot fight text the user is still typing.
   */
  const [text, setText] = useState(initial ?? "");
  const [saving, setSaving] = useState(false);

  const dirty = text.trim() !== (initial ?? "").trim();

  const save = async () => {
    setSaving(true);
    try {
      await onSave(text.trim() || null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={4}
        maxLength={5000}
        placeholder="مثلاً: دیر پرداخت می‌کند — تا تسویه نکرده دستگاه را تحویل ندهید."
        className="w-full border border-border-field rounded-field px-3 py-2 text-body-sm
                   bg-surface text-text-primary hover:border-border-strong
                   focus:outline-none focus:border-primary
                   focus:shadow-[0_0_0_3px_var(--primary-soft)]
                   transition-[border-color,box-shadow] resize-y"
      />
      <div className="flex items-center justify-between gap-3 mt-3">
        {/* Says who sees this, because the answer is not obvious and the
            field invites frank language. */}
        <p className="text-body-xs text-text-muted">
          فقط کارکنان این کارگاه می‌بینند — روی فاکتور چاپ نمی‌شود.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className={`${primaryButton} disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? "در حال ذخیره..." : "ذخیره یادداشت"}
        </button>
      </div>
    </>
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="h-24 rounded-field bg-surface border border-border"
          />
        ))}
      </div>
      <div className="h-64 rounded-panel bg-surface border border-border" />
    </div>
  );
}

/* ── The page ──────────────────────────────────────────────────────── */

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>();
  const customerId = Number(id);
  const { isAtLeast } = useAuth();
  const {
    openCustomerEdit,
    openDeviceDetail,
    openDeviceCreateForCustomer,
    openSaleInvoiceDetail,
    openRepairInvoiceDetail,
    refreshList,
  } = useModal();

  const [data, setData] = useState<CustomerOverview | null>(null);
  /*
   * A route param that is not a number never reaches the server: there is
   * nothing to load, so the page is not loading — it is already at its
   * "no such record" state.
   */
  const validId = Number.isFinite(customerId);
  const [loading, setLoading] = useState(validId);
  const [failed, setFailed] = useState(false);

  /*
   * Never raises `loading` — it starts true and only ever falls. A reload
   * after a modal closes is a background refresh, and blanking a page the
   * reader is looking at, to redraw the same thing a moment later, is a
   * flash rather than feedback.
   */
  const load = useCallback(async () => {
    if (!validId) return;

    try {
      const res = await getCustomerOverview(customerId);
      setData(res.data);
      setFailed(false);
    } catch (error) {
      setFailed(true);
      toast.error(errorText(error, "خطا در دریافت اطلاعات مشتری"));
    } finally {
      setLoading(false);
    }
  }, [customerId, validId]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Any modal opened from this page edits something the page is showing, so
   * closing one reloads it — the same contract the list pages have.
   */
  useEffect(() => {
    refreshList(load);
    return () => refreshList(null);
  }, [refreshList, load]);

  // The shell names the screen; only this page knows the customer's name.
  usePageCrumb({
    name: data?.customer.name ?? "مشتری",
    parent: { name: "مشتریان", path: "/customers" },
  });

  const saveNotes = async (notes: string | null) => {
    try {
      await updateCustomerNotes(customerId, { notes });
      setData((prev) =>
        prev ? { ...prev, customer: { ...prev.customer, notes } } : prev,
      );
      toast.success("یادداشت ذخیره شد");
    } catch (error) {
      toast.error(errorText(error, "خطا در ذخیره یادداشت"));
    }
  };

  const openInvoice = (invoice: CustomerInvoiceRow) =>
    invoice.kind === "repair"
      ? openRepairInvoiceDetail(invoice.id)
      : openSaleInvoiceDetail(invoice.id);

  if (loading) return <DetailSkeleton />;

  if (!validId || failed || !data) {
    return (
      <div className="bg-surface border border-border rounded-panel p-10 text-center">
        <p className="text-body-md text-text-secondary mb-4">
          این مشتری پیدا نشد.
        </p>
        <a href="/customers" className={secondaryButton}>
          بازگشت به فهرست مشتریان
        </a>
      </div>
    );
  }

  const { customer, summary, devices, timeline, invoices } = data;

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
              <UserCircleIcon className="w-7 h-7" />
            </span>
            <div className="min-w-0">
              <h2 className="text-title-sm sm:text-title-md font-bold text-text-primary truncate">
                {customer.name}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-body-sm text-text-secondary">
                <span className="tabular-nums" dir="ltr">
                  {formatPersianPhone(customer.phone) || "—"}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDaysIcon className="w-4 h-4" />
                  عضویت از {formatPersianDate(customer.created_at)}
                </span>
              </div>
            </div>
          </div>

          {/* Both actions are writes, so both follow the same rule the row
              actions do: admin and above. */}
          {isAtLeast("admin") && (
            <div className="flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openCustomerEdit(customer.id)}
                className={secondaryButton}
              >
                <PencilSquareIcon className="w-4 h-4" />
                ویرایش
              </button>
              <button
                type="button"
                onClick={() =>
                  openDeviceCreateForCustomer({
                    id: customer.id,
                    name: customer.name,
                  })
                }
                className={primaryButton}
              >
                <PlusIcon className="w-4 h-4" />
                ثبت دستگاه جدید
              </button>
            </div>
          )}
        </div>
      </motion.header>

      {/* ── ۲. خلاصه مشتری ────────────────────────────────────────── */}
      <motion.div
        variants={staggerItem}
        className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3"
      >
        <Stat
          icon={CubeIcon}
          label="کل دستگاه‌ها"
          value={toPersianDigits(summary.total_devices)}
        />
        <Stat
          icon={ArrowPathIcon}
          label="دستگاه‌های فعال"
          value={toPersianDigits(summary.active_devices)}
        />
        <Stat
          icon={CheckCircleIcon}
          label="تعمیرات موفق"
          value={toPersianDigits(summary.successful_repairs)}
          tone="text-success-fg"
        />
        <Stat
          icon={XCircleIcon}
          label="تعمیرات ناموفق"
          value={toPersianDigits(summary.failed_repairs)}
          tone="text-danger-fg"
        />
        <Stat
          icon={BanknotesIcon}
          label="کل پرداختی (ریال)"
          value={formatPersianCurrency(summary.total_paid)}
        />
        <Stat
          icon={CalendarDaysIcon}
          label="آخرین مراجعه"
          value={
            summary.last_visit ? formatPersianDate(summary.last_visit) : "—"
          }
        />
      </motion.div>

      {/* ── ۳. دستگاه‌های مشتری ───────────────────────────────────── */}
      <Section icon={CubeIcon} title="دستگاه‌های مشتری">
        {devices.length === 0 ? (
          <EmptyNote>هنوز دستگاهی برای این مشتری ثبت نشده است.</EmptyNote>
        ) : (
          <div className={tableCard}>
            <div className={tableScroll}>
              {/* A minimum width so the columns keep their shape and the
                    card scrolls, rather than `w-full` crushing seven of
                    them into a phone. */}
              <table className="w-full min-w-[46rem]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>دستگاه</th>
                    <th className={th}>برند و مدل</th>
                    <th className={th}>سریال</th>
                    <th className={th}>وضعیت</th>
                    <th className={th}>تعمیرکار</th>
                    <th className={th}>تاریخ ثبت</th>
                    <th className={th}>تاریخ خروج</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {devices.map((device) => {
                    const status = deviceStatusOf(device.status);
                    return (
                      <tr
                        key={device.id}
                        onClick={() => openDeviceDetail(device.id)}
                        className={trClickable}
                      >
                        <td className={td}>{device.device_name}</td>
                        <td className={tdMuted}>
                          {[device.brand, device.model]
                            .filter(Boolean)
                            .join(" ") || "—"}
                        </td>
                        <td className={`${tdMuted} tabular-nums`}>
                          {device.serial_number || "—"}
                        </td>
                        <td className={tdBare}>
                          <StatusPill
                            label={status.label}
                            color={status.color}
                            size="sm"
                          />
                        </td>
                        <td className={tdMuted}>
                          {device.assignees.length > 0
                            ? device.assignees.map((person, index) => (
                                <span key={person.id}>
                                  {index > 0 && "، "}
                                  <PersonnelLink
                                    id={person.id}
                                    name={person.name}
                                    tone="inherit"
                                  />
                                </span>
                              ))
                            : "—"}
                        </td>
                        <td className={tdMuted}>
                          {formatPersianDate(device.entry_date)}
                        </td>
                        <td className={tdMuted}>
                          {device.exit_date
                            ? formatPersianDate(device.exit_date)
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

      {/* ── ۴. تاریخچه تعمیرات ────────────────────────────────────── */}
      <Section icon={WrenchScrewdriverIcon} title="تاریخچه تعمیرات">
        {timeline.length === 0 ? (
          <EmptyNote>هنوز سابقه‌ای برای این مشتری ثبت نشده است.</EmptyNote>
        ) : (
          <ul className="space-y-3">
            {timeline.map((entry) => (
              <TimelineEntry key={entry.device_id} entry={entry} />
            ))}
          </ul>
        )}
      </Section>

      {/* ── ۵. فاکتورها ───────────────────────────────────────────── */}
      <Section icon={DocumentTextIcon} title="فاکتورها">
        {invoices.length === 0 ? (
          <EmptyNote>
            هنوز فاکتوری برای این مشتری صادر نشده است.
            {/* Said plainly, because its absence looks like a bug: a
                purchase names a supplier, not a customer, so there is no
                such thing as a customer's purchase invoice. */}
            <span className="block mt-1 text-body-xs">
              فاکتورهای خرید مربوط به فروشنده‌اند، نه مشتری.
            </span>
          </EmptyNote>
        ) : (
          <div className={tableCard}>
            <div className={tableScroll}>
              {/* A minimum width so the columns keep their shape and the
                    card scrolls, rather than `w-full` crushing seven of
                    them into a phone. */}
              <table className="w-full min-w-[46rem]">
                <thead className={thead}>
                  <tr>
                    <th className={th}>شماره فاکتور</th>
                    <th className={th}>نوع</th>
                    <th className={th}>تاریخ</th>
                    <th className={th}>مبلغ کل (ریال)</th>
                    <th className={th}>پرداخت‌شده (ریال)</th>
                    <th className={th}>وضعیت</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {invoices.map((invoice) => {
                    const status = paymentStatusOf(invoice.payment_status);
                    return (
                      <tr
                        key={`${invoice.kind}-${invoice.id}`}
                        onClick={() => openInvoice(invoice)}
                        className={trClickable}
                      >
                        <td className={`${td} tabular-nums`}>
                          {invoice.invoice_number}
                        </td>
                        <td className={tdMuted}>
                          {invoice.kind === "repair" ? "تعمیر" : "فروش"}
                        </td>
                        <td className={tdMuted}>
                          {formatPersianDate(invoice.invoice_date)}
                        </td>
                        <td className={td}>
                          {formatPersianCurrency(invoice.total_amount)}
                        </td>
                        <td
                          className={`${tdBare} ${
                            invoice.paid_amount > 0
                              ? "text-success-fg"
                              : "text-text-muted"
                          }`}
                        >
                          {invoice.paid_amount > 0
                            ? formatPersianCurrency(invoice.paid_amount)
                            : "—"}
                        </td>
                        <td className={tdBare}>
                          <StatusPill
                            label={status.label}
                            color={status.color}
                            tone={status.tone}
                            size="sm"
                          />
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

      {/* ── ۶. یادداشت داخلی ──────────────────────────────────────── */}
      <Section icon={PencilSquareIcon} title="یادداشت داخلی">
        <NotesPanel
          key={customer.id}
          initial={customer.notes}
          onSave={saveNotes}
        />
      </Section>
    </motion.div>
  );
}
