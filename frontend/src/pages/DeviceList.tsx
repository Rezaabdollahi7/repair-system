import { useEffect, useState, useCallback, useRef } from "react";
import { getDevices, deleteDevice, updateDevice } from "../api";
import FilterPanel from "../components/FilterPanel";
import Pagination from "../components/Pagination";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  ArrowsRightLeftIcon,
  CheckIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
/*
 * The row's own controls come from the outline set. The solid variants of
 * these four are filled discs — an 18px solid XCircleIcon is a dark blob, and
 * three of them in a row outweighed the status colour the row is meant to be
 * read by.
 */
import {
  TrashIcon,
  DocumentCurrencyDollarIcon,
  XCircleIcon,
  CheckCircleIcon,
  DocumentCheckIcon,
} from "@heroicons/react/24/outline";
import ConfirmModal from "../components/ConfirmModal";
import DeviceStatusBadge from "../components/DeviceStatusBadge";
import StatusPill from "../components/StatusPill";
import { deviceInvoiceStateOf } from "../utils/invoiceStatus";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import { useModal } from "../context/ModalContext";
import { useGoToCustomer } from "../utils/navigation";
import { formatPersianPhone, toPersianDigits } from "../utils/formatters";
import { backdrop, modalPanel, staggerContainer, staggerItem } from "../motion";
import {
  actionConfirm,
  actionDelete,
  actionNeutral,
  actionView,
  primaryButton,
  rowCard,
  searchField,
  searchIcon,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdActions,
  tdBare,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  trClickable,
} from "../utils/tableClasses";
import { DEVICE_STATUSES, deviceStatusOf } from "../utils/deviceStatus";
import type { DeviceFilters } from "../components/FilterPanel";
import type { Device, DeviceAssignee, QueryParams } from "../types/api";

/**
 * Whether this device has been invoiced, and if so whether it was paid.
 *
 * The four states and their wording live in utils/invoiceStatus.ts, beside
 * the payment statuses — this page and its filter panel used to describe them
 * separately and disagree.
 */
function InvoiceStatusBadge({ device }: { device: Device }) {
  const { label, color, tone } = deviceInvoiceStateOf(device);
  return <StatusPill label={label} color={color} tone={tone} size="sm" />;
}

interface StatusBadgeProps {
  status: string;
  onStatusChange: (status: string) => void;
}

/**
 * The badge plus the button that changes it.
 *
 * The nine-way label-and-colour map that used to live here is gone — it was
 * one of six copies, and it is now `utils/deviceStatus.ts`. What is left is
 * the picker, which is this page's own.
 */
