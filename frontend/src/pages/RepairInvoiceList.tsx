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
      color: "bg-success-soft text-success",
      icon: CheckCircleIcon,
    },
    cancelled: {
      label: "ابطال شده",
      color: "bg-danger-soft text-danger",
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
      className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit mx-auto ${s.color}`}
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
      color: "bg-success-soft text-success",
      icon: CheckCircleIcon,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-warning-soft text-warning",
      icon: ExclamationCircleIcon,
    },
    pending: {
      label: "در انتظار",
      color: "bg-warning-soft text-warning",
      icon: ClockIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-surface-alt" };
  const Icon = s.icon;
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit mx-auto ${s.color}`}
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <WrenchScrewdriverIcon className="w-6 h-6 text-text-secondary" />
          فاکتورهای تعمیر
        </h1>
        <button
          onClick={() => openRepairInvoiceCreate()}
          className="bg-primary text-text-inverse px-4 py-2 rounded-lg hover:bg-primary-hover flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          فاکتور جدید
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[250px] relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در شماره فاکتور، مشتری یا دستگاه..."
            className="w-full pr-10 pl-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
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
            className="text-sm text-text-secondary hover:text-text-primary underline"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          {searchInput || statusFilter
            ? "نتیجه‌ای یافت نشد"
            : "هیچ فاکتور تعمیری ثبت نشده"}
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] lg:min-w-full divide-y divide-border">
              <thead className="bg-primary-soft">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    شماره فاکتور
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    دستگاه
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    مشتری
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تاریخ
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    مبلغ کل
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    پرداخت شده
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    مانده
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    وضعیت
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    پرداخت
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice, index) => {
                  const remaining = invoice.total_amount - invoice.paid_amount;
                  const canEdit = invoice.status === "draft";
                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => openRepairInvoiceDetail(invoice.id)}
                      className={`hover:bg-primary transition-colors cursor-pointer group ${
                        index % 2 === 0 ? "bg-surface" : "bg-surface-alt"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-l border-border">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openDeviceDetail(invoice.device_id);
                          }}
                          className="text-primary hover:underline font-medium group-hover:text-text-inverse"
                        >
                          {invoice.device_name}{" "}
                          {invoice.brand && `(${invoice.brand})`}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                        {invoice.customer_id ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (invoice.customer_id)
                                openCustomerDetail(invoice.customer_id);
                            }}
                            className="text-primary hover:underline font-medium group-hover:text-text-inverse"
                          >
                            {invoice.customer_name || "—"}
                          </button>
                        ) : (
                          invoice.customer_name || "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-center border-l border-border group-hover:text-text-inverse">
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                        {formatPersianCurrency(invoice.total_amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-success text-center border-l border-border group-hover:text-text-inverse">
                        {formatPersianCurrency(invoice.paid_amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-danger text-center border-l border-border group-hover:text-text-inverse">
                        {remaining > 0 ? formatPersianCurrency(remaining) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center border-l border-border group-hover:text-text-inverse">
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className="px-4 py-3 text-center border-l border-border group-hover:text-text-inverse">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openRepairInvoiceDetail(invoice.id);
                            }}
                            className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                            title="جزئیات"
                          >
                            <EyeIcon className="w-5 h-5" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openRepairInvoiceEdit(invoice.id);
                              }}
                              className="p-2 rounded-lg bg-success-soft text-success hover:opacity-80 transition-colors"
                              title="ویرایش"
                            >
                              <PencilSquareIcon className="w-5 h-5" />
                            </button>
                          )}
                          {isAtLeast("admin") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(invoice);
                              }}
                              className="p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors cursor-pointer"
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
