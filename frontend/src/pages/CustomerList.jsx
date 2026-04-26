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

  const { openCustomerDetail, openCustomerEdit } = useModal();
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

  const prevSearchRef = useRef(debouncedSearch);
  useEffect(() => {
    const searchChanged = prevSearchRef.current !== debouncedSearch;
    prevSearchRef.current = debouncedSearch;
    const currentPage = searchChanged ? 1 : page;
    if (searchChanged) setPage(1);
    fetchCustomers(debouncedSearch, currentPage, limit);
  }, [debouncedSearch, page, limit, fetchCustomers]);

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <UserIcon className="w-6 h-6 inline-block text-gray-600" />
          مشتریان
        </h1>
        <button
          onClick={() => openCustomerEdit(null)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
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
          className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {loading ? (
        <div className="text-center py-10 text-gray-500">
          در حال بارگذاری...
        </div>
      ) : customers.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchInput
            ? `نتیجه‌ای برای "${searchInput}" یافت نشد`
            : "هیچ مشتری‌ای ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  نام
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  شماره تماس
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  تعداد دستگاه
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-700">
                  عملیات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((c, index) => (
                <tr
                  key={c.id}
                  className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                >
                  <td className="px-4 py-3 text-sm font-medium">
                    <button
                      onClick={() => openCustomerDetail(c.id)}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {c.name}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {formatPersianPhone(c.phone)}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                      {c.device_count ?? 0} دستگاه
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1 justify-center">
                      <button
                        onClick={() => openCustomerDetail(c.id)}
                        className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        title="مشاهده جزئیات"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => openCustomerEdit(c.id)}
                        className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                        title="ویرایش"
                      >
                        <PencilSquareIcon className="w-5 h-5" />
                      </button>
                      {isAtLeast("admin") && (
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 transition-colors cursor-pointer"
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
