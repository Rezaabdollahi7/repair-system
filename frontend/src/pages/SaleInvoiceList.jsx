// src/pages/SaleInvoiceList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { getSaleInvoices, deleteSaleInvoice } from "../api";
import Pagination from "../components/Pagination";
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
} from "@heroicons/react/24/solid";

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

export default function SaleInvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const { isAtLeast } = useAuth();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (searchTerm, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;

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

  const handleDelete = async (id, invoiceNumber) => {
    if (
      !confirm(
        `آیا از حذف فاکتور "${invoiceNumber}" مطمئن هستید؟\nموجودی کالاها به حالت قبل برمی‌گردد.`,
      )
    )
      return;

    try {
      await deleteSaleInvoice(id);
      toast.success("فاکتور با موفقیت حذف شد");
      fetchInvoices(debouncedSearch, page, limit);
    } catch {
      toast.error("خطا در حذف فاکتور");
    }
  };

  const formatDate = (dateStr) =>
    dateStr ? new Date(dateStr).toLocaleDateString("fa-IR") : "—";
  const formatCurrency = (amount) =>
    amount ? Number(amount).toLocaleString() + " ریال" : "—";

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">فاکتورهای فروش</h1>
        <Link
          to="/sale-invoices/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          فاکتور فروش جدید
        </Link>
      </div>

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

      {loading ? (
        <div className="text-center py-10 text-gray-500">
          در حال بارگذاری...
        </div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchInput ? "نتیجه‌ای یافت نشد" : "هیچ فاکتور فروشی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  شماره فاکتور
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  مشتری
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  تلفن
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  تاریخ
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  مبلغ کل
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  پرداخت شده
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  مانده
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  وضعیت
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoices.map((invoice) => {
                const remaining = invoice.total_amount - invoice.paid_amount;
                return (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-mono font-medium">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {invoice.customer_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {invoice.customer_phone || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatDate(invoice.invoice_date)}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {formatCurrency(invoice.total_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-green-600">
                      {formatCurrency(invoice.paid_amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600">
                      {remaining > 0 ? formatCurrency(remaining) : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={invoice.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2 justify-end">
                        <Link
                          to={`/sale-invoices/${invoice.id}`}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <EyeIcon className="w-4 h-4" />
                          جزئیات
                        </Link>
                        {isAtLeast("admin") && (
                          <button
                            onClick={() =>
                              handleDelete(invoice.id, invoice.invoice_number)
                            }
                            className="text-red-600 hover:underline flex items-center gap-1"
                          >
                            <TrashIcon className="w-4 h-4" />
                            حذف
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
    </div>
  );
}
