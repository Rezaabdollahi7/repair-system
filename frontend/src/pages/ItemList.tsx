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
import { formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import {
  badge,
  iconButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  trClickable,
} from "../utils/tableClasses";
import type { Category, Item, QueryParams } from "../types/api";

function StockBadge({ current, min }: { current: number; min: number }) {
  if (current === 0) {
    return (
      <span className={`${badge} bg-danger-soft text-danger-fg`}>
        اتمام موجودی
      </span>
    );
  }
  if (current <= min) {
    return (
      <span className={`${badge} bg-warning-soft text-warning-fg`}>
        کم‌موجود ({toPersianDigits(current)})
      </span>
    );
  }
  return (
    <span className={`${badge} bg-success-soft text-success-fg`}>
      موجود ({toPersianDigits(current)})
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
      <div className="flex flex-col sm:flex-row sm:justify-end items-start sm:items-center gap-3 mb-4">
        <div className="flex gap-2 w-full sm:w-auto">
          <button
            onClick={() => setShowCategoryModal(true)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-field border border-border
                       bg-surface text-text-primary text-body-sm font-bold
                       hover:bg-surface-alt hover:border-border-strong transition-colors
                       flex items-center justify-center gap-2 cursor-pointer"
          >
            <FolderPlusIcon className="w-[1.15rem] h-[1.15rem] text-text-secondary" />
            دسته‌بندی‌ها
          </button>
          <button
            onClick={() => openItemEdit(null)}
            className="flex-1 sm:flex-none px-4 py-2.5 rounded-field bg-primary text-primary-fg
                       text-body-sm font-bold shadow-primary hover:bg-primary-hover
                       transition-colors flex items-center justify-center gap-2 cursor-pointer"
          >
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            کالای جدید
          </button>
        </div>
      </div>

      <div className="mb-4 space-y-3">
        <div className="relative">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-3.5 w-[1.15rem] h-[1.15rem] text-text-muted" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در کد، نام یا توضیحات…"
            aria-label="جستجوی کالا"
            className="w-full bg-surface text-text-primary placeholder:text-text-muted text-body-sm
                       border border-border rounded-field py-2.5 pr-11 pl-3.5
                       hover:border-border-strong focus:outline-none focus:border-primary
                       focus:shadow-[0_0_0_3px_var(--primary-soft)]
                       transition-[border-color,box-shadow] duration-150"
          />
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="دسته‌بندی"
            className="border border-border rounded-field px-3 py-2.5 text-body-sm bg-surface
                       text-text-primary hover:border-border-strong focus:outline-none
                       focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]
                       transition-[border-color,box-shadow] cursor-pointer"
          >
            <option value="">همه دسته‌بندی‌ها</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <label className="flex items-center gap-2 cursor-pointer text-body-sm text-text-primary">
            <input
              type="checkbox"
              checked={showLowStockOnly}
              onChange={(e) => setShowLowStockOnly(e.target.checked)}
              className="w-4 h-4 accent-[var(--primary)] cursor-pointer"
            />
            فقط کالاهای کم‌موجود
          </label>

          {(searchInput || selectedCategory || showLowStockOnly) && (
            <button
              onClick={handleClearFilters}
              className="text-body-sm text-text-secondary hover:text-primary transition-colors cursor-pointer"
            >
              پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <span className="w-14 h-14 rounded-card bg-surface-alt flex items-center justify-center mb-4">
            <CubeIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput || selectedCategory || showLowStockOnly
              ? "نتیجه‌ای یافت نشد"
              : "هنوز کالایی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput || selectedCategory || showLowStockOnly
              ? "فیلترها را بردارید یا عبارت دیگری را امتحان کنید."
              : "قطعاتی که در انبار دارید را اینجا اضافه کنید."}
          </p>
        </div>
      ) : (
        <div className={tableCard}>
          <div className={tableScroll}>
            <table className="min-w-[940px] w-full">
              <thead className={thead}>
                <tr>
                  <th className={th}>کد کالا</th>
                  <th className={th}>نام کالا</th>
                  <th className={th}>دسته‌بندی</th>
                  <th className={th}>واحد</th>
                  <th className={th}>وضعیت موجودی</th>
                  <th className={th}>حداقل موجودی</th>
                  <th className={th}>قیمت میانگین (ریال)</th>
                  <th className={th}>عملیات</th>
                </tr>
              </thead>
              <tbody className={tbody}>
                {items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => openItemDetail(item.id)}
                    className={trClickable}
                  >
                    <td className={`${td} tabular-nums`} dir="ltr">
                      {item.code || "—"}
                    </td>
                    <td className={`${td} font-bold text-primary`}>
                      {item.name}
                    </td>
                    <td className={tdMuted}>{item.categoryName || "—"}</td>
                    <td className={tdMuted}>{item.unit}</td>
                    <td className="px-3 py-3 text-center">
                      <StockBadge
                        current={item.currentStock || 0}
                        min={item.minStock || 0}
                      />
                    </td>
                    <td className={`${tdMuted} tabular-nums`}>
                      {toPersianDigits(item.minStock || 0)}
                    </td>
                    <td className={`${tdMuted} tabular-nums`}>
                      {item.avgPurchasePrice
                        ? formatPersianCurrency(item.avgPurchasePrice)
                        : "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1.5 justify-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openItemDetail(item.id);
                          }}
                          className={`${iconButton} bg-primary-soft text-primary`}
                          title="مشاهده جزئیات"
                        >
                          <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openItemEdit(item.id);
                          }}
                          className={`${iconButton} bg-surface-alt text-text-secondary`}
                          title="ویرایش"
                        >
                          <PencilSquareIcon className="w-[1.15rem] h-[1.15rem]" />
                        </button>
                        {isAtLeast("admin") && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteTarget(item);
                            }}
                            className={`${iconButton} bg-danger-soft text-danger-fg`}
                            title="حذف"
                          >
                            <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
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
