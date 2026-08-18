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
import type { CustomerListRow, Personnel } from "../types/api";

/**
 * The device filter state. Owned by DeviceList and edited here, so the shape
 * is declared once beside the panel that understands it.
 *
 * `customer_id` carries "" rather than null when cleared, which is what the
 * clear button writes.
 */
export interface DeviceFilters {
  status: string[];
  customer_id: number | "";
  personnel_ids: number[];
  entry_from: string;
  entry_to: string;
  invoice_status: string[];
}

interface FilterPanelProps {
  filters: DeviceFilters;
  onChange: (filters: DeviceFilters) => void;
  onClear: () => void;
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS = [
  {
    value: "pending",
    label: "در انتظار بررسی",
    color: "bg-warning-soft text-warning",
  },
  {
    value: "diagnosing",
    label: "در حال بررسی",
    color: "bg-primary-soft text-primary",
  },
  {
    value: "waiting_for_parts",
    label: "در انتظار قطعه",
    color: "bg-warning-soft text-warning",
  },
  {
    value: "repairing",
    label: "در حال تعمیر",
    color: "bg-primary-soft text-primary",
  },
  {
    value: "repaired",
    label: "تعمیر شده",
    color: "bg-surface-alt text-text-secondary",
  },
  {
    value: "delivered",
    label: "تحویل داده شده",
    color: "bg-success-soft text-success",
  },
  {
    value: "ready_for_pickup",
    label: "آماده تحویل",
    color: "bg-primary-soft text-primary",
  },
  {
    value: "unrepairable",
    label: "غیرقابل تعمیر",
    color: "bg-danger-soft text-danger",
  },
  {
    value: "not_repaired",
    label: "تعمیر نشد",
    color: "bg-warning-soft text-danger",
  },
];

const INVOICE_STATUS_OPTIONS = [
  {
    value: "no_invoice",
    label: "فاکتور ندارد",
    color: "bg-surface-alt text-text-secondary",
  },
  { value: "paid", label: "پرداخت شده", color: "bg-success-soft text-success" },
  {
    value: "unpaid",
    label: "پرداخت نشده",
    color: "bg-danger-soft text-danger",
  },
  {
    value: "not_needed",
    label: "نیاز به فاکتور ندارد",
    color: "bg-primary-soft text-primary",
  },
];

const dropdownBtnClass =
  "w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-surface text-right flex justify-between items-center hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-success transition-all";

interface SearchInputProps {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
}

/**
 * Declared at module scope, not inside the component: a component defined in
 * a render body is a new type on every render, so React unmounts and remounts
 * it — this input was being rebuilt on every keystroke, and only autoFocus
 * hid it.
 */
function SearchInput({
  value,
  onChange,
  placeholder = "جستجو...",
}: SearchInputProps) {
  return (
    <div className="p-2 border-b border-border relative">
      <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="w-full text-sm pr-8 pl-2 py-1.5 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-success focus:border-transparent bg-surface text-text-primary"
        autoFocus
      />
    </div>
  );
}

interface SectionTitleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}

function SectionTitle({ icon: Icon, title }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-2 border-border">
      <Icon className="size-6 text-success" />
      <span className="text-sm font-semibold text-text-primary">{title}</span>
    </div>
  );
}

