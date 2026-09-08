import { useEffect, useState, useCallback, useRef } from "react";
import { getDevices, deleteDevice, updateDevice } from "../api";
import FilterPanel from "../components/FilterPanel";
import Pagination from "../components/Pagination";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

import { AnimatePresence, motion } from "framer-motion";
import {
  PlusIcon,
  TrashIcon,
  DocumentCurrencyDollarIcon,
  ArrowsRightLeftIcon,
  XCircleIcon,
  CheckCircleIcon,
  CheckIcon,
  DocumentCheckIcon,
  FunnelIcon,
  MagnifyingGlassIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import ConfirmModal from "../components/ConfirmModal";
import LoadingSpinner from "../components/LoadingSpinner";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import { useModal } from "../context/ModalContext";
import { toPersianDigits } from "../utils/formatters";
import { backdrop, modalPanel, staggerContainer, staggerItem } from "../motion";
import {
  badge,
  iconButton,
  primaryButton,
  rowCard,
  searchField,
  searchIcon,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  trClickable,
} from "../utils/tableClasses";
import type { DeviceFilters } from "../components/FilterPanel";
import type { Device, DeviceAssignee, QueryParams } from "../types/api";

function InvoiceStatusBadge({ device }: { device: Device }) {
  const getInvoiceStatus = () => {
    if (!device.needs_invoice) {
      return {
        label: "فاکتور نیاز ندارد",
        color: "bg-primary-soft text-primary",
      };
    }
    if (device.invoice_count > 0) {
      return device.invoice_status === "paid"
        ? { label: "پرداخت شده", color: "bg-success-soft text-success-fg" }
        : { label: "پرداخت نشده", color: "bg-danger-soft text-danger-fg" };
    }
    return { label: "فاکتور ندارد", color: "bg-warning-soft text-warning-fg" };
  };

  const status = getInvoiceStatus();

  return <span className={`${badge} ${status.color}`}>{status.label}</span>;
}

interface StatusBadgeProps {
  status: string;
  onStatusChange: (status: string) => void;
}

function StatusBadge({ status, onStatusChange }: StatusBadgeProps) {
  const [showModal, setShowModal] = useState(false);

  const map: Record<string, { label: string; color: string }> = {
    pending: {
      label: "در انتظار بررسی",
      color: "bg-warning-soft text-warning-fg",
    },
    diagnosing: {
      label: "در حال بررسی",
      color: "bg-primary-soft text-primary",
    },
    waiting_for_parts: {
      label: "در انتظار قطعه",
      color: "bg-warning-soft text-warning-fg",
    },
    repairing: {
      label: "در حال تعمیر",
      color: "bg-primary-soft text-primary",
    },
    repaired: {
      label: "تعمیر شده",
      color: "bg-surface-alt text-text-secondary",
    },
    delivered: {
      label: "تحویل داده شده",
      color: "bg-success-soft text-success-fg",
    },
    ready_for_pickup: {
      label: "آماده تحویل",
      color: "bg-primary-soft text-primary",
    },
    unrepairable: {
      label: "غیرقابل تعمیر",
      color: "bg-danger-soft text-danger-fg",
    },
    not_repaired: {
      label: "تعمیر نشد",
      color: "bg-warning-soft text-danger-fg",
    },
  };

  const current = map[status] || {
    label: status,
    color: "bg-surface-alt text-text-secondary",
  };

  return (
    <>
      <div className="flex items-center justify-center gap-2">
        <span className={`${badge} ${current.color}`}>{current.label}</span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(true);
          }}
          className="p-1 rounded-field text-text-muted hover:text-primary hover:bg-surface-alt transition-colors cursor-pointer"
          title="تغییر وضعیت"
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
              className="relative bg-surface border border-border rounded-card shadow-xl w-full max-w-xs overflow-hidden"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-4 py-3 border-b border-border">
                <h3 className="text-body-sm font-bold text-text-primary">
                  تغییر وضعیت
                </h3>
              </div>
              <div className="p-2 max-h-[60vh] overflow-y-auto">
                {Object.entries(map).map(([key, val]) => (
                  <button
                    key={key}
                    onClick={() => {
                      onStatusChange(key);
                      setShowModal(false);
                    }}
                    className={`w-full flex items-center justify-between gap-2 text-right px-3 py-2.5
                                rounded-field text-body-sm transition-colors mb-1 cursor-pointer ${
                                  key === status
                                    ? "bg-primary-soft"
                                    : "hover:bg-surface-alt"
                                }`}
                  >
                    <span className={`${badge} ${val.color}`}>{val.label}</span>
                    {key === status && (
                      <CheckIcon className="w-4 h-4 shrink-0 text-primary" />
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

function AssigneeBadge({ assignees }: { assignees: DeviceAssignee[] }) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-text-muted text-body-xs">—</span>;
  }
  if (assignees.length === 1) {
    return (
      <span className={`${badge} bg-primary-soft text-primary`}>
        {assignees[0].name}
      </span>
    );
  }
  return (
    <span
      title={assignees.map((a) => a.name).join("، ")}
      className={`${badge} bg-primary-soft text-primary cursor-help`}
    >
      مشترک ({toPersianDigits(assignees.length)} نفر)
    </span>
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
    openCustomerDetail,
    refreshList,
    openSaleInvoiceCreate,
    openSaleInvoiceDetail,
  } = useModal();

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

  /** Row actions, shared by the table row and the phone card. */
  const rowActions = (device: Device) => (
    <div className="flex gap-2 justify-end items-center">
      {device.invoice_count > 0 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (device.sale_invoice_id)
              openSaleInvoiceDetail(device.sale_invoice_id);
          }}
          className={`${iconButton} ${
            device.invoice_status === "paid"
              ? "bg-success-soft text-success-fg"
              : "bg-danger-soft text-danger-fg"
          }`}
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
          className={`${iconButton} bg-primary-soft text-primary`}
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
            className={`${iconButton} bg-warning-soft text-warning-fg`}
            title="ایجاد فاکتور فروش"
          >
            <DocumentCurrencyDollarIcon className="w-[1.15rem] h-[1.15rem]" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleToggleNeedsInvoice(device.id, false);
            }}
            className={`${iconButton} bg-primary-soft text-primary`}
            title="فاکتور لازم نیست"
          >
            <XCircleIcon className="w-[1.15rem] h-[1.15rem]" />
          </button>
        </>
      )}

      <span className="w-px h-6 bg-border mx-0.5" />

      <button
        onClick={(e) => {
          e.stopPropagation();
          setDeleteTarget(device);
        }}
        className={`${iconButton} bg-danger-soft text-danger-fg`}
        title="حذف"
      >
        <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
    </div>
  );

  return (
    <div dir="rtl">
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
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" />
        </div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <span className="w-14 h-14 rounded-card bg-surface-alt flex items-center justify-center mb-4">
            <WrenchScrewdriverIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput ? "نتیجه‌ای یافت نشد" : "هنوز دستگاهی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput
              ? `چیزی با «${searchInput}» پیدا نشد. عبارت دیگری را امتحان کنید.`
              : "اولین دستگاهی که برای تعمیر پذیرش می‌کنید را اینجا ثبت کنید."}
          </p>
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
                  className={`${rowCard} cursor-pointer hover:border-primary-border`}
                >
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
                            openCustomerDetail(device.customer_id);
                        }}
                        className="text-body-sm text-primary hover:underline"
                      >
                        {device.customer_name ?? "مشتری"}
                      </button>
                      <p className="text-body-xs text-text-secondary" dir="ltr">
                        {device.customer_phone}
                      </p>
                    </div>
                    <span className="text-body-xs text-text-muted shrink-0">
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

                  <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border">
                    <span className="text-body-xs text-text-secondary">
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
              <table className="min-w-[1040px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>شماره پذیرش</th>
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
                      <td className={`${td} tabular-nums`}>
                        {toPersianDigits(device.id)}
                      </td>
                      <td className={td}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (device.customer_id)
                              openCustomerDetail(device.customer_id);
                          }}
                          className="text-primary hover:underline font-medium"
                        >
                          {device.customer_name ?? "مشتری"}
                        </button>
                      </td>
                      <td className={`${tdMuted} tabular-nums`} dir="ltr">
                        {device.customer_phone}
                      </td>
                      <td className={td}>{device.device_name}</td>
                      <td className={td}>{device.brand ?? "—"}</td>
                      <td className="px-3 py-3">
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
                          <td className="px-3 py-3 text-center">
                            <InvoiceStatusBadge device={device} />
                          </td>
                          <td className="px-3 py-3">{rowActions(device)}</td>
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
