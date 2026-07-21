// src/pages/PersonnelList.jsx
import { useEffect, useState, useCallback, useRef } from "react";
import toast from "react-hot-toast";
import {
  getPersonnel,
  deletePersonnel,
  togglePersonnelActive,
} from "../api/index";
import { useAuth } from "../context/AuthContext";
import { useModal } from "../context/ModalContext";
import ConfirmModal from "../components/ConfirmModal";
import Pagination from "../components/Pagination";
import { formatPersianPhone } from "../utils/formatters";
import {
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  UserGroupIcon,
  CheckCircleIcon,
  XCircleIcon,
} from "@heroicons/react/24/solid";
import LoadingSpinner from "../components/LoadingSpinner";

function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function PersonnelList() {
  const { user, isAtLeast } = useAuth();
  const { openPersonnelEdit, refreshList } = useModal();
  const [personnel, setPersonnel] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toggleTarget, setToggleTarget] = useState(null);
  const [toggling, setToggling] = useState(false);
  const debouncedSearch = useDebounce(searchInput);

  const canManage = isAtLeast("admin");
  const canDelete = user?.role === "super_admin";

  const fetchPersonnel = useCallback(
    async (search, currentPage, currentLimit) => {
      setLoading(true);
      try {
        const params = { page: currentPage, limit: currentLimit };
        if (search) params.search = search;
        const res = await getPersonnel(params);

        const api = res.data;
        if (api && typeof api === "object" && !Array.isArray(api)) {
          setPersonnel(api.data || []);
          setTotal(api.total || 0);
          setTotalPages(api.totalPages || 1);
        } else {
          setPersonnel(Array.isArray(api) ? api : []);
          setTotal(Array.isArray(api) ? api.length : 0);
          setTotalPages(1);
        }
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
    fetchPersonnel(debouncedSearch, page, limit);
  }, [debouncedSearch, page, limit, fetchPersonnel]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setPage(1);
  }, [debouncedSearch]);

  // Register refresh callback
  useEffect(() => {
    refreshList(() => {
      fetchPersonnel(debouncedSearch, page, limit);
    });
  }, [refreshList, fetchPersonnel, debouncedSearch, page, limit]);

  const handleToggleActive = async () => {
    if (!toggleTarget) return;
    setToggling(true);
    try {
      await togglePersonnelActive(toggleTarget.id);
      toast.success(`کاربر ${toggleTarget.is_active ? "غیرفعال" : "فعال"} شد`);
      setToggleTarget(null);
      fetchPersonnel(debouncedSearch, page, limit);
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
      fetchPersonnel(debouncedSearch, page, limit);
    } catch (err) {
      toast.error(err.response?.data?.error || "خطا در حذف پرسنل");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div dir="rtl">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
          <UserGroupIcon className="w-6 h-6 text-text-secondary" />
          مدیریت پرسنل
        </h1>
        {canManage && (
          <button
            onClick={() => openPersonnelEdit(null)}
            className="bg-primary text-text-inverse px-4 py-2 rounded-lg hover:bg-primary-hover flex items-center gap-2"
          >
            <PlusIcon className="w-5 h-5" />
            افزودن پرسنل
          </button>
        )}
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="جستجو در نام، نام کاربری، تلفن..."
          className="w-full border border-border rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-surface text-text-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="md" text=" دارم لود میکنم  ..." />
        </div>
      ) : personnel.length === 0 ? (
        <div className="text-center py-20 text-text-secondary">
          {searchInput ? "نتیجه‌ای یافت نشد" : "پرسنلی ثبت نشده است"}
        </div>
      ) : (
        <div className="bg-surface rounded-xl shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[700px] lg:min-w-full divide-y divide-border">
              <thead className="bg-primary-soft">
                <tr>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    نام
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    نام کاربری
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    نقش
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    تلفن
                  </th>
                  <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                    وضعیت
                  </th>
                  {canManage && (
                    <th className="px-4 py-3 text-center font-semibold text-text-primary border-b border-border border-l">
                      عملیات
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {personnel.map((person, index) => (
                  <tr
                    key={person.id}
                    className={`hover:bg-primary group transition-colors ${index % 2 === 0 ? "bg-surface" : "bg-surface-alt"}`}
                  >
                    <td className="px-4 py-3 whitespace-nowrap text-center border-l border-border">
                      <div className="flex items-center justify-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-soft flex items-center justify-center text-primary font-bold text-sm">
                          {person.full_name?.charAt(0)}
                        </div>
                        <span className="text-sm font-medium text-text-primary group-hover:text-text-inverse">
                          {person.full_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-center border-l border-border font-mono group-hover:text-text-inverse text-text-primary">
                      {person.username}
                    </td>
                    <td className="py-3 whitespace-nowrap flex items-center justify-center border-l border-border">
                      <span
                        className={`mt-2.5 px-2 py-1 text-xs font-medium rounded-full items-center justify-center ${
                          person.role_name === "super_admin"
                            ? "bg-primary-soft text-primary"
                            : person.role_name === "admin"
                              ? "bg-primary-soft text-primary"
                              : "bg-surface-alt text-text-primary"
                        }`}
                      >
                        {person.role_label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-text-secondary border-l border-border group-hover:text-text-inverse text-center">
                      {formatPersianPhone(person.phone)}
                    </td>
                    <td className="px-4 py-4.5 whitespace-nowrap border-l border-border flex items-center justify-center">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${
                          person.is_active
                            ? "bg-success-soft text-success"
                            : "bg-danger-soft text-danger"
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
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex gap-1 justify-center">
                          {!(
                            user?.role === "admin" &&
                            (person.role_name === "super_admin" ||
                              person.role_name === "admin")
                          ) && (
                            <button
                              onClick={() => openPersonnelEdit(person.id)}
                              className="p-2 rounded-lg bg-success-soft text-success hover:opacity-80 transition-colors"
                              title="ویرایش"
                            >
                              <PencilSquareIcon className="size-5.5" />
                            </button>
                          )}
                          {person.id !== user?.id &&
                            !(
                              user?.role === "admin" &&
                              (person.role_name === "super_admin" ||
                                person.role_name === "admin")
                            ) && (
                              <button
                                onClick={() => setToggleTarget(person)}
                                className={`p-2 rounded-lg transition-colors ${person.is_active ? "bg-warning-soft text-warning hover:opacity-80" : "bg-success-soft text-success hover:opacity-80"}`}
                                title={
                                  person.is_active
                                    ? "غیرفعال‌سازی"
                                    : "فعال‌سازی"
                                }
                              >
                                {person.is_active ? (
                                  <XCircleIcon className="size-5.5" />
                                ) : (
                                  <CheckCircleIcon className="size-5.5" />
                                )}
                              </button>
                            )}
                          {canDelete && person.id !== user?.id && (
                            <button
                              onClick={() => setDeleteTarget(person)}
                              className="p-2 rounded-lg bg-danger-soft text-danger hover:opacity-80 transition-colors cursor-pointer"
                              title="حذف"
                            >
                              <TrashIcon className="size-5.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
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
