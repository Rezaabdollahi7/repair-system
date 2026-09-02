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
      color: "bg-success-soft text-success",
      icon: <CheckCircleIcon className="w-4 h-4" />,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-warning-soft text-warning",
      icon: <ExclamationCircleIcon className="w-4 h-4" />,
    },
    pending: {
      label: "در انتظار پرداخت",
      color: "bg-warning-soft text-warning",
      icon: <ClockIcon className="w-4 h-4" />,
    },
  };

  const s = map[status] || {
    label: status,
    color: "bg-surface-alt text-text-secondary",
  };
  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 w-fit mx-auto ${s.color}`}
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
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <ShoppingCartIcon className="w-6 h-6 text-text-secondary" />
          فاکتورهای خرید
        </h1>
        <button
          onClick={() => openPurchaseInvoiceCreate()}
          className="bg-primary text-text-inverse px-4 py-2 rounded-lg hover:bg-primary-hover flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          فاکتور جدید
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در نام فروشنده..."
            className="w-full pr-10 pl-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          {searchInput ? "نتیجه‌ای یافت نشد" : "هیچ فاکتوری ثبت نشده"}
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
                    فروشنده
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
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoices.map((invoice, index) => {
                  const remaining = invoice.total_amount - invoice.paid_amount;
                  return (
                    <tr
                      key={invoice.id}
                      onClick={() => openPurchaseInvoiceDetail(invoice.id)}
                      className={`hover:bg-primary transition-colors cursor-pointer group ${
                        index % 2 === 0 ? "bg-surface" : "bg-surface-alt"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                        {invoice.supplier_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-text-secondary text-center border-l border-border group-hover:text-text-inverse">
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                        {formatPersianCurrency(invoice.total_amount)} {` `} ریال
                      </td>
                      <td className="px-4 py-3 text-sm text-success text-center border-l border-border group-hover:text-text-inverse">
                        {formatPersianCurrency(invoice.paid_amount)} {` `} ریال
                      </td>
                      <td className="px-4 py-3 text-sm text-danger text-center border-l border-border group-hover:text-text-inverse">
                        {remaining > 0 ? formatPersianCurrency(remaining) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center border-l border-border">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPurchaseInvoiceDetail(invoice.id);
                            }}
                            className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
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
                              className="p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors cursor-pointer"
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
