import { useEffect, useState, useCallback, useRef } from "react";
import { getRepairInvoices, deleteRepairInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import { formatPersianCurrency } from "../utils/formatters";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationCircleIcon,
  DocumentTextIcon,
  XCircleIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import { useDebounce } from "../utils/helpers";
import {
  badge,
  iconButton,
  primaryButton,
  searchField,
  searchIcon,
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
  toolbarSelect,
  trClickable,
} from "../utils/tableClasses";
import type {
  PaymentStatus,
  QueryParams,
  RepairInvoice,
  RepairInvoiceStatus,
} from "../types/api";

interface BadgeStyle {
  label: string;
  color: string;
  icon?: React.ComponentType<{ className?: string }>;
}

function StatusBadge({ status }: { status: RepairInvoiceStatus }) {
  const map: Record<string, BadgeStyle> = {
    draft: {
      label: "پیش‌نویس",
      color: "bg-surface-alt text-text-primary",
      icon: DocumentTextIcon,
    },
    issued: {
      label: "صادر شده",
      color: "bg-primary-soft text-primary",
      icon: CheckCircleIcon,
    },
    paid: {
      label: "پرداخت شده",
      color: "bg-success-soft text-success-fg",
      icon: CheckCircleIcon,
    },
    cancelled: {
      label: "ابطال شده",
      color: "bg-danger-soft text-danger-fg",
      icon: XCircleIcon,
    },
  };
  const s = map[status] || {
    label: status,
    color: "bg-surface-alt",
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
      label: "در انتظار",
      color: "bg-warning-soft text-warning-fg",
      icon: ClockIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-surface-alt" };
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

const statusOptions: { value: string; label: string }[] = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "draft", label: "پیش‌نویس" },
  { value: "issued", label: "صادر شده" },
  { value: "paid", label: "پرداخت شده" },
  { value: "cancelled", label: "ابطال شده" },
];

export default function RepairInvoiceList() {
  const [invoices, setInvoices] = useState<RepairInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const { isAtLeast } = useAuth();
  const {
    openRepairInvoiceDetail,
    openRepairInvoiceCreate,
    openRepairInvoiceEdit,
    openDeviceDetail,
    openCustomerDetail,
    refreshList,
  } = useModal();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<RepairInvoice | null>(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (
      searchTerm: string,
      status: string,
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;
        if (status) params.status = status;
        const res = await getRepairInvoices(params);
        setInvoices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        toast.error("خطا در دریافت لیست فاکتورهای تعمیر");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchInvoices(debouncedSearch, statusFilter, page, limit);
  }, [debouncedSearch, statusFilter, page, limit, fetchInvoices]);

  const isFirstRender = useRef(true);
  // Lets a modal refresh this list when the last of them closes. The other
  // five lists have always done this; without it an invoice edited or
  // cancelled from its modal left a stale row behind.
  useEffect(() => {
    refreshList(() => {
      void fetchInvoices(debouncedSearch, statusFilter, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, statusFilter, page, limit]);

  const formatDate = (d: string | null | undefined) =>
    d ? new Date(d).toLocaleDateString("fa-IR") : "—";

  return (
    <div dir="rtl">
      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در شماره فاکتور، مشتری یا دستگاه…"
            aria-label="جستجوی فاکتور تعمیر"
            className={searchField}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="وضعیت فاکتور"
          className={toolbarSelect}
        >
          {statusOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {(searchInput || statusFilter) && (
          <button
            onClick={() => {
              setSearchInput("");
              setStatusFilter("");
            }}
            className="shrink-0 text-body-sm text-text-secondary hover:text-primary transition-colors cursor-pointer"
          >
            پاک کردن
          </button>
        )}

        <div className={toolbarActions}>
          <button onClick={() => openRepairInvoiceCreate()} className={primaryButton}>
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            فاکتور جدید
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" />
        </div>
      ) : invoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <span className="w-14 h-14 rounded-card bg-surface-alt flex items-center justify-center mb-4">
            <WrenchScrewdriverIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput || statusFilter
              ? "نتیجه‌ای یافت نشد"
              : "هنوز فاکتور تعمیری ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput || statusFilter
              ? "فیلترها را بردارید یا عبارت دیگری را امتحان کنید."
              : "اجرت تعمیر و قطعات مصرفی از اینجا فاکتور می‌شود."}
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
                    دستگاه
                  </th>
                  <th className={th}>
                    مشتری
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
                    پرداخت
                  </th>
                  <th className={th}>
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className={tbody}>
                {invoices.map((invoice, index) => {
                  const remaining = invoice.total_amount - invoice.paid_amount;
                  const canEdit = invoice.status === "draft";
                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => openRepairInvoiceDetail(invoice.id)}
                      className={trClickable}
                    >
                      <td className={`${td} tabular-nums`}>
                        {invoice.invoice_number}
                      </td>
                      <td className={td}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeviceDetail(invoice.device_id);
                          }}
                          className="text-primary hover:underline font-medium"
                        >
                          {invoice.device_name}{" "}
                          {invoice.brand && `(${invoice.brand})`}
                        </button>
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
                          invoice.customer_name || "—"
                        )}
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
                      <td className="px-3 py-3 text-center">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-3 py-3 text-center">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openRepairInvoiceDetail(invoice.id);
                            }}
                            className={`${iconButton} bg-primary-soft text-primary`}
                            title="جزئیات"
                          >
                            <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openRepairInvoiceEdit(invoice.id);
                              }}
                              className={`${iconButton} bg-surface-alt text-text-secondary`}
                              title="ویرایش"
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
            onLimitChange={(l) => {
              setLimit(l);
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
            await deleteRepairInvoice(deleteTarget.id);
            toast.success("فاکتور حذف شد");
            setDeleteTarget(null);
            fetchInvoices(debouncedSearch, statusFilter, page, limit);
          } catch {
            toast.error("خطا");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف فاکتور تعمیر"
        message={`آیا از حذف "${deleteTarget?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
