// src/pages/CustomerList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { getCustomers, deleteCustomer } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { formatPersianPhone } from "../utils/formatters";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import {
  TrashIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusIcon,
  UserIcon,
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

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { openCustomerDetail, openCustomerEdit, refreshList } = useModal();
  const { isAtLeast } = useAuth();
  const debouncedSearch = useDebounce(searchInput);

  const fetchCustomers = useCallback(
    async (search, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };
        if (search) params.search = search;

        const res = await getCustomers(params);
        const api = res.data;

        if (api && typeof api === "object" && !Array.isArray(api)) {
          setCustomers(api.data || []);
          setTotal(api.total || 0);
          setTotalPages(api.totalPages || 1);
        } else {
          setCustomers(Array.isArray(api) ? api : []);
          setTotal(Array.isArray(api) ? api.length : 0);
          setTotalPages(1);
        }
      } catch {
        toast.error("خطا در دریافت لیست مشتریان");
        setCustomers([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    fetchCustomers(debouncedSearch, page, limit);
  }, [debouncedSearch, page, limit, fetchCustomers]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  // Register refresh callback
  useEffect(() => {
    refreshList(() => {
      fetchCustomers(debouncedSearch, page, limit);
    });
  }, [refreshList, fetchCustomers, debouncedSearch, page, limit]);

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <UserIcon className="w-6 h-6 inline-block text-text-secondary" />
          مشتریان
        </h1>
        <button
          onClick={() => openCustomerEdit(null)}
          className="bg-primary text-text-inverse px-4 py-2 rounded-lg hover:bg-primary-hover flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          افزودن مشتری
        </button>
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="جستجو بر اساس نام یا شماره تماس..."
          className="w-full border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          {searchInput
            ? `نتیجه‌ای برای "${searchInput}" یافت نشد`
            : "هیچ مشتری‌ای ثبت نشده"}
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[600px] lg:min-w-full divide-y divide-border">
              <thead className="bg-primary-soft">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    نام
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    شماره تماس
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تعداد دستگاه
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {customers.map((c, index) => (
                  <tr
                    key={c.id}
                    onClick={() => openCustomerDetail(c.id)}
                    className={`hover:bg-primary transition-colors cursor-pointer group ${
                      index % 2 === 0 ? "bg-surface" : "bg-surface-alt"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-medium text-center border-l border-border">
                      <span className="text-primary font-medium group-hover:text-text-inverse">
                        {c.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border group-hover:text-text-inverse">
                      {formatPersianPhone(c.phone)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center border-l border-border">
                      <span className="bg-primary-soft text-primary px-2 py-1 rounded-full text-xs">
                        {c.device_count ?? 0} دستگاه
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCustomerDetail(c.id);
                          }}
                          className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                          title="مشاهده جزئیات"
                        >
                          <EyeIcon className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openCustomerEdit(c.id);
                          }}
                          className="p-2 rounded-lg bg-success-soft text-success hover:opacity-80 transition-colors"
                          title="ویرایش"
                        >
                          <PencilSquareIcon className="w-5 h-5" />
                        </button>
                        {isAtLeast("admin") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(c);
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          setDeleting(true);
          try {
            await deleteCustomer(deleteTarget.id);
            toast.success("مشتری حذف شد");
            setDeleteTarget(null);
            fetchCustomers(debouncedSearch, page, limit);
          } catch {
            toast.error("خطا در حذف مشتری");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف مشتری"
        message={`آیا از حذف مشتری "${deleteTarget?.name}" مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