function StatusBadge({ status, onStatusChange }: StatusBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <div className="flex items-center justify-center gap-1.5">
        <DeviceStatusBadge status={status} size="sm" />
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(true);
          }}
          className="p-1 rounded-field text-text-muted hover:text-text-primary
                     hover:bg-surface-alt transition-colors cursor-pointer"
          title="تغییر وضعیت"
          aria-label="تغییر وضعیت دستگاه"
        >
          <ArrowsRightLeftIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Status picker */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              variants={backdrop}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-scrim/50"
            />
            <motion.div
              variants={modalPanel}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="relative bg-surface border border-border rounded-panel shadow-xl w-full max-w-xs overflow-hidden"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-body-sm font-bold text-text-primary">
                  تغییر وضعیت
                </h3>
              </div>
              {/* Listed in workflow order, so the next step is the row below
                  the current one rather than somewhere in an alphabet. */}
              <div className="p-2 max-h-[60vh] overflow-y-auto">
                {DEVICE_STATUSES.map((option) => (
                  <button
                    key={option.key}
                    onClick={() => {
                      onStatusChange(option.key);
                      setShowModal(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 text-right px-3 py-2.5
                                rounded-field text-body-sm transition-colors mb-1 cursor-pointer ${
                                  option.key === status
                                    ? "bg-surface-alt"
                                    : "hover:bg-surface-alt"
                                }`}
                  >
                    <DeviceStatusBadge status={option.key} />
                    {option.key === status && (
                      <CheckIcon className="w-4 h-4 shrink-0 text-text-primary" />
                    )}
                  </button>
                ))}
              </div>
              <div className="p-2 border-t border-border">
                <button
                  onClick={() => setShowModal(false)}
                  className="w-full px-4 py-2.5 text-body-sm text-text-secondary
                             hover:bg-surface-alt rounded-field transition-colors cursor-pointer"
                >
                  انصراف
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR");
}

/**
 * Who is on the job.
 *
 * Neutral, and deliberately so: a technician's name is not a state, and
 * giving it a colour would put a third coloured chip in a row that already
 * carries the repair status and the payment status. The initial in front of
 * it is what makes the chip scannable instead.
 */
function AssigneeBadge({ assignees }: { assignees: DeviceAssignee[] }) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-text-muted text-body-xs">—</span>;
  }

  const shared = assignees.length > 1;
  const label = shared
    ? `مشترک — ${toPersianDigits(assignees.length)} نفر`
    : assignees[0].name;

  return (
    <span
      title={shared ? assignees.map((a) => a.name).join("، ") : undefined}
      className={`inline-flex items-center gap-1.5 ps-1 pe-2.5 py-0.5 rounded-pill
                  bg-surface-alt text-text-primary text-body-xs font-bold
                  whitespace-nowrap ${shared ? "cursor-help" : ""}`}
    >
      {/* A step of the surface rather than the accent. Ten accent discs down
          the technician column pulled the eye there instead of to the status,
          and the accent is meant to be spent once per screen. */}
      <span
        className="w-5 h-5 rounded-full bg-surface-sunken text-text-secondary
                   flex items-center justify-center text-body-xs shrink-0"
        aria-hidden="true"
      >
        {shared
          ? toPersianDigits(assignees.length)
          : assignees[0].name.trim().charAt(0)}
      </span>
      {label}
    </span>
  );
}

/** Mirrors the table so the page does not jump when the rows land. */
function DeviceListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[3, 5, 4, 3, 2, 4].map((span, cell) => (
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
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="h-32 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

const EMPTY_FILTERS: DeviceFilters = {
  status: [],
  customer_id: "",
  personnel_ids: [],
  entry_from: "",
  entry_to: "",
  invoice_status: [],
};

export default function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<DeviceFilters>(EMPTY_FILTERS);

  const { isAtLeast } = useAuth();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);

  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;
  const [filterOpen, setFilterOpen] = useState(false);

  const {
    openDeviceEdit,
    refreshList,
    openSaleInvoiceCreate,
    openSaleInvoiceDetail,
  } = useModal();
  const goToCustomer = useGoToCustomer();

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchDevices = useCallback(
    async (
      searchTerm: string,
      activeFilters: DeviceFilters,
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = {
          page: currentPage,
          limit: currentLimit,
        };

        // The list filters arrive as comma-separated strings; the schema
        // splits them back into arrays server-side.
        if (searchTerm) params.search = searchTerm;
        if (activeFilters.status.length > 0)
          params.status = activeFilters.status.join(",");
        if (activeFilters.customer_id)
          params.customer_id = activeFilters.customer_id;
        if (activeFilters.entry_from)
          params.entry_from = activeFilters.entry_from;
        if (activeFilters.entry_to) params.entry_to = activeFilters.entry_to;
        if (activeFilters.personnel_ids.length > 0)
          params.personnel_ids = activeFilters.personnel_ids.join(",");
        if (activeFilters.invoice_status.length > 0)
          params.invoice_status = activeFilters.invoice_status.join(",");

        const res = await getDevices(params);
        setDevices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        toast.error("خطا در دریافت لیست دستگاه‌ها");
        setDevices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchDevices(debouncedSearch, filters, page, limit);
  }, [debouncedSearch, filters, page, limit, fetchDevices]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filters]);

  // Lets a modal refresh this list when the last of them closes.
  useEffect(() => {
    refreshList(() => {
      void fetchDevices(debouncedSearch, filters, page, limit);
    });
  }, [refreshList, fetchDevices, debouncedSearch, filters, page, limit]);

  const handleStatusChange = async (deviceId: number, newStatus: string) => {
    try {
      await updateDevice(deviceId, { status: newStatus });
      toast.success("وضعیت دستگاه بروز شد");
      void fetchDevices(debouncedSearch, filters, page, limit);
    } catch {
      toast.error("خطا در تغییر وضعیت");
    }
  };

  /**
   * Adds or removes one status from the filter.
   *
   * The chips write into the same `filters.status` array the filter panel
   * does, rather than keeping a second piece of state — two controls over one
   * filter that disagree is the bug that arrangement always produces.
   */
  const toggleStatus = (key: string) => {
    setFilters((current) => ({
      ...current,
      status: current.status.includes(key)
        ? current.status.filter((value) => value !== key)
        : [...current.status, key],
    }));
    setPage(1);
  };

  const handleToggleNeedsInvoice = async (deviceId: number, value: boolean) => {
    try {
      await updateDevice(deviceId, { needs_invoice: value });
      toast.success(value ? "آماده برای فاکتور" : "فاکتور لازم نیست");
      void fetchDevices(debouncedSearch, filters, page, limit);
    } catch {
      toast.error("خطا در تغییر وضعیت");
    }
  };

  // ─── Render ───────────────────────────────────────────────────

  /*
   * Row actions, shared by the table row and the phone card.
   *
   * Neutral until hovered, and that is the point. Each of these used to carry
   * its own tint — green, red, amber, ink — which put five colours in the
   * last column of a row that already says what it is four times over: the
   * status rule down its leading edge, the status badge, the assignee chip
   * and the payment badge. Colour there competed with the signal instead of
   * adding one, so the buttons state their meaning on hover and in their
   * title, and the destructive one turns red only when it is about to be
   * pressed.
   */

  const rowActions = (device: Device) => (
    <div className="flex items-center justify-end gap-1 whitespace-nowrap">
      {device.invoice_count > 0 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (device.sale_invoice_id)
              openSaleInvoiceDetail(device.sale_invoice_id);
          }}
          className={actionView}
          title={
            device.invoice_status === "paid"
              ? "فاکتور پرداخت شده"
              : "فاکتور پرداخت نشده"
          }
        >
          <DocumentCheckIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      ) : !device.needs_invoice ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleToggleNeedsInvoice(device.id, true);
          }}
          className={actionNeutral}
          title="اگر نیاز به فاکتور دارد — کلیک کنید"
        >
          <CheckCircleIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      ) : (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              openSaleInvoiceCreate(device.id);
            }}
            className={actionConfirm}
            title="ایجاد فاکتور فروش"
          >
            <DocumentCurrencyDollarIcon className="w-[1.15rem] h-[1.15rem]" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleNeedsInvoice(device.id, false);
            }}
            className={actionNeutral}
            title="فاکتور لازم نیست"
          >
            <XCircleIcon className="w-[1.15rem] h-[1.15rem]" />
          </button>
        </>
      )}

      <button
        onClick={(e) => {
          e.stopPropagation();
          setDeleteTarget(device);
        }}
        className={actionDelete}
        title="حذف"
      >
        <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
    </div>
  );

  const filtering = activeFilterCount > 0 || debouncedSearch !== "";

  return (
    <div dir="rtl">
      <header className="mb-5">
        {/*
          Quick status filters.
          -----------------------------------------------------------------
          The same nine states in the same workflow order as the picker and
          the dashboard's ring, each carrying its own dot — so a colour means
          one thing wherever it appears in the app.

          No counts on them, deliberately: this endpoint returns a page of
          devices and a total, not a breakdown, and a per-status count would
          need either a second request or a new field. A chip that filters is
          worth having without one; a chip showing a number that is quietly
          the wrong number is not.
        */}
        {/*
          One scrollable row on a phone, wrapping from `sm` up. Ten chips wrap
          to four lines at 390px — about 120px of filters standing between the
          user and the first device — and a phone is where this list is most
          often read. The filter panel still offers all ten as a list.
        */}
        <div
          className="flex gap-2 mt-4 overflow-x-auto pb-1
                     sm:flex-wrap sm:overflow-x-visible sm:pb-0"
          role="group"
          aria-label="فیلتر سریع وضعیت"
        >
          <button
            onClick={() => {
              setFilters((current) => ({ ...current, status: [] }));
              setPage(1);
            }}
            aria-pressed={filters.status.length === 0}
            className={`shrink-0 px-3 py-1.5 rounded-pill text-body-xs font-bold border
                        transition-colors cursor-pointer ${
                          filters.status.length === 0
                            ? "bg-primary text-primary-fg border-primary"
                            : "bg-surface text-text-secondary border-border hover:border-border-strong"
                        }`}
          >
            همه
          </button>
          {DEVICE_STATUSES.map((status) => {
            const active = filters.status.includes(status.key);
            return (
              <button
                key={status.key}
                onClick={() => toggleStatus(status.key)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill
                            text-body-xs font-bold border transition-colors cursor-pointer
                            ${
                              active
                                ? "text-text-primary"
                                : "bg-surface text-text-secondary border-border hover:border-border-strong"
                            }`}
                style={
                  active
                    ? {
                        backgroundColor: `color-mix(in oklab, ${status.color} 16%, var(--surface))`,
                        borderColor: `color-mix(in oklab, ${status.color} 55%, var(--surface))`,
                      }
                    : undefined
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: status.color }}
                  aria-hidden="true"
                />
                {status.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در نام، برند، مدل، سریال، مشتری، شماره تماس…"
            aria-label="جستجوی دستگاه"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          {/*
            A neutral button, not a green one. --success is reserved for
            "this went well"; opening a filter panel is neither a success
            nor a state, and colouring it green spends a status tone on a
            control that has no status.
          */}
          <button
            onClick={() => setFilterOpen(true)}
            className={secondaryButton}
          >
            <FunnelIcon className="w-[1.15rem] h-[1.15rem] text-text-secondary" />
            فیلترها
            {activeFilterCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-pill bg-primary text-primary-fg text-body-xs flex items-center justify-center">
                {toPersianDigits(activeFilterCount)}
              </span>
            )}
          </button>
          <button
            onClick={() => openDeviceEdit(null)}
            className={primaryButton}
          >
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            ثبت دستگاه جدید
          </button>
        </div>

        <FilterPanel
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onChange={(newFilters) => {
            setFilters(newFilters);
            setPage(1);
          }}
          onClear={() => {
            setFilters(EMPTY_FILTERS);
            setPage(1);
          }}
        />
      </div>

      {loading ? (
        <DeviceListSkeleton />
      ) : devices.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <WrenchScrewdriverIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {filtering ? "نتیجه‌ای یافت نشد" : "هنوز دستگاهی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {searchInput
              ? `چیزی با «${searchInput}» پیدا نشد. عبارت دیگری را امتحان کنید.`
              : activeFilterCount > 0
                ? "این ترکیب فیلترها چیزی برنگرداند. یکی از آن‌ها را بردارید."
                : "اولین دستگاهی که برای تعمیر پذیرش می‌کنید را اینجا ثبت کنید."}
          </p>
          {/* An empty result the user filtered into needs a way back out;
              an empty workspace needs the button that fills it. */}
          {filtering ? (
            <button
              onClick={() => {
                setFilters(EMPTY_FILTERS);
                setSearchInput("");
                setPage(1);
              }}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو و فیلترها
            </button>
          ) : (
            <button
              onClick={() => openDeviceEdit(null)}
              className={`${primaryButton} mt-5 flex-none`}
            >
              <PlusIcon
                className="w-[1.15rem] h-[1.15rem]"
                aria-hidden="true"
              />
              ثبت دستگاه جدید
            </button>
          )}
        </div>
      ) : (
        <>
          {/*
            Below lg the table becomes one card per device. Eleven columns
            need 1400px, which on a phone is a page the user has to drag
            sideways to read a single row.
          */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {devices.map((device) => (
              <motion.li key={device.id} variants={staggerItem}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openDeviceEdit(device.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDeviceEdit(device.id);
                    }
                  }}
                  className={`${rowCard} cursor-pointer hover:border-border-strong
                              relative overflow-hidden ps-5`}
                >
                  {/*
                    A stripe of the status colour down the card's leading
                    edge. On a phone the card is the row, and this is what
                    lets a stack of them be skimmed for one state without
                    reading a single label.
                  */}
                  <span
                    className="absolute inset-y-0 start-0 w-1.5"
                    style={{
                      backgroundColor: deviceStatusOf(device.status).color,
                    }}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-text-primary truncate">
                        {device.device_name}
                        {device.brand ? ` — ${device.brand}` : ""}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (device.customer_id)
                            goToCustomer(device.customer_id);
                        }}
                        className="text-body-sm text-primary hover:underline font-medium"
                      >
                        {device.customer_name ?? "مشتری"}
                      </button>
                      <p
                        className="text-body-xs text-text-muted tabular-nums"
                        dir="ltr"
                      >
                        {formatPersianPhone(device.customer_phone)}
                      </p>
                    </div>
                    <span className="text-body-xs text-text-muted shrink-0 tabular-nums">
                      #{toPersianDigits(device.id)}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <StatusBadge
                      status={device.status}
                      onStatusChange={(newStatus) =>
                        handleStatusChange(device.id, newStatus)
                      }
                    />
                    {isAtLeast("admin") && (
                      <InvoiceStatusBadge device={device} />
                    )}
                    <AssigneeBadge assignees={device.assignees} />
                  </div>

                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle">
                    <span className="text-body-xs text-text-muted">
                      ثبت: {formatDate(device.entry_date)}
                    </span>
                    {isAtLeast("admin") && rowActions(device)}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[1120px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>پذیرش</th>
                    <th className={th}>مشتری</th>
                    <th className={th}>شماره تماس</th>
                    <th className={th}>نوع دستگاه</th>
                    <th className={th}>برند</th>
                    <th className={th}>وضعیت دستگاه</th>
                    <th className={th}>تعمیرکار</th>
                    <th className={th}>تاریخ ثبت</th>
                    <th className={th}>تاریخ خروج</th>
                    {isAtLeast("admin") && (
                      <>
                        <th className={th}>وضعیت پرداخت</th>
                        <th className={th}>عملیات</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {devices.map((device) => (
                    <tr
                      key={device.id}
                      onClick={() => openDeviceEdit(device.id)}
                      className={trClickable}
                    >
                      {/*
                        The status colour again, as a rule down the row's
                        leading edge. The badge four columns over says the
                        same thing in words; this is what makes a screenful
                        of rows skimmable for one state, which is how a
                        workshop actually uses this table.
                      */}
                      <td
                        className={`${td} tabular-nums relative`}
                        style={{
                          boxShadow: `inset -3px 0 0 0 ${deviceStatusOf(device.status).color}`,
                        }}
                      >
                        {toPersianDigits(device.id)}
                      </td>
                      <td className={td}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (device.customer_id)
                              goToCustomer(device.customer_id);
                          }}
                          className="text-primary hover:underline font-medium"
                        >
                          {device.customer_name ?? "مشتری"}
                        </button>
                      </td>
                      <td className={`${tdMuted} tabular-nums`} dir="ltr">
                        {formatPersianPhone(device.customer_phone)}
                      </td>
                      <td className={td}>{device.device_name}</td>
                      <td className={td}>{device.brand ?? "—"}</td>
                      <td className={tdActions}>
                        <StatusBadge
                          status={device.status}
                          onStatusChange={(newStatus) =>
                            handleStatusChange(device.id, newStatus)
                          }
                        />
                      </td>
                      <td className={td}>
                        <AssigneeBadge assignees={device.assignees} />
                      </td>
                      <td className={tdMuted}>
                        {formatDate(device.entry_date)}
                      </td>
                      <td className={tdMuted}>
                        {formatDate(device.exit_date)}
                      </td>

                      {isAtLeast("admin") && (
                        <>
                          <td className={tdBare}>
                            <InvoiceStatusBadge device={device} />
                          </td>
                          <td className={tdActions}>{rowActions(device)}</td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Pagination */}
      <div className="mt-4">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={limit}
          onPageChange={(newPage) => setPage(newPage)}
          onLimitChange={(newLimit) => {
            setLimit(newLimit);
            setPage(1);
          }}
        />
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            if (!deleteTarget) return;
            await deleteDevice(deleteTarget.id);
            toast.success("دستگاه حذف شد");
            setDeleteTarget(null);
            fetchDevices(debouncedSearch, filters, page, limit);
          } catch (error) {
            // The server explains why a delete was refused — a device with
            // repair invoices, for instance. Showing a generic message
            // instead left the user with no idea what to do.
            toast.error(errorText(error, "خطا در حذف دستگاه"));
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف دستگاه"
        message={`آیا از حذف دستگاه "${deleteTarget?.device_name}" مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
