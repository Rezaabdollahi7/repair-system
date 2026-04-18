// src/pages/ItemList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { getItems, deleteItem, getCategories, searchItems } from "../api";
import Pagination from "../components/Pagination";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";

import {
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
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

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const debouncedSearch = useDebounce(searchInput, 400);

  // ─── Fetch ────────────────────────────────────────────────────
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

        // Handle new paginated response structure
        let itemsData = apiData.data || apiData || [];
        const totalItems = apiData.total || itemsData.length;

        setTotal(totalItems);
        setTotalPages(
          apiData.totalPages || Math.ceil(totalItems / currentLimit),
        );

        // Filter by low stock if enabled
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

  // ─── Effects ──────────────────────────────────────────────────
  useEffect(() => {
    getCategories()
      .then((res) => {
        const cats = res.data?.data || res.data || [];
        setCategories(Array.isArray(cats) ? cats : []);
      })
      .catch(() => {
        toast.error("خطا در دریافت دسته‌بندی‌ها");
      });
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

  // Reset to page 1 when filters change
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, selectedCategory, showLowStockOnly]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleDelete = async (id, name) => {
    if (!confirm(`آیا از حذف کالای "${name}" مطمئن هستید؟`)) return;
    try {
      await deleteItem(id);
      toast.success("کالا با موفقیت حذف شد");
      fetchItems(
        debouncedSearch,
        selectedCategory,
        showLowStockOnly,
        page,
        limit,
      );
    } catch (error) {
      if (error.response?.status === 400) {
        toast.error(error.response.data.error || "این کالا قابل حذف نیست");
      } else {
        toast.error("خطا در حذف کالا");
      }
    }
  };

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedCategory("");
    setShowLowStockOnly(false);
  };

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">مدیریت کالاها</h1>
        <Link
          to="/items/new"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          کالای جدید
        </Link>
      </div>

      {/* Search + Filters */}
      <div className="mb-4 space-y-3">
        {/* Search Bar */}
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

        {/* Filters Row */}
        <div className="flex flex-wrap gap-3 items-center">
          {/* Category Filter */}
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

          {/* Low Stock Toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">فقط کالاهای کم‌موجود</span>
          </label>

          {/* Clear Filters Button */}
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

      {/* Stats Summary */}
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

      {/* Table */}
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
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  کد کالا
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  نام کالا
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  دسته‌بندی
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  واحد
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  وضعیت موجودی
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  حداقل موجودی
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">
                  قیمت میانگین (ریال)
                </th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm font-mono">
                    {item.code || "—"}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">
                    {item.name}
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
                    <div className="flex gap-2 justify-end">
                      <Link
                        to={`/items/${item.id}`}
                        className="text-blue-600 hover:underline hover:underline-offset-8 flex items-center gap-1"
                        title="مشاهده جزئیات"
                      >
                        <EyeIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">جزئیات</span>
                      </Link>
                      <Link
                        to={`/items/${item.id}/edit`}
                        className="text-green-600 hover:underline hover:underline-offset-8 flex items-center gap-1"
                        title="ویرایش"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                        <span className="hidden sm:inline">ویرایش</span>
                      </Link>
                      {isAtLeast("admin") && (
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          className="text-red-600 hover:underline hover:underline-offset-8 flex items-center gap-1 cursor-pointer"
                          title="حذف"
                        >
                          <TrashIcon className="w-4 h-4" />
                          <span className="hidden sm:inline">حذف</span>
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

      {/* Pagination */}
      {!loading && items.length > 0 && (
        <div className="mt-4">
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            limit={limit}
            onPageChange={(newPage) => setPage(newPage)}
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
