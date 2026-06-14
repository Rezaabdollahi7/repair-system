import { useState, useRef, useEffect, useCallback } from "react";
import {
  FunnelIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  XCircleIcon,
  CheckBadgeIcon,
  DocumentCurrencyDollarIcon,
  UserGroupIcon,
  UserIcon,
  CalendarIcon,
} from "@heroicons/react/24/outline";

import PersianDatePicker from "./PersianDatePicker";
import { searchCustomers, getPersonnel } from "../api";
import { useDebounce } from "../utils/helpers";

const STATUS_OPTIONS = [
  {
    value: "pending",
    label: "در انتظار بررسی",
    color: "bg-yellow-100 text-yellow-800",
  },
  {
    value: "diagnosing",
    label: "در حال بررسی",
    color: "bg-cyan-100 text-cyan-800",
  },
  {
    value: "waiting_for_parts",
    label: "در انتظار قطعه",
    color: "bg-orange-100 text-orange-800",
  },
  {
    value: "repairing",
    label: "در حال تعمیر",
    color: "bg-purple-100 text-purple-800",
  },
  { value: "repaired", label: "تعمیر شده", color: "bg-gray-100 text-gray-800" },
  {
    value: "delivered",
    label: "تحویل داده شده",
    color: "bg-green-100 text-green-800",
  },
  {
    value: "ready_for_pickup",
    label: "آماده تحویل",
    color: "bg-blue-100 text-blue-800",
  },
  {
    value: "unrepairable",
    label: "غیرقابل تعمیر",
    color: "bg-red-100 text-red-800",
  },
  {
    value: "not_repaired",
    label: "تعمیر نشد",
    color: "bg-orange-100 text-red-800",
  },
];

const INVOICE_STATUS_OPTIONS = [
  {
    value: "no_invoice",
    label: "فاکتور ندارد",
    color: "bg-gray-100 text-gray-700",
  },
  { value: "paid", label: "پرداخت شده", color: "bg-green-100 text-green-700" },
  { value: "unpaid", label: "پرداخت نشده", color: "bg-red-100 text-red-700" },
  {
    value: "not_needed",
    label: "نیاز به فاکتور ندارد",
    color: "bg-blue-100 text-blue-700",
  },
];

