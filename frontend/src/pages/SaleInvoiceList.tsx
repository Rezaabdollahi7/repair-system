import { useEffect, useState, useCallback, useRef } from "react";
import { getSaleInvoices, deleteSaleInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import { formatPersianPhone, formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  PlusIcon,
  EyeIcon,
  TrashIcon,
  PencilSquareIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import SaleInvoiceFilterPanel from "../components/SaleInvoiceFilterPanel";
import { useDebounce } from "../utils/helpers";
import {
  badge,
  iconButton,
  primaryButton,
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
import type { SaleInvoiceFilters } from "../components/SaleInvoiceFilterPanel";
import type { PaymentStatus, QueryParams, SaleInvoice } from "../types/api";

interface BadgeStyle {
  label: string;
  color: string;
  icon?: React.ComponentType<{ className?: string }>;
}

/**
 * Bound to success/warning/danger rather than primary: these carry a fixed
 * meaning — paid is always green — and must not follow the brand colour when
 * the theme changes.
 */
function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<string, BadgeStyle> = {
    paid: {
      label: "پرداخت شده",
      color: "bg-success-soft text-success-fg",
      icon: CheckCircleIcon,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-warning-soft text-warning-fg",
      icon: ExclamationCircleIcon,
    },
    pending: {
      label: "در انتظار پرداخت",
      color: "bg-danger-soft text-danger-fg",
      icon: ClockIcon,
    },
  };
  const s = map[status] || {
    label: status,
    color: "bg-surface-alt text-text-secondary",
  };
  const Icon = s.icon;
  return (
    <span
      className={`${badge} gap-1 mx-auto ${s.color}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {s.label}
    </span>
  );
}

const EMPTY_FILTERS: SaleInvoiceFilters = {
  payment_status: [],
  date_from: "",
  date_to: "",
  amount_from: "",
  amount_to: "",
};

export default function SaleInvoiceList() {
  const [invoices, setInvoices] = useState<SaleInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState<SaleInvoiceFilters>(EMPTY_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const { isAtLeast } = useAuth();
  const {
    openSaleInvoiceDetail,
    openSaleInvoiceCreate,
    openSaleInvoiceEdit,
    openCustomerDetail,
    refreshList,
  } = useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<SaleInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 400);

  const activeFilterCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  const fetchInvoices = useCallback(
    async (
      searchTerm: string,
      activeFilters: SaleInvoiceFilters,
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;

        if (activeFilters.payment_status.length > 0) {
          params.payment_status = activeFilters.payment_status.join(",");
        }
        if (activeFilters.date_from) params.date_from = activeFilters.date_from;
        if (activeFilters.date_to) params.date_to = activeFilters.date_to;
        if (activeFilters.amount_from)
          params.amount_from = activeFilters.amount_from;
        if (activeFilters.amount_to) params.amount_to = activeFilters.amount_to;

        const res = await getSaleInvoices(params);
        setInvoices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
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
    void fetchInvoices(debouncedSearch, filters, page, limit);
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
      void fetchInvoices(debouncedSearch, filters, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, filters, page, limit]);

  const formatDate = (dateStr: string | null | undefined) =>
    dateStr ? new Date(dateStr).toLocaleDateString("fa-IR") : "—";

  return (
    <div dir="rtl">
      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در شماره فاکتور، نام مشتری یا تلفن…"
            aria-label="جستجوی فاکتور فروش"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          <button onClick={() => setFilterOpen(true)} className={secondaryButton}>
            <FunnelIcon className="w-[1.15rem] h-[1.15rem] text-text-secondary" />
            فیلترها
            {activeFilterCount > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-pill bg-primary text-primary-fg text-body-xs flex items-center justify-center">
                {toPersianDigits(activeFilterCount)}
              </span>
            )}
          </button>
          <button onClick={() => openSaleInvoiceCreate()} className={primaryButton}>
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            فاکتور جدید
          </button>
        </div>
      </div>

      {/* Filter panel */}
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
          <LoadingSpinner size="md" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <span className="w-14 h-14 rounded-card bg-surface-alt flex items-center justify-center mb-4">
            <CurrencyDollarIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput || activeFilterCount > 0
              ? "نتیجه‌ای یافت نشد"
              : "هنوز فاکتور فروشی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput || activeFilterCount > 0
              ? "فیلترها را بردارید یا عبارت دیگری را امتحان کنید."
              : "فروش قطعات به مشتری از اینجا فاکتور می‌شود."}
          </p>
        </div>
      ) : (
        <div className={tableCard}>
          <div className={tableScroll}>
            <table className="min-w-[1040px] w-full">
              <thead className={thead}>
                <tr>
                  <th className={th}>
                    شماره فاکتور
                  </th>
                  <th className={th}>
                    مشتری
                  </th>
                  <th className={th}>
                    تلفن
                  </th>
                  <th className={th}>
                    تاریخ
                  </th>
                  <th className={th}>
                    مبلغ کل
                  </th>
                  <th className={th}>
                    پرداخت شده
                  </th>
                  <th className={th}>
                    مانده
                  </th>
                  <th className={th}>
                    وضعیت
                  </th>
                  <th className={th}>
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className={tbody}>
                {invoices.map((invoice, index) => {
                  const remaining = invoice.total_amount - invoice.paid_amount;
                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => openSaleInvoiceDetail(invoice.id)}
                      className={trClickable}
                    >
                      <td className={`${td} tabular-nums`}>
                        {invoice.invoice_number}
                      </td>
                      <td className={td}>
                        {invoice.customer_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (invoice.customer_id)
                                openCustomerDetail(invoice.customer_id);
                            }}
                            className="text-primary hover:underline font-medium"
                          >
                            {invoice.customer_name || "—"}
                          </button>
                        ) : (
                          <span className="text-text-primary">
                            {invoice.customer_name || "—"}
                          </span>
                        )}
                      </td>
                      <td className={tdMuted}>
                        {formatPersianPhone(invoice.customer_phone)}
                      </td>
                      <td className={tdMuted}>
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className={td}>
                        {formatPersianCurrency(invoice.total_amount)}
                      </td>
                      <td className={`${td} text-success-fg`}>
                        {formatPersianCurrency(invoice.paid_amount)}
                      </td>
                      <td className={`${td} text-danger-fg`}>
                        {remaining > 0 ? formatPersianCurrency(remaining) : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openSaleInvoiceDetail(invoice.id);
                            }}
                            className={`${iconButton} bg-primary-soft text-primary`}
                            title="مشاهده جزئیات"
                          >
                            <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
                          </button>
                          {/* Edit, admin only */}
                          {isAtLeast("admin") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openSaleInvoiceEdit(invoice.id);
                              }}
                              className={`${iconButton} bg-surface-alt text-text-secondary`}
                              title="ویرایش فاکتور"
                            >
                              <PencilSquareIcon className="w-[1.15rem] h-[1.15rem]" />
                            </button>
                          )}
                          {isAtLeast("admin") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(invoice);
                              }}
                              className={`${iconButton} bg-danger-soft text-danger-fg`}
                              title="حذف"
                            >
                              <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
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
            if (!deleteTarget) return;
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
