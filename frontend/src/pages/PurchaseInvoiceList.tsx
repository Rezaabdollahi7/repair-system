import { useEffect, useState, useCallback, useRef } from "react";
import { getPurchaseInvoices, deletePurchaseInvoice } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
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
  ShoppingCartIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatPersianCurrency } from "../utils/formatters";
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
  trClickable,
} from "../utils/tableClasses";
import type { PaymentStatus, PurchaseInvoice, QueryParams } from "../types/api";

interface BadgeStyle {
  label: string;
  color: string;
  icon?: React.ReactNode;
}

function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<string, BadgeStyle> = {
    paid: {
      label: "پرداخت شده",
      color: "bg-success-soft text-success-fg",
      icon: <CheckCircleIcon className="w-4 h-4" />,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-warning-soft text-warning-fg",
      icon: <ExclamationCircleIcon className="w-4 h-4" />,
    },
    pending: {
      label: "در انتظار پرداخت",
      color: "bg-warning-soft text-warning-fg",
      icon: <ClockIcon className="w-4 h-4" />,
    },
  };

  const s = map[status] || {
    label: status,
    color: "bg-surface-alt text-text-secondary",
  };
  return (
    <span
      className={`${badge} gap-1 mx-auto ${s.color}`}
    >
      {s.icon}
      {s.label}
    </span>
  );
}

export default function PurchaseInvoiceList() {
  const [invoices, setInvoices] = useState<PurchaseInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const { isAtLeast } = useAuth();
  const { openPurchaseInvoiceDetail, openPurchaseInvoiceCreate, refreshList } =
    useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseInvoice | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (searchTerm: string, currentPage: number, currentLimit: number) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        // The list filters on the supplier's name, not a general search.
        if (searchTerm) params.supplier = searchTerm;

        const res = await getPurchaseInvoices(params);
        setInvoices(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
      } catch {
        toast.error("خطا در دریافت لیست فاکتورها");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchInvoices(debouncedSearch, page, limit);
  }, [debouncedSearch, page, limit, fetchInvoices]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    refreshList(() => {
      void fetchInvoices(debouncedSearch, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, page, limit]);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fa-IR");
  };

  return (
    <div dir="rtl">
      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در نام فروشنده…"
            aria-label="جستجوی فاکتور خرید"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          <button onClick={() => openPurchaseInvoiceCreate()} className={primaryButton}>
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
            <ShoppingCartIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput ? "نتیجه‌ای یافت نشد" : "هنوز فاکتور خریدی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput
              ? "عبارت دیگری را امتحان کنید."
              : "قطعاتی که می‌خرید را اینجا ثبت کنید تا موجودی انبار به‌روز بماند."}
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
                    فروشنده
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
                      onClick={() => openPurchaseInvoiceDetail(invoice.id)}
                      className={trClickable}
                    >
                      <td className={`${td} tabular-nums`}>
                        {invoice.invoice_number}
                      </td>
                      <td className={td}>
                        {invoice.supplier_name || "—"}
                      </td>
                      <td className={tdMuted}>
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className={td}>
                        {formatPersianCurrency(invoice.total_amount)} {` `} ریال
                      </td>
                      <td className={`${td} text-success-fg`}>
                        {formatPersianCurrency(invoice.paid_amount)} {` `} ریال
                      </td>
                      <td className={`${td} text-danger-fg`}>
                        {remaining > 0 ? formatPersianCurrency(remaining) : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex gap-1.5 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPurchaseInvoiceDetail(invoice.id);
                            }}
                            className={`${iconButton} bg-primary-soft text-primary`}
                            title="مشاهده جزئیات"
                          >
                            <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
                          </button>

                          {isAtLeast("admin") && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteTarget(invoice);
                              }}
                              className={`${iconButton} bg-danger-soft text-danger-fg`}
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
            await deletePurchaseInvoice(deleteTarget.id);
            toast.success("فاکتور حذف شد");
            setDeleteTarget(null);
            fetchInvoices(debouncedSearch, page, limit);
          } catch {
            toast.error("خطا در حذف فاکتور");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف فاکتور خرید"
        message={`آیا از حذف فاکتور "${deleteTarget?.invoice_number}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
