import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { getPersonnel, deletePersonnel, togglePersonnelActive } from "../api";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import { formatPersianPhone } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";
import {
  badge,
  iconButton,
  primaryButton,
  searchField,
  searchIcon,
  tableCard,
  tableScroll,
  tbody,
  tdMuted,
  th,
  thead,
  toolbar,
  toolbarActions,
  toolbarSearch,
  tr,
} from "../utils/tableClasses";
import type { Personnel, QueryParams } from "../types/api";

export default function PersonnelList() {
  const { user, isAtLeast } = useAuth();
  const { openPersonnelEdit, refreshList } = useModal();
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Personnel | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<Personnel | null>(null);
  const [toggling, setToggling] = useState(false);
  const debouncedSearch = useDebounce(searchInput);

  const canManage = isAtLeast("admin");
  const canDelete = user?.role === "super_admin";

  const fetchPersonnel = useCallback(
    async (search: string, currentPage: number, currentLimit: number) => {
      setLoading(true);
      try {
        const params: QueryParams = { page: currentPage, limit: currentLimit };
        if (search) params.search = search;
        const res = await getPersonnel(params);

        // This endpoint is not paginated: it answers with the whole list and
        // ignores page and limit. The controls below therefore show a single
        // page, which is what they have always done.
        setPersonnel(res.data);
        setTotal(res.data.length);
        setTotalPages(1);
      } catch {
        toast.error("خطا در دریافت لیست پرسنل");
        setPersonnel([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void fetchPersonnel(debouncedSearch, page, limit);
  }, [debouncedSearch, page, limit, fetchPersonnel]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    refreshList(() => {
      void fetchPersonnel(debouncedSearch, page, limit);
    });
  }, [refreshList, fetchPersonnel, debouncedSearch, page, limit]);

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await togglePersonnelActive(toggleTarget.id);
      toast.success(`کاربر ${toggleTarget.is_active ? "غیرفعال" : "فعال"} شد`);
      setToggleTarget(null);
      void fetchPersonnel(debouncedSearch, page, limit);
    } catch {
      toast.error("خطا در تغییر وضعیت");
    } finally {
      setToggling(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deletePersonnel(deleteTarget.id);
      toast.success("پرسنل حذف شد");
      setDeleteTarget(null);
      void fetchPersonnel(debouncedSearch, page, limit);
    } catch (err) {
      toast.error(errorText(err, "خطا در حذف پرسنل"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div dir="rtl">
      <div className={toolbar}>
        <div className={toolbarSearch}>
          <MagnifyingGlassIcon className={searchIcon} />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="جستجو در نام، نام کاربری، تلفن…"
            aria-label="جستجوی پرسنل"
            className={searchField}
          />
        </div>

        {canManage && (
          <div className={toolbarActions}>
            <button onClick={() => openPersonnelEdit(null)} className={primaryButton}>
              <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
              افزودن پرسنل
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" />
        </div>
      ) : personnel.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4">
          <span className="w-14 h-14 rounded-card bg-surface-alt flex items-center justify-center mb-4">
            <UserGroupIcon className="w-7 h-7 text-text-muted" />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput ? "نتیجه‌ای یافت نشد" : "هنوز پرسنلی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1">
            {searchInput
              ? "عبارت دیگری را امتحان کنید."
              : "همکارانتان را اضافه کنید تا بتوانند دستگاه‌ها را پیگیری کنند."}
          </p>
        </div>
      ) : (
        <div className={tableCard}>
          <div className={tableScroll}>
            <table className="min-w-[680px] w-full">
              <thead className={thead}>
                <tr>
                  <th className={th}>نام</th>
                  <th className={th}>نام کاربری</th>
                  <th className={th}>نقش</th>
                  <th className={th}>تلفن</th>
                  <th className={th}>وضعیت</th>
                  {canManage && <th className={th}>عملیات</th>}
                </tr>
              </thead>
              <tbody className={tbody}>
                {personnel.map((person) => {
                  // An admin may not edit a super admin or another admin.
                  const outranks =
                    user?.role === "admin" &&
                    (person.role_name === "super_admin" ||
                      person.role_name === "admin");

                  return (
                    <tr key={person.id} className={tr}>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2.5">
                          <span className="w-8 h-8 shrink-0 rounded-full bg-primary-soft flex items-center justify-center text-primary font-bold text-body-xs">
                            {person.full_name?.charAt(0)}
                          </span>
                          <span className="text-body-sm font-bold text-text-primary">
                            {person.full_name}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`${tdMuted} whitespace-nowrap tabular-nums`}
                        dir="ltr"
                      >
                        {person.username}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`${badge} ${
                            person.role_name === "technician"
                              ? "bg-surface-alt text-text-secondary"
                              : "bg-primary-soft text-primary"
                          }`}
                        >
                          {person.role_label}
                        </span>
                      </td>
                      <td
                        className={`${tdMuted} whitespace-nowrap tabular-nums`}
                        dir="ltr"
                      >
                        {formatPersianPhone(person.phone)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {/* Icon as well as colour: "active" and "inactive"
                            must not be a hue difference alone. */}
                        <span
                          className={`${badge} gap-1 ${
                            person.is_active
                              ? "bg-success-soft text-success-fg"
                              : "bg-danger-soft text-danger-fg"
                          }`}
                        >
                          {person.is_active ? (
                            <CheckCircleIcon className="w-3.5 h-3.5" />
                          ) : (
                            <XCircleIcon className="w-3.5 h-3.5" />
                          )}
                          {person.is_active ? "فعال" : "غیرفعال"}
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex gap-1.5 justify-center">
                            {!outranks && (
                              <button
                                onClick={() => openPersonnelEdit(person.id)}
                                className={`${iconButton} bg-surface-alt text-text-secondary`}
                                title="ویرایش"
                              >
                                <PencilSquareIcon className="w-[1.15rem] h-[1.15rem]" />
                              </button>
                            )}
                            {person.id !== user?.id && !outranks && (
                              <button
                                onClick={() => setToggleTarget(person)}
                                className={`${iconButton} ${
                                  person.is_active
                                    ? "bg-warning-soft text-warning-fg"
                                    : "bg-success-soft text-success-fg"
                                }`}
                                title={
                                  person.is_active
                                    ? "غیرفعال‌سازی"
                                    : "فعال‌سازی"
                                }
                              >
                                {person.is_active ? (
                                  <XCircleIcon className="w-[1.15rem] h-[1.15rem]" />
                                ) : (
                                  <CheckCircleIcon className="w-[1.15rem] h-[1.15rem]" />
                                )}
                              </button>
                            )}
                            {canDelete && person.id !== user?.id && (
                              <button
                                onClick={() => setDeleteTarget(person)}
                                className={`${iconButton} bg-danger-soft text-danger-fg`}
                                title="حذف"
                              >
                                <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
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
        isOpen={!!toggleTarget}
        onClose={() => setToggleTarget(null)}
        onConfirm={handleToggleActive}
        title={
          toggleTarget?.is_active ? "غیرفعال‌سازی کاربر" : "فعال‌سازی کاربر"
        }
        message={`آیا از ${toggleTarget?.is_active ? "غیرفعال" : "فعال"}سازی "${toggleTarget?.full_name}" مطمئن هستید؟`}
        confirmText={toggleTarget?.is_active ? "غیرفعال کن" : "فعال کن"}
        variant={toggleTarget?.is_active ? "warning" : "info"}
        loading={toggling}
      />

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="حذف پرسنل"
        message={`آیا از حذف "${deleteTarget?.full_name}" مطمئن هستید؟ این عملیات قابل بازگشت نیست.`}
        confirmText="حذف"
        variant="danger"
        loading={deleting}
      />
    </div>
  );
}