export default function FilterPanel({
  filters,
  onChange,
  onClear,
  isOpen,
  onClose,
}: FilterPanelProps) {
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
  const [customerResults, setCustomerResults] = useState<CustomerListRow[]>([]);
  const [personnelResults, setPersonnelResults] = useState<Personnel[]>([]);

  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerListRow | null>(null);
  const [selectedPersonnelMap, setSelectedPersonnelMap] = useState<
    Record<number, string>
  >({});

  const statusRef = useRef<HTMLDivElement>(null);
  const invoiceStatusRef = useRef<HTMLDivElement>(null);
  const customerRef = useRef<HTMLDivElement>(null);
  const personnelRef = useRef<HTMLDivElement>(null);

  // Always the latest filters, without a stale closure.
  const filtersRef = useRef(filters);
  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  const debouncedCustomerSearch = useDebounce(customerSearch, 300);
  const debouncedPersonnelSearch = useDebounce(personnelSearch, 300);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

  const searchCustomersAPI = useCallback(async (query: string) => {
    if (!query || query.trim() === "") {
      setCustomerResults([]);
      return;
    }
    setSearchingCustomers(true);
    try {
      const res = await searchCustomers(query);
      setCustomerResults(res.data.data);
    } catch (error) {
      console.error("Customer search failed:", error);
      setCustomerResults([]);
    } finally {
      setSearchingCustomers(false);
    }
  }, []);

  const searchPersonnelAPI = useCallback(async (query: string) => {
    if (!query || query.trim() === "") {
      setPersonnelResults([]);
      return;
    }
    setSearchingPersonnel(true);
    try {
      const res = await getPersonnel({ search: query });
      setPersonnelResults(res.data);
    } finally {
      setSearchingPersonnel(false);
    }
  }, []);

  useEffect(() => {
    if (filters.customer_id && !selectedCustomer) {
      void searchCustomersAPI(String(filters.customer_id));
    } else if (!filters.customer_id) {
      setSelectedCustomer(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
            const res = await getPersonnel();
            const found = res.data.find((p) => p.id === id);
            if (found) {
              setSelectedPersonnelMap((prev) => ({
                ...prev,
                [id]: found.full_name || found.username,
              }));
            }
          } catch (error) {
            console.error("Failed to load personnel:", error);
          }
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.personnel_ids]);

  useEffect(() => {
    if (customerSearch && customerSearch.trim()) {
      void searchCustomersAPI(debouncedCustomerSearch);
    } else {
      setCustomerResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedCustomerSearch, searchCustomersAPI]);

  useEffect(() => {
    if (personnelSearch && personnelSearch.trim()) {
      void searchPersonnelAPI(debouncedPersonnelSearch);
    } else {
      setPersonnelResults([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedPersonnelSearch, searchPersonnelAPI]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (statusRef.current && !statusRef.current.contains(target)) {
        setStatusDropdownOpen(false);
        setStatusSearch("");
      }
      if (
        invoiceStatusRef.current &&
        !invoiceStatusRef.current.contains(target)
      ) {
        setInvoiceStatusDropdownOpen(false);
        setInvoiceStatusSearch("");
      }
      if (customerRef.current && !customerRef.current.contains(target)) {
        setCustomerDropdownOpen(false);
        setCustomerSearch("");
        setCustomerResults([]);
      }
      if (personnelRef.current && !personnelRef.current.contains(target)) {
        setPersonnelDropdownOpen(false);
        setPersonnelSearch("");
        setPersonnelResults([]);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Every toggle reads filtersRef.current, not the captured prop.
  function toggleStatus(value: string) {
    const current = filtersRef.current.status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filtersRef.current, status: updated });
  }

  function toggleInvoiceStatus(value: string) {
    const current = filtersRef.current.invoice_status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filtersRef.current, invoice_status: updated });
  }

  function togglePersonnel(id: number) {
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-surface rounded-2xl shadow-2xl w-full max-w-4xl my-2 sm:my-8 animate-in fade-in zoom-in duration-200"
        dir="rtl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface rounded-t-2xl border-b border-border px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-success-soft p-2 rounded-xl">
              <FunnelIcon className="w-5 h-5 text-success" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                فیلترهای پیشرفته
              </h2>
              {activeCount > 0 && (
                <p className="text-xs text-text-secondary mt-0.5">
                  {activeCount} فیلتر فعال
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {activeCount > 0 && (
              <button
                onClick={onClear}
                className="px-3 py-1.5 text-sm text-danger hover:bg-danger-soft rounded-lg transition-colors flex items-center gap-1"
              >
                <XMarkIcon className="w-4 h-4" />
                پاک کردن همه
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-lg transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Right column  */}
            <div className="space-y-8">
              {/* Device status  */}
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
                        filters.status.length > 0
                          ? "text-text-primary font-medium"
                          : "text-text-secondary"
                      }
                    >
                      {getStatusLabel()}
                    </span>
                    {statusDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    )}
                  </button>

                  {statusDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={statusSearch}
                        onChange={(e) => setStatusSearch(e.target.value)}
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {filters.status.length > 0 && (
                          <button
                            onClick={() => {
                              onChange({ ...filtersRef.current, status: [] });
                              setStatusDropdownOpen(false);
                              setStatusSearch("");
                            }}
                            className="w-full text-right px-3 py-2 text-xs text-danger hover:bg-danger-soft border-b border-border flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب‌ها
                          </button>
                        )}
                        {filteredStatuses.map((opt) => {
                          const isSelected = filters.status.includes(opt.value);
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleStatus(opt.value)}
                              className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-surface-alt transition-colors ${isSelected ? "bg-success-soft" : ""}`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-success border-success" : "border-border"}`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-3 h-3 text-text-inverse"
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
                              <span className={opt.color}>{opt.label}</span>
                            </button>
                          );
                        })}
                        {filteredStatuses.length === 0 && (
                          <p className="px-3 py-4 text-xs text-text-secondary text-center">
                            نتیجه‌ای یافت نشد
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Invoice status */}
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
                        filters.invoice_status.length > 0
                          ? "text-text-primary font-medium"
                          : "text-text-secondary"
                      }
                    >
                      {getInvoiceStatusLabel()}
                    </span>
                    {invoiceStatusDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    )}
                  </button>

                  {invoiceStatusDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={invoiceStatusSearch}
                        onChange={(e) => setInvoiceStatusSearch(e.target.value)}
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {filters.invoice_status.length > 0 && (
                          <button
                            onClick={() => {
                              onChange({
                                ...filtersRef.current,
                                invoice_status: [],
                              });
                              setInvoiceStatusDropdownOpen(false);
                              setInvoiceStatusSearch("");
                            }}
                            className="w-full text-right px-3 py-2 text-xs text-danger hover:bg-danger-soft border-b border-border flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب‌ها
                          </button>
                        )}
                        {filteredInvoiceStatuses.map((opt) => {
                          const isSelected = filters.invoice_status.includes(
                            opt.value,
                          );
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleInvoiceStatus(opt.value)}
                              className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-surface-alt transition-colors ${isSelected ? "bg-success-soft" : ""}`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-success border-success" : "border-border"}`}
                              >
                                {isSelected && (
                                  <svg
                                    className="w-3 h-3 text-text-inverse"
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
                              <span className={opt.color}>{opt.label}</span>
                            </button>
                          );
                        })}
                        {filteredInvoiceStatuses.length === 0 && (
                          <p className="px-3 py-4 text-xs text-text-secondary text-center">
                            نتیجه‌ای یافت نشد
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer */}
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
                          ? "text-text-primary font-medium"
                          : "text-text-secondary"
                      }
                    >
                      {getCustomerLabel()}
                    </span>
                    {customerDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    )}
                  </button>

                  {customerDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={customerSearch}
                        onChange={(e) => setCustomerSearch(e.target.value)}
                        placeholder="نام یا شماره تلفن..."
                      />
                      <div className="max-h-56 overflow-y-auto">
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
                            className="w-full text-right px-3 py-2 text-xs text-danger hover:bg-danger-soft border-b border-border flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب
                          </button>
                        )}
                        {searchingCustomers ? (
                          <div className="px-3 py-4 text-sm text-text-secondary text-center">
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
                              className={`w-full text-right px-3 py-2.5 text-sm hover:bg-surface-alt transition-colors ${String(filters.customer_id) === String(c.id) ? "bg-success-soft text-success font-medium" : "text-text-primary"}`}
                            >
                              <div className="font-medium">{c.name}</div>
                              {c.phone && (
                                <div className="text-xs text-text-secondary mt-0.5">
                                  {c.phone}
                                </div>
                              )}
                            </button>
                          ))
                        ) : customerSearch ? (
                          <p className="px-3 py-4 text-xs text-text-secondary text-center">
                            مشتری‌ای یافت نشد
                          </p>
                        ) : (
                          <p className="px-3 py-4 text-xs text-text-secondary text-center">
                            برای جستجو نام یا شماره تلفن وارد کنید
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Left column */}
            <div className="space-y-8">
              {/* Technician */}
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
                        filters.personnel_ids.length > 0
                          ? "text-text-primary font-medium"
                          : "text-text-secondary"
                      }
                    >
                      {getPersonnelLabel()}
                    </span>
                    {personnelDropdownOpen ? (
                      <ChevronUpIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    ) : (
                      <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
                    )}
                  </button>

                  {personnelDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full bg-surface border border-border rounded-xl shadow-lg overflow-hidden">
                      <SearchInput
                        value={personnelSearch}
                        onChange={(e) => setPersonnelSearch(e.target.value)}
                        placeholder="نام یا نام کاربری..."
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {filters.personnel_ids.length > 0 && (
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
                            className="w-full text-right px-3 py-2 text-xs text-danger hover:bg-danger-soft border-b border-border flex items-center gap-1 transition-colors"
                          >
                            <XCircleIcon className="w-3.5 h-3.5" />
                            پاک کردن انتخاب‌ها
                          </button>
                        )}
                        {searchingPersonnel ? (
                          <div className="px-3 py-4 text-sm text-text-secondary text-center">
                            در حال جستجو...
                          </div>
                        ) : personnelResults.length > 0 ? (
                          personnelResults.map((p) => {
                            // A personnel row has no `name`: the old chain
                            // always fell through to the second.
                            const displayName = p.full_name || p.username;
                            const isSelected = filters.personnel_ids.includes(
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
                                className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-surface-alt transition-colors ${isSelected ? "bg-primary-soft" : ""}`}
                              >
                                <span
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-primary border-primary" : "border-border"}`}
                                >
                                  {isSelected && (
                                    <svg
                                      className="w-3 h-3 text-text-inverse"
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
                                      ? "text-primary font-medium"
                                      : "text-text-primary"
                                  }
                                >
                                  {displayName}
                                </span>
                              </button>
                            );
                          })
                        ) : personnelSearch ? (
                          <p className="px-3 py-4 text-xs text-text-secondary text-center">
                            پرسنلی یافت نشد
                          </p>
                        ) : (
                          <p className="px-3 py-4 text-xs text-text-secondary text-center">
                            برای جستجو نام وارد کنید
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Entry date */}
              <div>
                <SectionTitle icon={CalendarIcon} title="تاریخ ورود" />
                <div className="space-y-3">
                  <PersianDatePicker
                    value={filters.entry_from}
                    onChange={(val) =>
                      onChange({ ...filtersRef.current, entry_from: val })
                    }
                    placeholder="از تاریخ..."
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-success focus:border-transparent bg-surface text-text-primary"
                  />
                  <PersianDatePicker
                    value={filters.entry_to}
                    onChange={(val) =>
                      onChange({ ...filtersRef.current, entry_to: val })
                    }
                    placeholder="تا تاریخ..."
                    className="w-full border border-border rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-success focus:border-transparent bg-surface text-text-primary"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-surface-alt rounded-b-2xl border-t border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-xl text-text-primary hover:bg-surface-alt transition-colors"
          >
            بستن
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-success text-text-inverse rounded-xl hover:bg-success-hover transition-colors shadow-sm"
          >
            اعمال فیلترها
          </button>
        </div>
      </div>
    </div>
  );
}
