// src/pages/ItemList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { getItems, deleteItem, getCategories, searchItems } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import {
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function StockBadge({ current, min }) {
  if (current === 0) {
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        اتمام موجودی
      </span>
    );
  }
  if (current <= min) {
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
        کم‌موجود ({current})
      </span>
    );
  }
  return (
    <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
      موجود ({current})
    </span>
  );
}

export default function ItemList() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState([]);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const { isAtLeast } = useAuth();
  const { openItemEdit } = useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  const fetchItems = useCallback(
    async (searchTerm, categoryId, lowStock, currentPage, currentLimit) => {
      setLoading(true);
      try {
        let res;
        const params = { page: currentPage, limit: currentLimit };
        if (categoryId) params.categoryId = categoryId;
        if (searchTerm) {
          params.q = searchTerm;
          res = await searchItems(params);
        } else {
          res = await getItems(params);
        }

        const apiData = res.data;
        let itemsData = apiData.data || apiData || [];
        const totalItems = apiData.total || itemsData.length;
        setTotal(totalItems);
        setTotalPages(
          apiData.totalPages || Math.ceil(totalItems / currentLimit),
        );
        if (lowStock) {
          itemsData = itemsData.filter(
            (item) => item.currentStock <= item.minStock,
          );
        }
        setItems(itemsData);
      } catch {
        toast.error("خطا در دریافت لیست کالاها");
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    getCategories()
      .then((res) => {
        const cats = res.data?.data || res.data || [];
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchItems(
      debouncedSearch,
      selectedCategory,
      showLowStockOnly,
      page,
      limit,
    );
  }, [
    debouncedSearch,
    selectedCategory,
    showLowStockOnly,
    page,
    limit,
    fetchItems,
  ]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, selectedCategory, showLowStockOnly]);

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedCategory("");
    setShowLowStockOnly(false);
  };

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <CubeIcon className="w-6 h-6 text-gray-600" />
          مدیریت کالاها
        </h1>
        <button
          onClick={() => openItemEdit(null)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          کالای جدید
        </button>
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در کد، نام یا توضیحات..."
            className="w-full pr-10 pl-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            <option value="">همه دسته‌بندی‌ها</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">فقط کالاهای کم‌موجود</span>
          </label>

          {(searchInput || selectedCategory || showLowStockOnly) && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-gray-600 hover:text-gray-900 underline underline-offset-4"
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      {!loading && items.length > 0 && (
        <div className="mb-4 text-sm text-gray-600">
          {total > 0 && <span>تعداد کل کالاها: {total} عدد</span>}
          {showLowStockOnly && (
            <span className="mr-4 text-yellow-700">
              تعداد کالاهای کم‌موجود: {items.length} عدد
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-gray-500">
          در حال بارگذاری...
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          {searchInput || selectedCategory || showLowStockOnly
            ? "نتیجه‌ای یافت نشد"
            : "هیچ کالایی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-white shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gradient-to-r from-indigo-50 to-blue-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  کد کالا
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  نام کالا
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  دسته‌بندی
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  واحد
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  وضعیت موجودی
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  حداقل موجودی
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-indigo-700">
                  قیمت میانگین (ریال)
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-indigo-700">
                  عملیات
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  className={`hover:bg-gray-50 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-gray-50/50"}`}
                >
                  <td className="px-4 py-3 text-sm font-mono">
                    {item.code || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    <Link
                      to={`/items/${item.id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.categoryName || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.unit}
                  </td>
                  <td className="px-4 py-3">
                    <StockBadge
                      current={item.currentStock || 0}
                      min={item.minStock || 0}
                    />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.minStock || 0}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {item.avgPurchasePrice
                      ? Number(item.avgPurchasePrice).toLocaleString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <div className="flex gap-1 justify-center">
                      <Link
                        to={`/items/${item.id}`}
                        className="p-2 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        title="مشاهده جزئیات"
                      >
                        <EyeIcon className="w-5 h-5" />
                      </Link>
                      <button
                        onClick={() => openItemEdit(item.id)}
                        className="p-2 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
                        title="ویرایش"
                      >
                        <PencilSquareIcon className="w-5 h-5" />
                      </button>
                      {isAtLeast("admin") && (
                        <button
                          onClick={() => setDeleteTarget(item)}
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

      {!loading && items.length > 0 && (
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
            await deleteItem(deleteTarget.id);
            toast.success("کالا با موفقیت حذف شد");
            setDeleteTarget(null);
            fetchItems(
              debouncedSearch,
              selectedCategory,
              showLowStockOnly,
              page,
              limit,
            );
          } catch (error) {
            toast.error(error.response?.data?.error || "خطا در حذف کالا");
          } finally {
            setDeleting(false);
          }
        }}
        title="حذف کالا"
        message={`آیا از حذف کالای "${deleteTarget?.name}" مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
