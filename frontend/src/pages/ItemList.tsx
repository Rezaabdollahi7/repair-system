import { useEffect, useState, useCallback, useRef } from "react";
import { getItems, deleteItem, getCategories, searchItems } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import CategoryManageModal from "../components/CategoryManageModal";

import {
  FolderPlusIcon,
  PlusIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import { formatPersianCurrency } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import type { Category, Item, QueryParams } from "../types/api";

function StockBadge({ current, min }: { current: number; min: number }) {
  if (current === 0) {
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-danger-soft text-danger mx-auto">
        اتمام موجودی
      </span>
    );
  }
  if (current <= min) {
    return (
      <span className="px-2 py-1 rounded-full text-xs font-medium bg-warning-soft text-warning mx-auto">
        کم‌موجود ({current})
      </span>
    );
  }
  return (
    <span className="px-2 py-1 rounded-full text-xs font-medium bg-success-soft text-success mx-auto">
      موجود ({current})
    </span>
  );
}

export default function ItemList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);

  const { isAtLeast } = useAuth();
  const { openItemEdit, openItemDetail, refreshList } = useModal();

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null);
  const [deleting, setDeleting] = useState(false);

  const debouncedSearch = useDebounce(searchInput, 400);

  const [showCategoryModal, setShowCategoryModal] = useState(false);

  const fetchItems = useCallback(
    async (
      searchTerm: string,
      categoryId: string,
      lowStock: boolean,
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (categoryId) params.categoryId = categoryId;

        const res = searchTerm
          ? await searchItems({ ...params, q: searchTerm })
          : await getItems(params);

        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);

        // Applied after the page has been fetched, so it only ever sees the
        // rows already on screen. getLowStockItems does this server-side.
        setItems(
          lowStock
            ? res.data.data.filter((item) => item.currentStock <= item.minStock)
            : res.data.data,
        );
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
      .then((res) => setCategories(res.data))
      .catch(() => {});
  }, []);

  useEffect(() => {
    void fetchItems(
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

  useEffect(() => {
    refreshList(() => {
      void fetchItems(
        debouncedSearch,
        selectedCategory,
        showLowStockOnly,
        page,
        limit,
      );
    });
  }, [
    refreshList,
    fetchItems,
    debouncedSearch,
    selectedCategory,
    showLowStockOnly,
    page,
    limit,
  ]);

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedCategory("");
    setShowLowStockOnly(false);
  };

  return (
    <div dir="rtl">
      {/* Header - responsive */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary flex items-center gap-2">
          <CubeIcon className="w-5 h-5 sm:w-6 sm:h-6 text-text-secondary" />
          مدیریت کالاها
        </h1>
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="bg-primary-soft text-primary px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:opacity-80 flex items-center gap-1 flex-1 sm:gap-2 text-sm"
          >
            <FolderPlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="lg:text-base">دسته‌بندی‌ها</span>
          </button>
          <button
            onClick={() => openItemEdit(null)}
            className="bg-primary text-text-inverse px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-primary-hover flex items-center gap-1 sm:gap-2 text-sm flex-1 sm:flex-none justify-center"
          >
            <PlusIcon className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="lg:text-base">کالای جدید</span>
          </button>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-secondary" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در کد، نام یا توضیحات..."
            className="w-full pr-10 pl-4 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
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
              className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
            />
            <span className="text-sm text-text-primary">
              فقط کالاهای کم‌موجود
            </span>
          </label>

          {(searchInput || selectedCategory || showLowStockOnly) && (
            <button
              onClick={handleClearFilters}
              className="text-sm text-text-secondary hover:text-text-primary underline underline-offset-4"
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      {!loading && items.length > 0 && (
        <div className="mb-4 text-sm text-text-secondary">
          {total > 0 && <span>تعداد کل کالاها: {total} عدد</span>}
          {showLowStockOnly && (
            <span className="mr-4 text-warning">
              تعداد کالاهای کم‌موجود: {items.length} عدد
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          {searchInput || selectedCategory || showLowStockOnly
            ? "نتیجه‌ای یافت نشد"
            : "هیچ کالایی ثبت نشده"}
        </div>
      ) : (
        <div className="bg-surface shadow rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[1200px] lg:min-w-full divide-y divide-border">
              <thead className="bg-primary-soft">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    کد کالا
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    نام کالا
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    دسته‌بندی
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    واحد
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    وضعیت موجودی
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    حداقل موجودی
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    قیمت میانگین (ریال)
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border">
                    عملیات
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    onClick={() => openItemDetail(item.id)}
                    className={`hover:bg-primary transition-colors cursor-pointer group ${
                      index % 2 === 0 ? "bg-surface" : "bg-surface-alt"
                    }`}
                  >
                    <td className="px-4 py-3 text-sm font-mono font-medium text-center border-l border-border group-hover:text-text-inverse text-text-primary">
                      {item.code || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary text-center border-l border-border">
                      <span className="text-primary font-medium group-hover:text-text-inverse">
                        {item.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary text-center border-l border-border group-hover:text-text-inverse">
                      {item.categoryName || "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary text-center border-l border-border group-hover:text-text-inverse">
                      {item.unit}
                    </td>
                    <td className="px-4 py-3 text-center border-l border-border">
                      <StockBadge
                        current={item.currentStock || 0}
                        min={item.minStock || 0}
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary text-center border-l border-border group-hover:text-text-inverse">
                      {item.minStock || 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary text-center border-l border-border group-hover:text-text-inverse">
                      {item.avgPurchasePrice
                        ? formatPersianCurrency(item.avgPurchasePrice)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openItemDetail(item.id);
                          }}
                          className="p-2 rounded-lg bg-primary-soft text-primary hover:opacity-80 transition-colors"
                          title="مشاهده جزئیات"
                        >
                          <EyeIcon className="size-5.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openItemEdit(item.id);
                          }}
                          className="p-2 rounded-lg bg-success-soft text-success hover:opacity-80 transition-colors"
                          title="ویرایش"
                        >
                          <PencilSquareIcon className="size-5.5" />
                        </button>
                        {isAtLeast("admin") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(item);
                            }}
                            className="p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors cursor-pointer"
                            title="حذف"
                          >
                            <TrashIcon className="size-5.5" />
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
            if (!deleteTarget) return;
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
            toast.error(errorText(error, "خطا در حذف کالا"));
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
      {showCategoryModal && (
        <CategoryManageModal
          isOpen={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          onSuccess={() =>
            fetchItems(
              debouncedSearch,
              selectedCategory,
              showLowStockOnly,
              page,
              limit,
            )
          }
        />
      )}
    </div>
  );
}
