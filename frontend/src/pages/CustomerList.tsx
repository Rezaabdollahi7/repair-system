import { useEffect, useState, useCallback, useRef } from "react";
import { getCustomers, deleteCustomer } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { formatPersianPhone } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { useGoToCustomer } from "../utils/navigation";
import { motion } from "framer-motion";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 18px is a disc. */
import {
  TrashIcon,
  EyeIcon,
  PencilSquareIcon,
} from "@heroicons/react/24/outline";
import { toPersianDigits } from "../utils/formatters";
import { staggerContainer, staggerItem } from "../motion";
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
  tdActions,
  tdBare,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  trClickable,
} from "../utils/tableClasses";
import type { CustomerListRow, QueryParams } from "../types/api";

export default function CustomerList() {
  const [customers, setCustomers] = useState<CustomerListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  const [deleteTarget, setDeleteTarget] = useState<CustomerListRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const { openCustomerEdit, refreshList } = useModal();
  const goToCustomer = useGoToCustomer();
  const { isAtLeast } = useAuth();
  const debouncedSearch = useDebounce(searchInput);

  const fetchCustomers = useCallback(
    async (search: string, currentPage: number, currentLimit: number) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (search) params.search = search;

        const res = await getCustomers(params);
        setCustomers(res.data.data);
        setTotal(res.data.total);
        setTotalPages(res.data.totalPages);
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
    void fetchCustomers(debouncedSearch, page, limit);
  }, [debouncedSearch, page, limit, fetchCustomers]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  // Lets a modal refresh this list when the last of them closes.
  useEffect(() => {
    refreshList(() => {
      void fetchCustomers(debouncedSearch, page, limit);
    });
  }, [refreshList, fetchCustomers, debouncedSearch, page, limit]);
  /*
   * Row actions, shared by the table row and the phone card. Neutral until
   * hovered: a tinted square each put three colours in the last column of a
   * four-column table, which was most of the colour on the page.
   */

  const rowActions = (c: CustomerListRow) => (
    <div className="flex gap-1 justify-end items-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          goToCustomer(c.id);
        }}
        className={actionView}
        title="مشاهده جزئیات"
      >
        <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openCustomerEdit(c.id);
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
            setDeleteTarget(c);
          }}
          className={actionDelete}
          title="حذف"
        >
          <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
    </div>
  );

  /**
   * How many devices this customer has brought in.
   *
   * A count, not a state, so it stays neutral — and it is the only thing on
   * the row besides the name and the number, which is why it earns a chip at
   * all rather than a bare figure in a column.
   */
  const deviceChip = (count: number) =>
    // No chip for a customer who has not brought anything in: a pill is
    // emphasis, and «۰ دستگاه» does not need any.
    count === 0 ? (
      <span className="text-body-xs text-text-muted">بدون دستگاه</span>
    ) : (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill
                   bg-surface-alt text-text-primary text-body-xs font-bold
                   whitespace-nowrap tabular-nums"
      >
        {toPersianDigits(count)} دستگاه
      </span>
    );

  /** Mirrors the table and the phone cards so the page does not jump. */
  const skeleton = (
    <div className="animate-pulse">
      <div className="hidden sm:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 8 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[5, 4, 2, 2].map((span, cell) => (
              <div
                key={cell}
                className="h-4 rounded-field bg-surface-alt"
                style={{ flexGrow: span, flexBasis: 0 }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="sm:hidden space-y-3">
        {[0, 1, 2, 3].map((card) => (
          <div
            key={card}
            className="h-28 rounded-panel border border-border bg-surface"
          />
        ))}
      </div>
    </div>
  );

  return (
    <div dir="rtl">
      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو بر اساس نام یا شماره تماس…"
            aria-label="جستجوی مشتری"
            className={searchField}
          />
        </div>

        <div className={toolbarActions}>
          <button
            onClick={() => openCustomerEdit(null)}
            className={primaryButton}
          >
            <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
            افزودن مشتری
          </button>
        </div>
      </div>

      {loading ? (
        skeleton
      ) : customers.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <UsersIcon className="w-7 h-7 text-text-muted" aria-hidden="true" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput ? "نتیجه‌ای یافت نشد" : "هنوز مشتری‌ای ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {searchInput
              ? `چیزی با «${searchInput}» پیدا نشد. عبارت دیگری را امتحان کنید.`
              : "با ثبت اولین دستگاه، مشتری‌اش هم اینجا ساخته می‌شود."}
          </p>
          {searchInput ? (
            <button
              onClick={() => setSearchInput("")}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو
            </button>
          ) : (
            <button
              onClick={() => openCustomerEdit(null)}
              className={`${primaryButton} mt-5 flex-none`}
            >
              <PlusIcon
                className="w-[1.15rem] h-[1.15rem]"
                aria-hidden="true"
              />
              افزودن مشتری
            </button>
          )}
        </div>
      ) : (
        <>
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="sm:hidden space-y-3"
          >
            {customers.map((c) => (
              <motion.li key={c.id} variants={staggerItem}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => goToCustomer(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      goToCustomer(c.id);
                    }
                  }}
                  className={`${rowCard} cursor-pointer hover:border-border-strong`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-primary truncate">
                        {c.name}
                      </p>
                      <p
                        className="text-body-xs text-text-muted tabular-nums"
                        dir="ltr"
                      >
                        {formatPersianPhone(c.phone)}
                      </p>
                    </div>
                    <span className="shrink-0">
                      {deviceChip(c.device_count ?? 0)}
                    </span>
                  </div>
                  <div className="flex justify-end mt-3 pt-3 border-t border-border-subtle">
                    {rowActions(c)}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden sm:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[600px] w-full">
                <thead className={thead}>
                  <tr>
                    <th className={th}>نام</th>
                    <th className={th}>شماره تماس</th>
                    <th className={th}>تعداد دستگاه</th>
                    <th className={th}>عملیات</th>
                  </tr>
                </thead>
                <tbody className={tbody}>
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => goToCustomer(c.id)}
                      className={trClickable}
                    >
                      <td className={`${td} font-bold text-primary`}>
                        {c.name}
                      </td>
                      <td className={`${tdMuted} tabular-nums`} dir="ltr">
                        {formatPersianPhone(c.phone)}
                      </td>
                      <td className={tdBare}>
                        {deviceChip(c.device_count ?? 0)}
                      </td>
                      <td className={tdActions}>{rowActions(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && customers.length > 0 && (
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
