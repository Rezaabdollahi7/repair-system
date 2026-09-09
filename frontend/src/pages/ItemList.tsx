import { useEffect, useState, useCallback, useRef } from "react";
import { getItems, deleteItem, getCategories, searchItems } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { useModal } from "../context/ModalContext";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import CategoryManageModal from "../components/CategoryManageModal";
import { motion } from "framer-motion";

import {
  FolderPlusIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  CubeIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 18px is a disc. */
import {
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import StockStatusBadge from "../components/StockStatusBadge";
import { formatPersianCurrency, toPersianDigits } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import { staggerContainer, staggerItem } from "../motion";
import { STOCK_STATUSES, stockStatusOf } from "../utils/stockStatus";
import type { StockStatusKey } from "../utils/stockStatus";
import {
  actionDelete,
  actionEdit,
  actionView,
  primaryButton,
  rowCard,
  searchField,
  searchIcon,
  secondaryButton,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  toolbarSelect,
  trClickable,
} from "../utils/tableClasses";
import type { Category, Item, QueryParams } from "../types/api";

/** Mirrors the table and the phone cards so the page does not jump. */
function ItemListSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[2, 5, 3, 2, 3, 3].map((span, cell) => (
              <div
                key={cell}
                className="h-4 rounded-field bg-surface-alt"
                style={{ flexGrow: span, flexBasis: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="lg:hidden space-y-3">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="h-28 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );
}

export default function ItemList() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [stockFilter, setStockFilter] = useState<StockStatusKey | "">("");

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
      stock: StockStatusKey | "",
      currentPage: number,
      currentLimit: number,
    ) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (categoryId) params.categoryId = categoryId;
        /*
         * Sent to the server rather than applied to the rows that come back.
         * This page used to filter its own page after fetching it, so asking
         * for low-stock items showed only the low-stock rows that happened to
         * land on page one, under a total that counted the whole catalogue.
         * The items endpoint takes a `stock` bucket now.
         */
        if (stock) params.stock = stock;

        const res = searchTerm
          ? await searchItems({ ...params, q: searchTerm })
          : await getItems(params);

        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
        setItems(res.data.data);
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
      stockFilter,
      page,
      limit,
    );
  }, [debouncedSearch, selectedCategory, stockFilter, page, limit, fetchItems]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch, selectedCategory, stockFilter]);

  useEffect(() => {
    refreshList(() => {
      void fetchItems(
        debouncedSearch,
        selectedCategory,
        stockFilter,
        page,
        limit,
      );
    });
  }, [
    refreshList,
    fetchItems,
    debouncedSearch,
    selectedCategory,
    stockFilter,
    page,
    limit,
  ]);

  const filtering =
    debouncedSearch !== "" || selectedCategory !== "" || stockFilter !== "";

  const handleClearFilters = () => {
    setSearchInput("");
    setSelectedCategory("");
    setStockFilter("");
    setPage(1);
  };

  /** Row actions, shared by the table row and the phone card. */

  const rowActions = (item: Item) => (
    <div className="flex gap-1 justify-end items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          openItemDetail(item.id);
        }}
        className={actionView}
        title="مشاهده جزئیات"
      >
        <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openItemEdit(item.id);
        }}
        className={actionEdit}
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
          className={actionDelete}
          title="حذف"
        >
          <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
    </div>
  );

  return (
    <div dir="rtl">
      <header className="mb-5">
        {/*
          The three stock buckets, worst first.
          -----------------------------------------------------------------
          They replace a «فقط کالاهای کم‌موجود» checkbox that meant low *and*
          empty at once. Split, because those are two different jobs — an
          empty item cannot be sold today, a low one needs ordering this week
          — and because that is how the badge on each row already reads.

          Single-select: the buckets are mutually exclusive, so a shop asking
          for two of them at once is really asking «what needs restocking»,
          which is what the stock report answers.
        */}
        <div
          className="flex gap-2 mt-4 overflow-x-auto pb-1
                     sm:flex-wrap sm:overflow-x-visible sm:pb-0"
          role="group"
          aria-label="فیلتر وضعیت موجودی"
        >
          <button
            onClick={() => setStockFilter("")}
            aria-pressed={stockFilter === ""}
            className={`shrink-0 px-3 py-1.5 rounded-pill text-body-xs font-bold border
                        transition-colors cursor-pointer ${
                          stockFilter === ""
                            ? "bg-primary text-primary-fg border-primary"
                            : "bg-surface text-text-secondary border-border hover:border-border-strong"
                        }`}
          >
            همه
          </button>
          {STOCK_STATUSES.map((status) => {
            const active = stockFilter === status.key;
            return (
              <button
                key={status.key}
                onClick={() => setStockFilter(active ? "" : status.key)}
                aria-pressed={active}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill
                            text-body-xs font-bold border transition-colors cursor-pointer
                            ${
                              active
                                ? "text-text-primary"
                                : "bg-surface text-text-secondary border-border hover:border-border-strong"
                            }`}
                style={
                  active
                    ? {
                        backgroundColor: `color-mix(in oklab, ${status.color} 16%, var(--surface))`,
                        borderColor: `color-mix(in oklab, ${status.color} 55%, var(--surface))`,
                      }
                    : undefined
                }
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: status.color }}
                  aria-hidden="true"
                />
                {status.label}
              </button>
            );
          })}
        </div>
      </header>

      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در کد، نام یا توضیحات…"
            aria-label="جستجوی کالا"
            className={searchField}
          />
        </div>

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          aria-label="دسته‌بندی"
          className={toolbarSelect}
        >
          <option value="">همه دسته‌بندی‌ها</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <div className={toolbarActions}>
          <button
            onClick={() => setShowCategoryModal(true)}
            className={secondaryButton}
          >
            <FolderPlusIcon className="w-[1.15rem] h-[1.15rem] text-text-secondary" />
            دسته‌بندی‌ها
          </button>
          <button onClick={() => openItemEdit(null)} className={primaryButton}>
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            کالای جدید
          </button>
        </div>
      </div>

      {loading ? (
        <ItemListSkeleton />
      ) : items.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <CubeIcon className="w-7 h-7 text-text-muted" aria-hidden="true" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {filtering ? "نتیجه‌ای یافت نشد" : "هنوز کالایی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {filtering
              ? "این ترکیب فیلترها چیزی برنگرداند. یکی از آن‌ها را بردارید."
              : "قطعاتی که در انبار دارید را اینجا اضافه کنید."}
          </p>
          {filtering ? (
            <button
              onClick={handleClearFilters}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو و فیلترها
            </button>
          ) : (
            <button
              onClick={() => openItemEdit(null)}
              className={`${primaryButton} mt-5 flex-none`}
            >
              <PlusIcon
                className="w-[1.15rem] h-[1.15rem]"
                aria-hidden="true"
              />
              کالای جدید
            </button>
          )}
        </div>
      ) : (
        <>
          {/*
            Below lg the table becomes one card per item. Eight columns need
            940px, which this page used to ask a phone to scroll sideways
            through — it was the only list left without a card layout.
          */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {items.map((item) => {
              const status = stockStatusOf(
                item.currentStock || 0,
                item.minStock || 0,
              );
              return (
                <motion.li key={item.id} variants={staggerItem}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => openItemDetail(item.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openItemDetail(item.id);
                      }
                    }}
                    className={`${rowCard} cursor-pointer hover:border-border-strong
                                relative overflow-hidden ps-5`}
                  >
                    {/* The stock state as a rule down the leading edge, so a
                        stack of cards can be skimmed for what has run out. */}
                    <span
                      className="absolute inset-y-0 start-0 w-1.5"
                      style={{ backgroundColor: status.color }}
                      aria-hidden="true"
                    />
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-body-sm font-bold text-text-primary truncate">
                          {item.name}
                        </p>
                        <p className="text-body-xs text-text-muted">
                          {item.categoryName || "بدون دسته‌بندی"}
                        </p>
                      </div>
                      <span
                        className="text-body-xs text-text-muted shrink-0 tabular-nums"
                        dir="ltr"
                      >
                        {item.code || "—"}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <StockStatusBadge
                        status={status}
                        quantity={item.currentStock || 0}
                        unit={item.unit}
                      />
                      <span className="text-body-xs text-text-muted">
                        حداقل {toPersianDigits(item.minStock || 0)} {item.unit}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t border-border-subtle">
                      <span className="text-body-xs text-text-muted tabular-nums">
                        {item.avgPurchasePrice
                          ? `میانگین خرید ${formatPersianCurrency(item.avgPurchasePrice)} ریال`
                          : "قیمت خریدی ثبت نشده"}
                      </span>
                      {rowActions(item)}
                    </div>
                  </div>
                </motion.li>
              );
            })}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[1000px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>کد کالا</th>
                    <th className={th}>نام کالا</th>
                    <th className={th}>دسته‌بندی</th>
                    <th className={th}>موجودی</th>
                    <th className={th}>حداقل</th>
                    <th className={th}>قیمت میانگین (ریال)</th>
                    <th className={th}>عملیات</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {items.map((item) => {
                    const status = stockStatusOf(
                      item.currentStock || 0,
                      item.minStock || 0,
                    );
                    return (
                      <tr
                        key={item.id}
                        onClick={() => openItemDetail(item.id)}
                        className={trClickable}
                      >
                        {/* The stock state as a rule down the row's leading
                            edge, the same signal the badge carries in words. */}
                        <td
                          className={`${td} tabular-nums`}
                          dir="ltr"
                          style={{
                            boxShadow: `inset -3px 0 0 0 ${status.color}`,
                          }}
                        >
                          {item.code || "—"}
                        </td>
                        <td className={`${td} font-bold text-primary`}>
                          {item.name}
                        </td>
                        <td className={tdMuted}>{item.categoryName || "—"}</td>
                        {/*
                          The count and its state in one cell. They used to be
                          two columns apart — «کم‌موجود» in one and the number
                          in another — and the whole question on this page is
                          "how many, and is that enough".
                        */}
                        <td className="px-3 py-3 text-center">
                          <StockStatusBadge
                            status={status}
                            quantity={item.currentStock || 0}
                            unit={item.unit}
                          />
                        </td>
                        <td className={`${tdMuted} tabular-nums`}>
                          {toPersianDigits(item.minStock || 0)} {item.unit}
                        </td>
                        <td className={`${tdMuted} tabular-nums`}>
                          {item.avgPurchasePrice
                            ? formatPersianCurrency(item.avgPurchasePrice)
                            : "—"}
                        </td>
                        <td className="px-3 py-3">{rowActions(item)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
              stockFilter,
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
              stockFilter,
              page,
              limit,
            )
          }
        />
      )}
    </div>
  );
}
