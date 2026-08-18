import { useEffect, useState, useCallback, useRef } from "react";
import { getDevices, deleteDevice, updateDevice } from "../api";
import FilterPanel from "../components/FilterPanel";
import Pagination from "../components/Pagination";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

import {
  PlusIcon,
  TrashIcon,
  DocumentCurrencyDollarIcon,
  WrenchScrewdriverIcon,
  ArrowsRightLeftIcon,
  XCircleIcon,
  CheckCircleIcon,
  DocumentCheckIcon,
  FunnelIcon,
} from "@heroicons/react/24/solid";
import ConfirmModal from "../components/ConfirmModal";
import LoadingSpinner from "../components/LoadingSpinner";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import { useModal } from "../context/ModalContext";
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
        ? { label: "پرداخت شده", color: "bg-success-soft text-success" }
        : { label: "پرداخت نشده", color: "bg-danger-soft text-danger" };
    }
    return { label: "فاکتور ندارد", color: "bg-warning-soft text-warning" };
  };

  const status = getInvoiceStatus();

  return (
    <span
      className={`px-2 py-1 mt-3 rounded-full text-xs font-medium  ${status.color}`}
    >
      {status.label}
    </span>
  );
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
      color: "bg-warning-soft text-warning",
    },
    diagnosing: {
      label: "در حال بررسی",
      color: "bg-primary-soft text-primary",
    },
    waiting_for_parts: {
      label: "در انتظار قطعه",
      color: "bg-warning-soft text-warning",
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
      color: "bg-success-soft text-success",
    },
    ready_for_pickup: {
      label: "آماده تحویل",
      color: "bg-primary-soft text-primary",
    },
    unrepairable: {
      label: "غیرقابل تعمیر",
      color: "bg-danger-soft text-danger",
    },
    not_repaired: { label: "تعمیر نشد", color: "bg-warning-soft text-danger" },
  };

  const current = map[status] || {
    label: status,
    color: "bg-surface-alt text-text-secondary",
  };

  return (
    <>
      <div className="flex items-center  gap-3">
        <span
          className={`px-2 py-1 mr-5 rounded-full text-xs font-medium ${current.color}`}
        >
          {current.label}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowModal(true);
          }}
          className="p-0.5 rounded-full text-text-secondary hover:text-primary group-hover:text-text-inverse hover:opacity-80 transition-colors"
          title="تغییر وضعیت"
        >
          <ArrowsRightLeftIcon className="size-5" />
        </button>
      </div>

      {/* Status picker */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-surface rounded-xl shadow-xl w-full max-w-xs mx-4 overflow-hidden"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-border">
              <h3 className="text-sm font-bold text-text-primary">
                تغییر وضعیت
              </h3>
            </div>
            <div className="p-2">
              {Object.entries(map).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => {
                    onStatusChange(key);
                    setShowModal(false);
                  }}
                  className={`w-full text-right px-4 py-3 rounded-lg text-sm font-medium transition-colors mb-1 ${
                    key === status
                      ? `${val.color} ring-2 ring-inset`
                      : "text-text-primary hover:bg-surface-alt"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{val.label}</span>
                    {key === status && (
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="p-2 border-t border-border">
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2.5 text-sm text-text-secondary hover:bg-surface-alt rounded-lg transition-colors"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR");
}

function AssigneeBadge({ assignees }: { assignees: DeviceAssignee[] }) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-text-secondary text-xs">—</span>;
  }
  if (assignees.length === 1) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary-soft text-primary">
        {assignees[0].name}
      </span>
    );
  }
  return (
    <span
      title={assignees.map((a) => a.name).join("، ")}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary-soft text-primary cursor-help"
    >
      مشترک ({assignees.length} نفر)
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
  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex gap-2">
          <WrenchScrewdriverIcon className="w-6 h-6 text-text-secondary" />
          دستگاه‌ها
        </h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex-1 sm:flex-none bg-success text-text-inverse px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm hover:opacity-80"
          >
            <FunnelIcon className="w-5 h-5" />
            <span>فیلترها</span>
            {activeFilterCount > 0 && (
              <span className="bg-surface text-success text-xs font-bold rounded-full  py-1 px-2.5 flex items-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => openDeviceEdit(null)}
            className="flex-1 sm:flex-none bg-primary text-text-inverse px-4 py-2 rounded-lg hover:bg-primary-hover flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <PlusIcon className="w-5 h-5" />
            ثبت دستگاه جدید
          </button>
        </div>
      </div>
      {/* Search + Filter */}
      <div className="mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="جستجو در نام، برند، مدل، سریال، مشتری، شماره تماس..."
          className="w-full border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
        />
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
      {/* Table */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          {searchInput
            ? `نتیجه‌ای برای "${searchInput}" یافت نشد`
            : "هیچ دستگاهی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] lg:min-w-full divide-y divide-border">
              <thead className="bg-primary-soft">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    شماره پذیرش
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    مشتری
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    شماره تماس
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    نوع دستگاه
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    برند
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    وضعیت دستگاه
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تعمیرکار
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تاریخ ثبت
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تاریخ خروج
                  </th>

                  {isAtLeast("admin") && (
                    <>
                      <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                        وضعیت پرداخت
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border">
                        عملیات
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {devices.map((device, index) => (
                  <tr
                    key={device.id}
                    onClick={() => openDeviceEdit(device.id)}
                    className={`hover:bg-primary hover:text-text-inverse transition-colors hover:cursor-pointer group ${
                      index % 2 === 0 ? "bg-surface" : "bg-surface-alt"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-center border-l border-border font-mono text-text-primary group-hover:text-text-inverse">
                      {device.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (device.customer_id)
                            openCustomerDetail(device.customer_id);
                        }}
                        className="text-primary group-hover:text-text-inverse hover:underline font-medium"
                      >
                        {device.customer_name ?? "مشتری"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-secondary group-hover:text-text-inverse">
                      {device.customer_phone}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-primary group-hover:text-text-inverse">
                      {device.device_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-primary group-hover:text-text-inverse">
                      {device.brand ?? "—"}
                    </td>
                    <td className="px-4 py-3 border-l border-border">
                      <StatusBadge
                        status={device.status}
                        onStatusChange={(newStatus) =>
                          handleStatusChange(device.id, newStatus)
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border group-hover:text-text-inverse">
                      <AssigneeBadge assignees={device.assignees} />
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-secondary group-hover:text-text-inverse">
                      {formatDate(device.entry_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border text-text-secondary group-hover:text-text-inverse">
                      {formatDate(device.exit_date)}
                    </td>

                    {isAtLeast("admin") && (
                      <>
                        <td className="px-4 py-3 flex  justify-center border-l border-border">
                          <InvoiceStatusBadge device={device} />
                        </td>

                        <td className="px-4 py-3 text-sm text-center">
                          <div className="flex gap-2 justify-end items-center">
                            {isAtLeast("admin") && (
                              <>
                                {device.invoice_count > 0 ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (device.sale_invoice_id)
                                        openSaleInvoiceDetail(
                                          device.sale_invoice_id,
                                        );
                                    }}
                                    className={`p-2 rounded-lg transition-colors ${
                                      device.invoice_status === "paid"
                                        ? "bg-success-soft text-success hover:opacity-80"
                                        : "bg-danger-soft text-danger hover:opacity-80"
                                    }`}
                                    title={
                                      device.invoice_status === "paid"
                                        ? "فاکتور پرداخت شده"
                                        : "فاکتور پرداخت نشده"
                                    }
                                  >
                                    <DocumentCheckIcon className="w-5 h-5" />
                                  </button>
                                ) : !device.needs_invoice ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleNeedsInvoice(device.id, true);
                                    }}
                                    className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                                    title=" اگر نیاز به فاکتور دارد - کلیک کنید"
                                  >
                                    <CheckCircleIcon className="w-5 h-5" />
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        openSaleInvoiceCreate(device.id);
                                      }}
                                      className="p-2 rounded-lg bg-warning-soft text-warning hover:opacity-80 transition-colors"
                                      title="ایجاد فاکتور فروش"
                                    >
                                      <DocumentCurrencyDollarIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleNeedsInvoice(
                                          device.id,
                                          false,
                                        );
                                      }}
                                      className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                                      title="فاکتور لازم نیست"
                                    >
                                      <XCircleIcon className="w-5 h-5" />
                                    </button>
                                  </>
                                )}

                                <div className="w-px h-8 bg-border mx-1" />
                              </>
                            )}

                            {isAtLeast("admin") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(device);
                                }}
                                className="p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors cursor-pointer"
                                title="حذف"
                              >
                                <TrashIcon className="w-5 h-5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
