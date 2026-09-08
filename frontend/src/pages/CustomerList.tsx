import { useEffect, useState, useCallback, useRef } from "react";
import { getCustomers, deleteCustomer } from "../api";
import Pagination from "../components/Pagination";
import ConfirmModal from "../components/ConfirmModal";
import { formatPersianPhone } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import { motion } from "framer-motion";
import {
  TrashIcon,
  EyeIcon,
  PencilSquareIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  UsersIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import { toPersianDigits } from "../utils/formatters";
import { staggerContainer, staggerItem } from "../motion";
import {
  badge,
  iconButton,
  rowCard,
  tableCard,
  tableScroll,
  tbody,
  td,
  tdMuted,
  th,
  thead,
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

  const { openCustomerDetail, openCustomerEdit, refreshList } = useModal();
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
  /** Row actions, shared by the table row and the phone card. */
  const rowActions = (c: CustomerListRow) => (
    <div className="flex gap-1.5 justify-end">
      <button
        onClick={(e) => {
          e.stopPropagation();
          openCustomerDetail(c.id);
        }}
        className={`${iconButton} bg-primary-soft text-primary`}
        title="مشاهده جزئیات"
      >
        <EyeIcon className="w-[1.15rem] h-[1.15rem]" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          openCustomerEdit(c.id);
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
            setDeleteTarget(c);
          }}
          className={`${iconButton} bg-danger-soft text-danger-fg`}
          title="حذف"
        >
          <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
    </div>
  );

  return (
    <div dir="rtl">
      <div className="flex justify-end items-center mb-4">
        <button
          onClick={() => openCustomerEdit(null)}
          className="w-full sm:w-auto px-4 py-2.5 rounded-field bg-primary text-primary-fg
                     text-body-sm font-bold shadow-primary hover:bg-primary-hover
                     transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
          افزودن مشتری
        </button>
      </div>

      <div className="mb-4 relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 -translate-y-1/2 right-3.5 w-[1.15rem] h-[1.15rem] text-text-muted" />
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="جستجو بر اساس نام یا شماره تماس…"
          aria-label="جستجوی مشتری"
          className="w-full bg-surface text-text-primary placeholder:text-text-muted text-body-sm
                     border border-border rounded-field py-2.5 pr-11 pl-3.5
                     hover:border-border-strong focus:outline-none focus:border-primary
                     focus:shadow-[0_0_0_3px_var(--primary-soft)]
                     transition-[border-color,box-shadow] duration-150"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" />
        </div>
      ) : customers.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <span className="w-14 h-14 rounded-card bg-surface-alt flex items-center justify-center mb-4">
            <UsersIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput ? "نتیجه‌ای یافت نشد" : "هنوز مشتری‌ای ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput
              ? `چیزی با «${searchInput}» پیدا نشد. عبارت دیگری را امتحان کنید.`
              : "با ثبت اولین دستگاه، مشتری‌اش هم اینجا ساخته می‌شود."}
          </p>
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
                  onClick={() => openCustomerDetail(c.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openCustomerDetail(c.id);
                    }
                  }}
                  className={`${rowCard} cursor-pointer hover:border-primary-border`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-body-sm font-bold text-primary truncate">
                        {c.name}
                      </p>
                      <p className="text-body-xs text-text-secondary" dir="ltr">
                        {formatPersianPhone(c.phone)}
                      </p>
                    </div>
                    <span className={`${badge} bg-primary-soft text-primary shrink-0`}>
                      {toPersianDigits(c.device_count ?? 0)} دستگاه
                    </span>
                  </div>
                  <div className="flex justify-end mt-3 pt-3 border-t border-border">
                    {rowActions(c)}
                  </div>
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden sm:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[560px] w-full">
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
                      onClick={() => openCustomerDetail(c.id)}
                      className={trClickable}
                    >
                      <td className={`${td} font-bold text-primary`}>{c.name}</td>
                      <td className={`${tdMuted} tabular-nums`} dir="ltr">
                        {formatPersianPhone(c.phone)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span className={`${badge} bg-primary-soft text-primary`}>
                          {toPersianDigits(c.device_count ?? 0)} دستگاه
                        </span>
                      </td>
                      <td className="px-3 py-3">{rowActions(c)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
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
