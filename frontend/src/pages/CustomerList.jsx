import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { getCustomers, deleteCustomer } from "../api";
import Pagination from "../components/Pagination";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  TrashIcon,
  EyeIcon,
  PencilSquareIcon,
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

  const debouncedSearch = useDebounce(searchInput);
  const { isAtLeast } = useAuth();

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
          setCustomers(api);
          setTotal(api.length);
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

  // ─── fix double fetch ──────────────────────────────────────────
  const prevSearchRef = useRef(debouncedSearch);

  useEffect(() => {
    const searchChanged = prevSearchRef.current !== debouncedSearch;
    prevSearchRef.current = debouncedSearch;

    const currentPage = searchChanged ? 1 : page;
    if (searchChanged) setPage(1);

    fetchCustomers(debouncedSearch, currentPage, limit);
  }, [debouncedSearch, page, limit, fetchCustomers]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleDelete = async (id) => {
    if (!confirm("آیا مطمئن هستید؟")) return;
    try {
      await deleteCustomer(id);
      toast.success("مشتری حذف شد");
      fetchCustomers(debouncedSearch, page, limit);
    } catch {
      toast.error("خطا در حذف مشتری");
    }
  };

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">مشتریان</h1>
        <Link
          to="/customers/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          افزودن مشتری
        </Link>
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
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  نام
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  شماره تماس
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  تعداد دستگاه
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link
                      to={`/customers/${c.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {c.phone ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                      {c.device_count ?? 0} دستگاه
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm flex gap-2 justify-end">
                    <Link
                      to={`/customers/${c.id}`}
                      className="text-blue-600 hover:underline hover:underline-offset-8 flex items-center gap-1"
                    >
                      <EyeIcon className="w-4 h-4" />
                      جزئیات
                    </Link>
                    <Link
                      to={`/customers/${c.id}/edit`}
                      className="text-green-600 hover:underline hover:underline-offset-8 flex items-center gap-1"
                    >
                      <PencilSquareIcon className="w-4 h-4" />
                      ویرایش
                    </Link>
                    {isAtLeast("admin") && (
                      <button
                        onClick={() => handleDelete(c.id)}
                        className="text-red-600 hover:underline hover:underline-offset-8 flex items-center gap-1 cursor-pointer"
                      >
                        <TrashIcon className="w-4 h-4" />
                        حذف
                      </button>
                    )}
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
    </div>
  );
}
