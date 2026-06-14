// src/pages/DeviceList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { getDevices, deleteDevice, getCustomers, getPersonnel } from "../api";
import FilterPanel from "../components/FilterPanel";
import Pagination from "../components/Pagination";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { updateDevice } from "../api";

import {
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
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
import { formatPersianPhone } from "../utils/formatters";
import LoadingSpinner from "../components/LoadingSpinner";

import { useModal } from "../context/ModalContext";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function InvoiceStatusBadge({ device }) {
  const getInvoiceStatus = () => {
    if (device.needs_invoice === 0) {
      return { label: "فاکتور نیاز ندارد", color: "bg-blue-100 text-blue-800" };
    }
    if (device.invoice_count > 0) {
      return device.invoice_status === "paid"
        ? { label: "پرداخت شده", color: "bg-green-100 text-green-800" }
        : { label: "پرداخت نشده", color: "bg-red-100 text-red-800" };
    }
    return { label: "فاکتور ندارد", color: "bg-yellow-100 text-yellow-800" };
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

function StatusBadge({ status, onStatusChange }) {
  const [showModal, setShowModal] = useState(false);

  const map = {
    pending: {
      label: "در انتظار بررسی",
      color: "bg-yellow-100 text-yellow-800",
    },
    diagnosing: { label: "در حال بررسی", color: "bg-cyan-100 text-cyan-800" },
    waiting_for_parts: {
      label: "در انتظار قطعه",
      color: "bg-orange-100 text-orange-800",
    },
    repairing: {
      label: "در حال تعمیر",
      color: "bg-purple-100 text-purple-800",
    },
    repaired: { label: "تعمیر شده", color: "bg-gray-100 text-gray-800" },
    delivered: {
      label: "تحویل داده شده",
      color: "bg-green-100 text-green-800",
    },
    ready_for_pickup: {
      label: "آماده تحویل",
      color: "bg-blue-100 text-blue-800",
    },
    unrepairable: { label: "غیرقابل تعمیر", color: "bg-red-100 text-red-800" },
    not_repaired: { label: "تعمیر نشد", color: "bg-orange-100 text-red-800" },
  };

  const current = map[status] || {
    label: status,
    color: "bg-gray-100 text-gray-600",
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
          className="p-0.5 rounded-full text-gray-400 hover:text-blue-600 group-hover:text-white hover:bg-blue-50 transition-colors"
          title="تغییر وضعیت"
        >
          <ArrowsRightLeftIcon className="size-5" />
        </button>
      </div>

      {/* Modal انتخاب وضعیت */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-xs mx-4 overflow-hidden"
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">تغییر وضعیت</h3>
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
                      : "text-gray-700 hover:bg-gray-50"
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
            <div className="p-2 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2.5 text-sm text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
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

function formatDate(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleDateString("fa-IR");
}

function AssigneeBadge({ assignees }) {
  if (!assignees || assignees.length === 0) {
    return <span className="text-gray-400 text-xs">—</span>;
  }
  if (assignees.length === 1) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-indigo-100 text-indigo-800">
        {assignees[0].name}
      </span>
    );
  }
  return (
    <span
      title={assignees.map((a) => a.name).join("، ")}
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 text-purple-800 cursor-help"
    >
      مشترک ({assignees.length} نفر)
    </span>
  );
}

const EMPTY_FILTERS = {
  status: [],
  brand: "",
  customer_id: "",
  personnel_ids: [],
  entry_from: "",
  entry_to: "",
  invoice_status: [],
};

export default function DeviceList() {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [customers, setCustomers] = useState([]);
  const [personnelList, setPersonnelList] = useState([]);

  const { isAtLeast } = useAuth();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;
  const [filterOpen, setFilterOpen] = useState(false);

  const {
    openDeviceDetail,
    openDeviceEdit,
    openCustomerDetail,
    refreshList,
    openSaleInvoiceCreate,
    openSaleInvoiceDetail,
  } = useModal();

  const debouncedSearch = useDebounce(searchInput, 400);

  // ─── Fetch ────────────────────────────────────────────────────
  const fetchDevices = useCallback(
    async (searchTerm, activeFilters, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };

        if (searchTerm) params.search = searchTerm;
        if (activeFilters.status?.length > 0)
          params.status = activeFilters.status.join(",");
        if (activeFilters.brand) params.brand = activeFilters.brand;
        if (activeFilters.customer_id)
          params.customer_id = activeFilters.customer_id;
        if (activeFilters.entry_from)
          params.entry_from = activeFilters.entry_from;
        if (activeFilters.entry_to) params.entry_to = activeFilters.entry_to;
        if (activeFilters.personnel_ids?.length > 0)
          params.personnel_ids = activeFilters.personnel_ids.join(",");
        if (activeFilters.invoice_status?.length > 0)
          params.invoice_status = activeFilters.invoice_status.join(",");

        const res = await getDevices(params);
        const api = res.data;

        if (api && typeof api === "object" && !Array.isArray(api)) {
          setDevices(api.data || []);
          setTotal(api.total || 0);
          setTotalPages(api.totalPages || 1);
        } else if (Array.isArray(api)) {
          setDevices(api);
          setTotal(api.length);
          setTotalPages(1);
        } else {
          setDevices([]);
          setTotal(0);
          setTotalPages(1);
        }
      } catch {
        toast.error("خطا در دریافت لیست دستگاه‌ها");
        setDevices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  // ─── Effects ──────────────────────────────────────────────────
  // ─── Effects ──────────────────────────────────────────────────
  useEffect(() => {
    getCustomers()
      .then((res) => setCustomers(res.data.data ?? res.data))
      .catch(() => {});

    getPersonnel({ limit: 200 })
      .then((res) => {
        const raw = res.data.data ?? res.data;
        const normalized = Array.isArray(raw)
          ? raw.map((p) => ({
              ...p,
              name: p.name ?? p.full_name ?? p.username ?? "—",
            }))
          : [];
        setPersonnelList(normalized);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchDevices(debouncedSearch, filters, page, limit);
  }, [debouncedSearch, filters, page, limit, fetchDevices]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filters]);

  // Register refresh callback
  useEffect(() => {
    refreshList(() => {
      fetchDevices(debouncedSearch, filters, page, limit);
    });
  }, [refreshList, fetchDevices, debouncedSearch, filters, page, limit]);
  // ─── Handlers ─────────────────────────────────────────────────

  const handleStatusChange = async (deviceId, newStatus) => {
    try {
      await updateDevice(deviceId, { status: newStatus });
      toast.success("وضعیت دستگاه بروز شد");
      fetchDevices(debouncedSearch, filters, page, limit);
    } catch {
      toast.error("خطا در تغییر وضعیت");
    }
  };

  const handleToggleNeedsInvoice = async (deviceId, value) => {
    try {
      await updateDevice(deviceId, { needs_invoice: value });
      toast.success(value === 0 ? "فاکتور لازم نیست" : "آماده برای فاکتور");
      fetchDevices(debouncedSearch, filters, page, limit);
    } catch {
      toast.error("خطا در تغییر وضعیت");
    }
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex gap-2">
          <WrenchScrewdriverIcon className="w-6 h-6 text-gray-600" />
          دستگاه‌ها
        </h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <FunnelIcon className="w-5 h-5" />
            <span>فیلترها</span>
            {activeFilterCount > 0 && (
              <span className="bg-white text-green-600 text-xs font-bold rounded-full  py-1 px-2.5 flex items-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => openDeviceEdit(null)}
            className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
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
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
        <div className="text-center py-20 text-gray-400">
          {searchInput
            ? `نتیجه‌ای برای "${searchInput}" یافت نشد`
            : "هیچ دستگاهی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1400px] lg:min-w-full divide-y divide-gray-200">
              <thead className="bg-yellow-300">
                <tr>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    شماره پذیرش
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    مشتری
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    شماره تماس
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    نوع دستگاه
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    برند
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    وضعیت دستگاه
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    تعمیرکار
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    تاریخ ثبت
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l  ">
                    تاریخ خروج
                  </th>

                  {isAtLeast("admin") && (
                    <>
                      <th className="px-4 py-3 text-center font-semibold text-black border-b border-gray-500  border-l  ">
                        وضعیت پرداخت
                      </th>
                      <th className="px-4 py-3 text-center font-semibold text-black border-b border-gray-500    ">
                        عملیات
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {devices.map((device, index) => (
                  <tr
                    key={device.id}
                    onClick={() => openDeviceEdit(device.id)}
                    className={`hover:bg-gray-500 hover:text-white transition-colors hover:cursor-pointer group ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-200/50"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600 font-mono">
                      {device.id}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openCustomerDetail(device.customer_id);
                        }}
                        className="text-blue-600 group-hover:text-white hover:underline font-medium"
                      >
                        {device.customer_name ?? "مشتری"}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600 ">
                      {device.customer_phone}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600">
                      {device.device_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600">
                      {device.brand ?? "—"}
                    </td>
                    <td className="px-4 py-3 border-l border-gray-600">
                      <StatusBadge
                        status={device.status}
                        onStatusChange={(newStatus) =>
                          handleStatusChange(device.id, newStatus)
                        }
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600">
                      <AssigneeBadge assignees={device.assignees} />
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600 ">
                      {formatDate(device.entry_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-gray-600 ">
                      {formatDate(device.exit_date)}
                    </td>

                    {isAtLeast("admin") && (
                      <>
                        <td className="px-4 py-3 flex  justify-center border-l border-gray-600">
                          <InvoiceStatusBadge
                            device={device}
                            onToggleNeedsInvoice={handleToggleNeedsInvoice}
                            isAdmin={isAtLeast("admin")}
                          />
                        </td>

                        <td className="px-4 py-3 text-sm text-center ">
                          <div className="flex gap-2 justify-end items-center">
                            {isAtLeast("admin") && (
                              <>
                                {device.invoice_count > 0 ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openSaleInvoiceDetail(
                                        device.sale_invoice_id,
                                      );
                                    }}
                                    className={`p-2 rounded-lg transition-colors ${
                                      device.invoice_status === "paid"
                                        ? "bg-green-50 text-green-600 hover:bg-green-100"
                                        : "bg-red-50 text-red-600 hover:bg-red-100"
                                    }`}
                                    title={
                                      device.invoice_status === "paid"
                                        ? "فاکتور پرداخت شده"
                                        : "فاکتور پرداخت نشده"
                                    }
                                  >
                                    <DocumentCheckIcon className="w-5 h-5" />
                                  </button>
                                ) : device.needs_invoice === 0 ? (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleToggleNeedsInvoice(device.id, 1);
                                    }}
                                    className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors"
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
                                      className="p-2 rounded-lg bg-yellow-50 text-yellow-600 hover:bg-yellow-100 transition-colors"
                                      title="ایجاد فاکتور فروش"
                                    >
                                      <DocumentCurrencyDollarIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleToggleNeedsInvoice(device.id, 0);
                                      }}
                                      className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                                      title="فاکتور لازم نیست"
                                    >
                                      <XCircleIcon className="w-5 h-5" />
                                    </button>
                                  </>
                                )}

                                <div className="w-px h-8 bg-gray-300 mx-1" />
                              </>
                            )}

                            {/* <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeviceDetail(device.id);
                          }}
                          className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                          title="مشاهده جزئیات"
                        >
                          <EyeIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeviceEdit(device.id);
                          }}
                          className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                          title="ویرایش"
                        >
                          <PencilSquareIcon className="w-5 h-5" />
                        </button> */}
                            {isAtLeast("admin") && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteTarget(device);
                                }}
                                className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
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
            await deleteDevice(deleteTarget.id);
            toast.success("دستگاه حذف شد");
            setDeleteTarget(null);
            fetchDevices(debouncedSearch, filters, page, limit);
          } catch {
            toast.error("خطا در حذف دستگاه");
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
