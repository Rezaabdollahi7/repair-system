import { useEffect, useState, useCallback, useRef } from "react";
import { getSaleInvoices, deleteSaleInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import { formatPersianPhone } from "../utils/formatters";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  PlusIcon,
  EyeIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  CurrencyDollarIcon,
  FunnelIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatPersianCurrency } from "../utils/formatters";
import SaleInvoiceFilterPanel from "../components/SaleInvoiceFilterPanel";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function PaymentStatusBadge({ status }) {
  const map = {
    paid: {
      label: "پرداخت شده",
      color: "bg-green-100 text-green-800",
      icon: CheckCircleIcon,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-yellow-100 text-yellow-800",
      icon: ExclamationCircleIcon,
    },
    pending: {
      label: "در انتظار",
      color: "bg-orange-100 text-orange-800",
      icon: ClockIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-gray-100" };
  const Icon = s.icon;
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit ${s.color}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {s.label}
    </span>
  );
}

const EMPTY_FILTERS = {
  payment_status: [],
  date_from: "",
  date_to: "",
  amount_from: "",
  amount_to: "",
};

export default function SaleInvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const { isAtLeast } = useAuth();
  const {
    openSaleInvoiceDetail,
    openSaleInvoiceCreate,
    openCustomerDetail,
    refreshList,
  } = useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 400);

  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  const fetchInvoices = useCallback(
    async (searchTerm, activeFilters, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;

        // اضافه کردن فیلترها
        if (activeFilters.payment_status?.length > 0) {
          params.payment_status = activeFilters.payment_status.join(",");
        }
        if (activeFilters.date_from) params.date_from = activeFilters.date_from;
        if (activeFilters.date_to) params.date_to = activeFilters.date_to;
        if (activeFilters.amount_from)
          params.amount_from = activeFilters.amount_from;
        if (activeFilters.amount_to) params.amount_to = activeFilters.amount_to;

        const res = await getSaleInvoices(params);
        const apiData = res.data;
        setInvoices(apiData.data || []);
        setTotal(apiData.total || 0);
        setTotalPages(apiData.totalPages || 1);
      } catch {
        toast.error("خطا در دریافت لیست فاکتورهای فروش");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchInvoices(debouncedSearch, filters, page, limit);
  }, [debouncedSearch, filters, page, limit, fetchInvoices]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, filters]);

  useEffect(() => {
    refreshList(() => {
      fetchInvoices(debouncedSearch, filters, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, filters, page, limit]);

  const formatDate = (dateStr) =>
    dateStr ? new Date(dateStr).toLocaleDateString("fa-IR") : "—";

  return (
    <div dir="rtl">
      {/* هدر با دکمه فیلتر سبز */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CurrencyDollarIcon className="w-6 h-6 text-gray-600" />
          فاکتورهای فروش
        </h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setFilterOpen(true)}
            className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <FunnelIcon className="w-5 h-5" />
            <span>فیلترها</span>
            {activeFilterCount > 0 && (
              <span className="bg-white text-green-600 text-xs font-bold rounded-full px-2 py-0.5 min-w-[20px]">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            onClick={() => openSaleInvoiceCreate()}
            className="flex-1 sm:flex-none bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors shadow-sm"
          >
            <PlusIcon className="w-5 h-5" />
            فاکتور جدید
          </button>
        </div>
      </div>

      {/* جستجو */}
      <div className="mb-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در شماره فاکتور، نام مشتری یا تلفن..."
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
      </div>

      {/* مودال فیلتر */}
      <SaleInvoiceFilterPanel
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

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchInput || activeFilterCount > 0
            ? "نتیجه‌ای یافت نشد"
            : "هیچ فاکتور فروشی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] lg:min-w-full divide-y divide-gray-200">
              <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
                <tr>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    شماره فاکتور
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    مشتری
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    تلفن
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    تاریخ
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    مبلغ کل
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    پرداخت شده
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    مانده
                  </th>
                  <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                    وضعیت
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-indigo-700">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {invoices.map((invoice, index) => {
                  const remaining = invoice.total_amount - invoice.paid_amount;
                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => openSaleInvoiceDetail(invoice.id)}
                      className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {invoice.customer_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCustomerDetail(invoice.customer_id);
                            }}
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {invoice.customer_name || "—"}
                          </button>
                        ) : (
                          invoice.customer_name || "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatPersianPhone(invoice.customer_phone)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium">
                        {formatPersianCurrency(invoice.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600">
                        {formatPersianCurrency(invoice.paid_amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600">
                        {remaining > 0 ? formatPersianCurrency(remaining) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSaleInvoiceDetail(invoice.id);
                            }}
                            className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                            title="مشاهده جزئیات"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                          {isAtLeast("admin") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(invoice);
                              }}
                              className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
                              title="حذف"
                            >
                              <TrashIcon className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && invoices.length > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={setPage}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(1);
            }}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await deleteSaleInvoice(deleteTarget.id);
            toast.success("فاکتور حذف شد");
            setDeleteTarget(null);
            fetchInvoices(debouncedSearch, filters, page, limit);
          } catch {
            toast.error("خطا در حذف فاکتور");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف فاکتور فروش"
        message={`آیا از حذف فاکتور "${deleteTarget?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
