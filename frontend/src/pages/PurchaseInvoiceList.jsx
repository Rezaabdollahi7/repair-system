// src/pages/PurchaseInvoiceList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
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
      icon: <CheckCircleIcon className="w-4 h-4" />,
    },
    partial: {
      label: "پرداخت ناقص",
      color: "bg-yellow-100 text-yellow-800",
      icon: <ExclamationCircleIcon className="w-4 h-4" />,
    },
    pending: {
      label: "در انتظار پرداخت",
      color: "bg-orange-100 text-orange-800",
      icon: <ClockIcon className="w-4 h-4" />,
    },
  };

  const s = map[status] || {
    label: status,
    color: "bg-gray-100 text-gray-600",
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
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const { isAtLeast } = useAuth();
  const { openPurchaseInvoiceDetail, openPurchaseInvoiceCreate, refreshList } =
    useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (searchTerm, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.supplier = searchTerm;

        const res = await getPurchaseInvoices(params);
        const apiData = res.data;

        setInvoices(apiData.data || []);
        setTotal(apiData.total || 0);
        setTotalPages(apiData.totalPages || 1);
      } catch (error) {
        toast.error("خطا در دریافت لیست فاکتورها");
        setInvoices([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchInvoices(debouncedSearch, page, limit);
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
      fetchInvoices(debouncedSearch, page, limit);
    });
  }, [refreshList, fetchInvoices, debouncedSearch, page, limit]);

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString("fa-IR");
  };

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <ShoppingCartIcon className="w-6 h-6 text-gray-600" />
          فاکتورهای خرید
        </h1>
        <button
          onClick={() => openPurchaseInvoiceCreate()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          فاکتور جدید
        </button>
      </div>

      <div className="mb-4">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در نام فروشنده..."
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchInput ? "نتیجه‌ای یافت نشد" : "هیچ فاکتوری ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] lg:min-w-full  divide-y divide-gray-200">
              <thead className="bg-yellow-300">
                <tr>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    شماره فاکتور
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    فروشنده
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    تاریخ
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    مبلغ کل
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    پرداخت شده
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    مانده
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  border-l">
                    وضعیت
                  </th>
                  <th className="px-4 py-3 text-center  font-semibold text-black border-b border-gray-500  ">
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
                      onClick={() => openPurchaseInvoiceDetail(invoice.id)}
                      className={`hover:bg-gray-500 transition-colors cursor-pointer group ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-200/50"
                      }`}
                    >
                      <td className="px-4 py-3 text-sm font-mono font-medium text-center border-l border-gray-600 group-hover:text-white">
                        {invoice.invoice_number}
                      </td>
                      <td className="px-4 py-3 text-sm text-center border-l border-gray-600 group-hover:text-white">
                        {invoice.supplier_name || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-center border-l border-gray-600 group-hover:text-white">
                        {formatDate(invoice.invoice_date)}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-center border-l border-gray-600 group-hover:text-white">
                        {formatPersianCurrency(invoice.total_amount)} {` `} ریال
                      </td>
                      <td className="px-4 py-3 text-sm text-green-600 text-center border-l border-gray-600 group-hover:text-white">
                        {formatPersianCurrency(invoice.paid_amount)} {` `} ریال
                      </td>
                      <td className="px-4 py-3 text-sm text-red-600 text-center border-l border-gray-600 group-hover:text-white">
                        {remaining > 0 ? formatPersianCurrency(remaining) : "—"}
                      </td>
                      <td className="px-4 py-3 text-center border-l border-gray-600 ">
                        <PaymentStatusBadge status={invoice.payment_status} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="flex gap-1 justify-center">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openPurchaseInvoiceDetail(invoice.id);
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
