import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import { getPersonnel, deletePersonnel, togglePersonnelActive } from "../api";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import { formatPersianPhone, toPersianDigits } from "../utils/formatters";
import { useDebounce } from "../utils/helpers";
import { errorText } from "../utils/errors";
import { motion } from "framer-motion";
import {
  PlusIcon,
  MagnifyingGlassIcon,
  UserGroupIcon,
} from "@heroicons/react/24/solid";
/* Outline for the row's own controls — a solid heroicon at 18px is a disc. */
import {
  PencilSquareIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";
/* Solid for the two badges, where the glyph is a 14px mark not a control. */
import {
  CheckCircleIcon as CheckCircleSolid,
  XCircleIcon as XCircleSolid,
} from "@heroicons/react/24/solid";
import StatusPill from "../components/StatusPill";
import { roleStyleOf } from "../utils/roleStatus";
import { staggerContainer, staggerItem } from "../motion";
import {
  actionConfirm,
  actionDelete,
  actionEdit,
  actionNeutral,
  badge,
  primaryButton,
  rowCard,
  searchField,
  searchIcon,
  secondaryButton,
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

  /**
   * An admin may not act on a super admin or another admin.
   *
   * Hoisted out of the table body so the phone cards apply the same rule
   * rather than re-deriving it — two copies of a permission check is one too
   * many.
   */
  const outranks = (person: Personnel) =>
    user?.role === "admin" &&
    (person.role_name === "super_admin" || person.role_name === "admin");

  const roleBadge = (person: Personnel) => {
    const { color, tone } = roleStyleOf(person.role_name);
    return (
      <StatusPill
        label={person.role_label}
        color={color}
        tone={tone}
        size="sm"
      />
    );
  };

  /* Icon as well as colour: "active" and "inactive" must not be a hue
     difference alone. */
  const activeBadge = (person: Personnel) => (
    <span
      className={`${badge} gap-1 ${
        person.is_active
          ? "bg-success-soft text-success-fg"
          : "bg-danger-soft text-danger-fg"
      }`}
    >
      {person.is_active ? (
        <CheckCircleSolid className="w-3.5 h-3.5" />
      ) : (
        <XCircleSolid className="w-3.5 h-3.5" />
      )}
      {person.is_active ? "فعال" : "غیرفعال"}
    </span>
  );

  const avatar = (person: Personnel) => (
    <span
      className="w-8 h-8 shrink-0 rounded-full bg-surface-sunken flex items-center
                 justify-center text-text-secondary font-bold text-body-xs"
      aria-hidden="true"
    >
      {person.full_name?.charAt(0)}
    </span>
  );

  /*
   * Row actions, shared by the table row and the phone card.
   *
   * Neutral until hovered. The activate/deactivate button used to be tinted
   * amber or green by the state it would *leave*, which read as the state the
   * person is in — and that is already the «وضعیت» column's job, two cells
   * over, saying the opposite thing.
   */

  const rowActions = (person: Personnel) => (
    <div className="flex gap-1 justify-end items-center">
      {!outranks(person) && (
        <button
          onClick={() => openPersonnelEdit(person.id)}
          className={actionEdit}
          title="ویرایش"
        >
          <PencilSquareIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
      {person.id !== user?.id && !outranks(person) && (
        <button
          onClick={() => setToggleTarget(person)}
          /* The toggle wears the colour of the state it moves to, not of
             the button: switching someone off is the quiet, reversible one,
             and switching them back on is the affirmative. */
          className={person.is_active ? actionNeutral : actionConfirm}
          title={person.is_active ? "غیرفعال‌سازی" : "فعال‌سازی"}
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
          className={actionDelete}
          title="حذف"
        >
          <TrashIcon className="w-[1.15rem] h-[1.15rem]" />
        </button>
      )}
    </div>
  );

  /** Mirrors the table and the phone cards so the page does not jump. */
  const skeleton = (
    <div className="animate-pulse">
      <div className="hidden lg:block bg-surface border border-border rounded-panel p-5">
        <div className="h-4 w-full rounded-field bg-surface-alt mb-5" />
        {Array.from({ length: 6 }, (_, row) => (
          <div key={row} className="flex gap-3 mb-4">
            {[4, 3, 2, 3, 2, 2].map((span, cell) => (
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
            <button
              onClick={() => openPersonnelEdit(null)}
              className={primaryButton}
            >
              <PlusIcon className="w-[1.15rem] h-[1.15rem]" />
              افزودن پرسنل
            </button>
          </div>
        )}
      </div>

      {loading ? (
        skeleton
      ) : personnel.length === 0 ? (
        <div className="bg-surface border border-border rounded-panel flex flex-col items-center justify-center text-center py-16 px-4">
          <span className="w-14 h-14 rounded-panel bg-surface-alt flex items-center justify-center mb-4">
            <UserGroupIcon
              className="w-7 h-7 text-text-muted"
              aria-hidden="true"
            />
          </span>
          <p className="text-body-md font-bold text-text-primary">
            {searchInput ? "نتیجه‌ای یافت نشد" : "هنوز پرسنلی ثبت نشده"}
          </p>
          <p className="text-body-sm text-text-secondary mt-1 max-w-sm">
            {searchInput
              ? "عبارت دیگری را امتحان کنید."
              : "همکارانتان را اضافه کنید تا بتوانند دستگاه‌ها را پیگیری کنند."}
          </p>
          {searchInput ? (
            <button
              onClick={() => setSearchInput("")}
              className={`${secondaryButton} mt-5 flex-none`}
            >
              پاک‌کردن جستجو
            </button>
          ) : (
            canManage && (
              <button
                onClick={() => openPersonnelEdit(null)}
                className={`${primaryButton} mt-5 flex-none`}
              >
                <PlusIcon
                  className="w-[1.15rem] h-[1.15rem]"
                  aria-hidden="true"
                />
                افزودن پرسنل
              </button>
            )
          )}
        </div>
      ) : (
        <>
          {/*
            Below lg the table becomes one card per person. Six columns needed
            680px, and this page had no card layout at all — a phone had to be
            dragged sideways to see who was active.
          */}
          <motion.ul
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="lg:hidden space-y-3"
          >
            {personnel.map((person) => (
              <motion.li key={person.id} variants={staggerItem}>
                <div className={rowCard}>
                  <div className="flex items-start gap-3">
                    {avatar(person)}
                    <div className="min-w-0 flex-1">
                      <p className="text-body-sm font-bold text-text-primary truncate">
                        {person.full_name}
                      </p>
                      <p
                        className="text-body-xs text-text-muted tabular-nums"
                        dir="ltr"
                      >
                        {toPersianDigits(person.username)}
                      </p>
                    </div>
                    {activeBadge(person)}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {roleBadge(person)}
                    {person.phone && (
                      <span
                        className="text-body-xs text-text-muted tabular-nums"
                        dir="ltr"
                      >
                        {formatPersianPhone(person.phone)}
                      </span>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex justify-end mt-3 pt-3 border-t border-border-subtle">
                      {rowActions(person)}
                    </div>
                  )}
                </div>
              </motion.li>
            ))}
          </motion.ul>

          <div className={`hidden lg:block ${tableCard}`}>
            <div className={tableScroll}>
              <table className="min-w-[720px] w-full">
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
                    return (
                      <tr key={person.id} className={tr}>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center justify-center gap-2.5">
                            {avatar(person)}
                            <span className="text-body-sm font-bold text-text-primary">
                              {person.full_name}
                            </span>
                          </div>
                        </td>
                        <td
                          className={`${tdMuted} whitespace-nowrap tabular-nums`}
                          dir="ltr"
                        >
                          {toPersianDigits(person.username)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {roleBadge(person)}
                        </td>
                        <td
                          className={`${tdMuted} whitespace-nowrap tabular-nums`}
                          dir="ltr"
                        >
                          {formatPersianPhone(person.phone)}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {activeBadge(person)}
                        </td>
                        {canManage && (
                          <td className="px-3 py-3 whitespace-nowrap">
                            {rowActions(person)}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && personnel.length > 0 && (
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