export default function FilterPanel({
  filters,
  onChange,
  onClear,
  isOpen,
  onClose,
}) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [invoiceStatusDropdownOpen, setInvoiceStatusDropdownOpen] =
    useState(false);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState(false);

  const [customerSearch, setCustomerSearch] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [invoiceStatusSearch, setInvoiceStatusSearch] = useState("");

  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [searchingPersonnel, setSearchingPersonnel] = useState(false);
  const [customerResults, setCustomerResults] = useState([]);
  const [personnelResults, setPersonnelResults] = useState([]);

  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [selectedPersonnelMap, setSelectedPersonnelMap] = useState({});

  const statusRef = useRef(null);
  const invoiceStatusRef = useRef(null);
  const customerRef = useRef(null);
  const personnelRef = useRef(null);

  // ─── FIX: همیشه آخرین نسخه filters رو داریم، بدون stale closure ───
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const debouncedPersonnelSearch = useDebounce(personnelSearch, 300);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  const searchCustomersAPI = useCallback(async (query) => {
    if (!query || query.trim() === "") {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    try {
      const res = await searchCustomers(query);
      setCustomerResults(res.data?.data || res.data || []);
    } catch (error) {
      console.error("خطا در جستجوی مشتری:", error);
      setCustomerResults([]);
    } finally {
      setSearchingCustomers(false);
    }
  }, []);

  const searchPersonnelAPI = useCallback(async (query) => {
    if (!query || query.trim() === "") {
      setPersonnelResults([]);
      return;
    }
    setSearchingPersonnel(true);
    try {
      const res = await getPersonnel({ search: query, limit: 20 });
      setPersonnelResults(res.data?.data || res.data || []);
    } finally {
      setSearchingPersonnel(false);
    }
  }, []);

  useEffect(() => {
    if (filters.customer_id && !selectedCustomer) {
      searchCustomersAPI(String(filters.customer_id));
    } else if (!filters.customer_id) {
      setSelectedCustomer(null);
    }
  }, [filters.customer_id]);

  useEffect(() => {
    if (filters.customer_id && customerResults.length > 0) {
      const found = customerResults.find(
        (c) => String(c.id) === String(filters.customer_id),
      );
      if (found) setSelectedCustomer(found);
    }
  }, [customerResults, filters.customer_id]);

  useEffect(() => {
    if (filters.personnel_ids && filters.personnel_ids.length > 0) {
      const missingIds = filters.personnel_ids.filter(
        (id) => !selectedPersonnelMap[id],
      );
      if (missingIds.length > 0) {
        missingIds.forEach(async (id) => {
          try {
            const res = await getPersonnel({ search: "", limit: 200 });
            const allPersonnel = res.data?.data || res.data || [];
            const found = allPersonnel.find((p) => p.id === id);
            if (found) {
              setSelectedPersonnelMap((prev) => ({
                ...prev,
                [id]:
                  found.name ??
                  found.full_name ??
                  found.username ??
                  `مسئول #${id}`,
              }));
            }
          } catch (error) {
            console.error("خطا در دریافت اطلاعات پرسنل:", error);
          }
        });
      }
    }
  }, [filters.personnel_ids]);

  useEffect(() => {
    if (customerSearch && customerSearch.trim()) {
      searchCustomersAPI(debouncedCustomerSearch);
    } else {
      setCustomerResults([]);
    }
  }, [debouncedCustomerSearch, searchCustomersAPI]);

  useEffect(() => {
    if (personnelSearch && personnelSearch.trim()) {
      searchPersonnelAPI(debouncedPersonnelSearch);
    } else {
      setPersonnelResults([]);
    }
  }, [debouncedPersonnelSearch, searchPersonnelAPI]);

  useEffect(() => {
    function handleClickOutside(e) {
      if (statusRef.current && !statusRef.current.contains(e.target)) {
        setStatusDropdownOpen(false);
        setStatusSearch("");
      }
      if (
        invoiceStatusRef.current &&
        !invoiceStatusRef.current.contains(e.target)
      ) {
        setInvoiceStatusDropdownOpen(false);
        setInvoiceStatusSearch("");
      }
      if (customerRef.current && !customerRef.current.contains(e.target)) {
        setCustomerDropdownOpen(false);
        setCustomerSearch("");
        setCustomerResults([]);
      }
      if (personnelRef.current && !personnelRef.current.contains(e.target)) {
        setPersonnelDropdownOpen(false);
        setPersonnelSearch("");
        setPersonnelResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ─── FIX: همه toggle ها از filtersRef.current استفاده می‌کنند ───
  function toggleStatus(value) {
    const current = filtersRef.current.status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filtersRef.current, status: updated });
  }

  function toggleInvoiceStatus(value) {
    const current = filtersRef.current.invoice_status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filtersRef.current, invoice_status: updated });
  }

  function togglePersonnel(id) {
    const current = filtersRef.current.personnel_ids || [];
    const updated = current.includes(id)
      ? current.filter((p) => p !== id)
      : [...current, id];
    onChange({ ...filtersRef.current, personnel_ids: updated });

    if (current.includes(id)) {
      setSelectedPersonnelMap((prev) => {
        const newMap = { ...prev };
        delete newMap[id];
        return newMap;
      });
    }
  }

  function getStatusLabel() {
    const selected = filters.status || [];
    if (selected.length === 0) return "همه وضعیت‌ها";
    if (selected.length === 1)
      return (
        STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ||
        selected[0]
      );
    return `${selected.length} وضعیت انتخاب شده`;
  }

  function getInvoiceStatusLabel() {
    const selected = filters.invoice_status || [];
    if (selected.length === 0) return "همه وضعیت‌های فاکتور";
    if (selected.length === 1)
      return (
        INVOICE_STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ||
        selected[0]
      );
    return `${selected.length} وضعیت فاکتور انتخاب شده`;
  }

  function getCustomerLabel() {
    if (!filters.customer_id) return "همه مشتریان";
    if (selectedCustomer)
      return `${selectedCustomer.name}${selectedCustomer.phone ? ` - ${selectedCustomer.phone}` : ""}`;
    return `مشتری #${filters.customer_id}`;
  }

  function getPersonnelLabel() {
    const selected = filters.personnel_ids || [];
    if (selected.length === 0) return "همه مسئولان";
    if (selected.length === 1) {
      const name = selectedPersonnelMap[selected[0]];
      return name || `مسئول #${selected[0]}`;
    }
    return `${selected.length} مسئول انتخاب شده`;
  }

  const filteredStatuses = STATUS_OPTIONS.filter((o) =>
    o.label.includes(statusSearch),
  );

  const filteredInvoiceStatuses = INVOICE_STATUS_OPTIONS.filter((o) =>
    o.label.includes(invoiceStatusSearch),
  );

  const dropdownBtnClass =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-right flex justify-between items-center hover:border-green-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all";

  const SearchInput = ({
    value,
    onChange: onChangeFn,
    placeholder = "جستجو...",
  }) => (
    <div className="p-2 border-b border-gray-100 relative">
      <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChangeFn}
        className="w-full text-sm pr-8 pl-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        autoFocus
      />
    </div>
  );

  const SectionTitle = ({ icon: Icon, title }) => (
    <div className="flex items-center gap-2 mb-2 border-gray-200">
      <Icon className="size-6 text-green-600" />
      <span className="text-sm font-semibold text-gray-700">{title}</span>
    </div>
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-2 sm:my-8 animate-in fade-in zoom-in duration-200"
        dir="rtl"
      >
        {/* هدر */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-gray-200 px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-xl">
              <FunnelIcon className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">
                فیلترهای پیشرفته
              </h2>
              {activeCount > 0 && (
                <p className="text-xs text-gray-500 mt-0.5">
                  {activeCount} فیلتر فعال
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {activeCount > 0 && (
              <button
                onClick={onClear}
                className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <XMarkIcon className="w-4 h-4" />
                پاک کردن همه
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* محتوا */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* ستون راست */}
            <div className="space-y-8">
              {/* وضعیت دستگاه */}
              <div>
                <SectionTitle icon={CheckBadgeIcon} title="وضعیت دستگاه" />
                <div ref={statusRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setStatusDropdownOpen((p) => !p)}
                    className={dropdownBtnClass}
                  >
                    <span
                      className={
                        filters.status?.length > 0
                          ? "text-gray-800 font-medium"
                          : "text-gray-400"
                      }
                    >
                      {getStatusLabel()}
                    </span>
                    {statusDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {statusDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={statusSearch}
                        onChange={(e) => setStatusSearch(e.target.value)}
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {/* ─── FIX: از filtersRef.current استفاده می‌شه ─── */}
                        {filters.status?.length > 0 && (
                          <button
                            onClick={() => {
                              onChange({ ...filtersRef.current, status: [] });
                              setStatusDropdownOpen(false);
                              setStatusSearch("");
                            }}
                            className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب‌ها
                          </button>
                        )}
                        {filteredStatuses.map((opt) => {
                          const isSelected = filters.status?.includes(
                            opt.value,
                          );
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleStatus(opt.value)}
                              className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${isSelected ? "bg-green-50" : ""}`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-green-600 border-green-600" : "border-gray-300"}`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-3 h-3 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span
                                className={
                                  opt.color.split(" ")[0] === "bg-yellow-100"
                                    ? "text-yellow-800"
                                    : opt.color.split(" ")[1]
                                }
                              >
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                        {filteredStatuses.length === 0 && (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            نتیجه‌ای یافت نشد
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* وضعیت فاکتور */}
              <div>
                <SectionTitle
                  icon={DocumentCurrencyDollarIcon}
                  title="وضعیت فاکتور"
                />
                <div ref={invoiceStatusRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setInvoiceStatusDropdownOpen((p) => !p)}
                    className={dropdownBtnClass}
                  >
                    <span
                      className={
                        filters.invoice_status?.length > 0
                          ? "text-gray-800 font-medium"
                          : "text-gray-400"
                      }
                    >
                      {getInvoiceStatusLabel()}
                    </span>
                    {invoiceStatusDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {invoiceStatusDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={invoiceStatusSearch}
                        onChange={(e) => setInvoiceStatusSearch(e.target.value)}
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {/* ─── FIX ─── */}
                        {filters.invoice_status?.length > 0 && (
                          <button
                            onClick={() => {
                              onChange({
                                ...filtersRef.current,
                                invoice_status: [],
                              });
                              setInvoiceStatusDropdownOpen(false);
                              setInvoiceStatusSearch("");
                            }}
                            className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب‌ها
                          </button>
                        )}
                        {filteredInvoiceStatuses.map((opt) => {
                          const isSelected = filters.invoice_status?.includes(
                            opt.value,
                          );
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleInvoiceStatus(opt.value)}
                              className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${isSelected ? "bg-green-50" : ""}`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-green-600 border-green-600" : "border-gray-300"}`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-3 h-3 text-white"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth={3}
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </span>
                              <span className={opt.color.split(" ")[1]}>
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                        {filteredInvoiceStatuses.length === 0 && (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            نتیجه‌ای یافت نشد
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* مشتری */}
              <div>
                <SectionTitle icon={UserGroupIcon} title="مشتری" />
                <div ref={customerRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setCustomerDropdownOpen((p) => !p)}
                    className={dropdownBtnClass}
                  >
                    <span
                      className={
                        filters.customer_id
                          ? "text-gray-800 font-medium"
                          : "text-gray-400"
                      }
                    >
                      {getCustomerLabel()}
                    </span>
                    {customerDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {customerDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="نام یا شماره تلفن..."
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {/* ─── FIX ─── */}
                        {filters.customer_id && (
                          <button
                            onClick={() => {
                              onChange({
                                ...filtersRef.current,
                                customer_id: "",
                              });
                              setSelectedCustomer(null);
                              setCustomerDropdownOpen(false);
                              setCustomerSearch("");
                              setCustomerResults([]);
                            }}
                            className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب
                          </button>
                        )}
                        {searchingCustomers ? (
                          <div className="px-3 py-4 text-sm text-gray-400 text-center">
                            در حال جستجو...
                          </div>
                        ) : customerResults.length > 0 ? (
                          customerResults.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                onChange({
                                  ...filtersRef.current,
                                  customer_id: c.id,
                                });
                                setSelectedCustomer(c);
                                setCustomerDropdownOpen(false);
                                setCustomerSearch("");
                                setCustomerResults([]);
                              }}
                              className={`w-full text-right px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${String(filters.customer_id) === String(c.id) ? "bg-green-50 text-green-700 font-medium" : "text-gray-700"}`}
                            >
                              <div className="font-medium">{c.name}</div>
                              {c.phone && (
                                <div className="text-xs text-gray-500 mt-0.5">
                                  {c.phone}
                                </div>
                              )}
                            </button>
                          ))
                        ) : customerSearch ? (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            مشتری‌ای یافت نشد
                          </p>
                        ) : (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            برای جستجو نام یا شماره تلفن وارد کنید
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* ستون چپ */}
            <div className="space-y-8">
              {/* مسئول */}
              <div>
                <SectionTitle icon={UserIcon} title="مسئول" />
                <div ref={personnelRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setPersonnelDropdownOpen((p) => !p)}
                    className={dropdownBtnClass}
                  >
                    <span
                      className={
                        filters.personnel_ids?.length > 0
                          ? "text-gray-800 font-medium"
                          : "text-gray-400"
                      }
                    >
                      {getPersonnelLabel()}
                    </span>
                    {personnelDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                  </button>

                  {personnelDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={personnelSearch}
                        onChange={(e) => setPersonnelSearch(e.target.value)}
                        placeholder="نام یا نام کاربری..."
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {/* ─── FIX ─── */}
                        {filters.personnel_ids?.length > 0 && (
                          <button
                            onClick={() => {
                              onChange({
                                ...filtersRef.current,
                                personnel_ids: [],
                              });
                              setSelectedPersonnelMap({});
                              setPersonnelDropdownOpen(false);
                              setPersonnelSearch("");
                              setPersonnelResults([]);
                            }}
                            className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب‌ها
                          </button>
                        )}
                        {searchingPersonnel ? (
                          <div className="px-3 py-4 text-sm text-gray-400 text-center">
                            در حال جستجو...
                          </div>
                        ) : personnelResults.length > 0 ? (
                          personnelResults.map((p) => {
                            const displayName =
                              p.name ?? p.full_name ?? p.username ?? "—";
                            const isSelected = filters.personnel_ids?.includes(
                              p.id,
                            );
                            return (
                              <button
                                key={p.id}
                                onClick={() => {
                                  togglePersonnel(p.id);
                                  if (!isSelected) {
                                    setSelectedPersonnelMap((prev) => ({
                                      ...prev,
                                      [p.id]: displayName,
                                    }));
                                  }
                                  setPersonnelSearch("");
                                  setPersonnelResults([]);
                                  setPersonnelDropdownOpen(false);
                                }}
                                className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${isSelected ? "bg-purple-50" : ""}`}
                              >
                                <span
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-purple-600 border-purple-600" : "border-gray-300"}`}
                                >
                                  {isSelected && (
                                    <svg
                                      className="w-3 h-3 text-white"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={3}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M5 13l4 4L19 7"
                                      />
                                    </svg>
                                  )}
                                </span>
                                <span
                                  className={
                                    isSelected
                                      ? "text-purple-700 font-medium"
                                      : "text-gray-700"
                                  }
                                >
                                  {displayName}
                                </span>
                              </button>
                            );
                          })
                        ) : personnelSearch ? (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            پرسنلی یافت نشد
                          </p>
                        ) : (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            برای جستجو نام وارد کنید
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* تاریخ ورود */}
              <div>
                <SectionTitle icon={CalendarIcon} title="تاریخ ورود" />
                <div className="space-y-3">
                  <PersianDatePicker
                    value={filters.entry_from}
                    onChange={(val) =>
                      onChange({ ...filtersRef.current, entry_from: val })
                    }
                    placeholder="از تاریخ..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <PersianDatePicker
                    value={filters.entry_to}
                    onChange={(val) =>
                      onChange({ ...filtersRef.current, entry_to: val })
                    }
                    placeholder="تا تاریخ..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* فوتر */}
        <div className="sticky bottom-0 bg-gray-50 rounded-b-2xl border-t border-gray-200 px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-100 transition-colors"
          >
            بستن
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-sm"
          >
            اعمال فیلترها
          </button>
        </div>
      </div>
    </div>
  );
}
