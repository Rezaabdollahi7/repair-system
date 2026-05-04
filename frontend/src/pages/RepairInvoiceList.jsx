// src/pages/RepairInvoiceList.jsx
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

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function StatusBadge({ status }) {
  const map = {
    draft: {
      label: "پیش‌نویس",
      color: "bg-gray-100 text-gray-800",
      icon: DocumentTextIcon,
    },
    issued: {
      label: "صادر شده",
      color: "bg-blue-100 text-blue-800",
      icon: CheckCircleIcon,
    },
    paid: {
      label: "پرداخت شده",
      color: "bg-green-100 text-green-800",
      icon: CheckCircleIcon,
    },
    cancelled: {
      label: "ابطال شده",
      color: "bg-red-100 text-red-800",
      icon: XCircleIcon,
    },
  };
  const s = map[status] || { label: status, color: "bg-gray-100", icon: null };
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

export default function RepairInvoiceList() {
  const [invoices, setInvoices] = useState([]);
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
  } = useModal();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchInvoices = useCallback(
    async (searchTerm, status, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };
        if (searchTerm) params.search = searchTerm;
        if (status) params.status = status;
        const res = await getRepairInvoices(params);
        setInvoices(res.data.data || []);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
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
    fetchInvoices(debouncedSearch, statusFilter, page, limit);
  }, [debouncedSearch, statusFilter, page, limit, fetchInvoices]);
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const formatDate = (d) => (d ? new Date(d).toLocaleDateString("fa-IR") : "—");

  const statusOptions = [
    { value: "", label: "همه وضعیت‌ها" },
    { value: "draft", label: "پیش‌نویس" },
    { value: "issued", label: "صادر شده" },
    { value: "paid", label: "پرداخت شده" },
    { value: "cancelled", label: "ابطال شده" },
  ];

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <WrenchScrewdriverIcon className="w-6 h-6 text-gray-600" />
          فاکتورهای تعمیر
        </h1>
        <button
          onClick={() => openRepairInvoiceCreate()}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          فاکتور تعمیر جدید
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <div className="flex-1 min-w-[250px] relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در شماره فاکتور، مشتری یا دستگاه..."
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg text-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-4 py-2 text-sm bg-white"
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
            className="text-sm text-gray-600 hover:text-gray-900 underline"
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
        <div className="text-center py-20 text-gray-400">
          {searchInput || statusFilter
            ? "نتیجه‌ای یافت نشد"
            : "هیچ فاکتور تعمیری ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
              <tr>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  شماره فاکتور
                </th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  دستگاه
                </th>
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  مشتری
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
                <th className="px-4 py-3 text-right font-semibold text-indigo-700">
                  پرداخت
                </th>
                <th className="px-4 py-3 text-center font-semibold text-indigo-700">
                  عملیات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {invoices.map((invoice, index) => {
                const remaining = invoice.total_amount - invoice.paid_amount;
                const canEdit = invoice.status === "draft";
                return (
                  <tr
                    key={invoice.id}
                    onClick={() => openRepairInvoiceDetail(invoice.id)}
                    className={`hover:bg-gray-50 transition-colors cursor-pointer ${
                      index % 2 === 0 ? "bg-white" : "bg-gray-50/50"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-mono font-medium">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openDeviceDetail(invoice.device_id);
                        }}
                        className="text-blue-600 hover:underline"
                      >
                        {invoice.device_name}{" "}
                        {invoice.brand && `(${invoice.brand})`}
                      </button>
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
                      <StatusBadge status={invoice.status} />
                    </td>
                    <td className="px-4 py-3">
                      <PaymentStatusBadge status={invoice.payment_status} />
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openRepairInvoiceDetail(invoice.id);
                          }}
                          className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
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
                            className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
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
