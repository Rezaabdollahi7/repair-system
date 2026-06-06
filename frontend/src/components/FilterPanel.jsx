import { useState, useRef, useEffect } from "react";
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
    label: "ثبت نشده",
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
  customers,
  personnel,
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

  const statusRef = useRef(null);
  const invoiceStatusRef = useRef(null);
  const customerRef = useRef(null);
  const personnelRef = useRef(null);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "",
  ).length;

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
      }
      if (personnelRef.current && !personnelRef.current.contains(e.target)) {
        setPersonnelDropdownOpen(false);
        setPersonnelSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleStatus(value) {
    const current = filters.status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filters, status: updated });
  }

  function toggleInvoiceStatus(value) {
    const current = filters.invoice_status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filters, invoice_status: updated });
  }

  function togglePersonnel(id) {
    const current = filters.personnel_ids || [];
    const updated = current.includes(id)
      ? current.filter((p) => p !== id)
      : [...current, id];
    onChange({ ...filters, personnel_ids: updated });
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
    if (selected.length === 1) {
      return (
        INVOICE_STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ||
        selected[0]
      );
    }
    return `${selected.length} وضعیت فاکتور انتخاب شده`;
  }

  function getCustomerLabel() {
    if (!filters.customer_id) return "همه مشتریان";
    const c = customers.find(
      (c) => String(c.id) === String(filters.customer_id),
    );
    return c ? `${c.name} - ${c.phone}` : "همه مشتریان";
  }

  function getPersonnelLabel() {
    const selected = filters.personnel_ids || [];
    if (selected.length === 0) return "همه مسئولان";
    if (selected.length === 1) {
      const p = personnel.find((p) => p.id === selected[0]);
      return p?.name ?? p?.full_name ?? p?.username ?? "—";
    }
    return `${selected.length} مسئول انتخاب شده`;
  }

  const filteredStatuses = STATUS_OPTIONS.filter((o) =>
    o.label.includes(statusSearch),
  );

  const filteredInvoiceStatuses = INVOICE_STATUS_OPTIONS.filter((o) =>
    o.label.includes(invoiceStatusSearch),
  );

  const filteredCustomers = (customers || []).filter((c) =>
    `${c.name} ${c.phone}`.includes(customerSearch),
  );
  const filteredPersonnel = (personnel || []).filter((p) => {
    const name = p.name ?? p.full_name ?? p.username ?? "";
    return name.includes(personnelSearch);
  });

  const dropdownBtnClass =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-right flex justify-between items-center hover:border-green-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all";

  const SearchInput = ({ value, onChange: onChangeFn }) => (
    <div className="p-2 border-b border-gray-100 relative">
      <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        placeholder="جستجو..."
        value={value}
        onChange={onChangeFn}
        className="w-full text-sm pr-8 pl-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
        autoFocus
      />
    </div>
  );

  const ClearButton = ({ onClick, multi }) => (
    <button
      onClick={onClick}
      className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 flex items-center gap-1 transition-colors"
    >
      <XCircleIcon className="w-3.5 h-3.5" />
      {multi ? "پاک کردن انتخاب‌ها" : "پاک کردن انتخاب"}
    </button>
  );

  const SectionTitle = ({ icon: Icon, title }) => (
    <div className="flex items-center gap-2 mb-2   border-gray-200">
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
                        {filters.status?.length > 0 && (
                          <ClearButton
                            multi
                            onClick={() => {
                              onChange({ ...filters, status: [] });
                              setStatusDropdownOpen(false);
                              setStatusSearch("");
                            }}
                          />
                        )}
                        {filteredStatuses.map((opt) => {
                          const isSelected = filters.status?.includes(
                            opt.value,
                          );
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleStatus(opt.value)}
                              className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                                isSelected ? "bg-green-50" : ""
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-green-600 border-green-600"
                                    : "border-gray-300"
                                }`}
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
                        {filters.invoice_status?.length > 0 && (
                          <ClearButton
                            multi
                            onClick={() => {
                              onChange({ ...filters, invoice_status: [] });
                              setInvoiceStatusDropdownOpen(false);
                              setInvoiceStatusSearch("");
                            }}
                          />
                        )}
                        {filteredInvoiceStatuses.map((opt) => {
                          const isSelected = filters.invoice_status?.includes(
                            opt.value,
                          );
                          return (
                            <button
                              key={opt.value}
                              onClick={() => toggleInvoiceStatus(opt.value)}
                              className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                                isSelected ? "bg-green-50" : ""
                              }`}
                            >
                              <span
                                className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected
                                    ? "bg-green-600 border-green-600"
                                    : "border-gray-300"
                                }`}
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
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {filters.customer_id && (
                          <ClearButton
                            onClick={() => {
                              onChange({ ...filters, customer_id: "" });
                              setCustomerDropdownOpen(false);
                              setCustomerSearch("");
                            }}
                          />
                        )}
                        {filteredCustomers.length > 0 ? (
                          filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => {
                                onChange({ ...filters, customer_id: c.id });
                                setCustomerDropdownOpen(false);
                                setCustomerSearch("");
                              }}
                              className={`w-full text-right px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                                String(filters.customer_id) === String(c.id)
                                  ? "bg-green-50 text-green-700 font-medium"
                                  : "text-gray-700"
                              }`}
                            >
                              {c.name} - {c.phone}
                            </button>
                          ))
                        ) : (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            نتیجه‌ای یافت نشد
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
                      />
                      <div className="max-h-56 overflow-y-auto">
                        {filters.personnel_ids?.length > 0 && (
                          <ClearButton
                            multi
                            onClick={() => {
                              onChange({ ...filters, personnel_ids: [] });
                              setPersonnelDropdownOpen(false);
                              setPersonnelSearch("");
                            }}
                          />
                        )}
                        {filteredPersonnel.length > 0 ? (
                          filteredPersonnel.map((p) => {
                            const displayName =
                              p.name ?? p.full_name ?? p.username ?? "—";
                            const isSelected = filters.personnel_ids?.includes(
                              p.id,
                            );
                            return (
                              <button
                                key={p.id}
                                onClick={() => togglePersonnel(p.id)}
                                className={`w-full text-right px-3 py-2.5 text-sm flex items-center gap-3 hover:bg-gray-50 transition-colors ${
                                  isSelected ? "bg-purple-50" : ""
                                }`}
                              >
                                <span
                                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected
                                      ? "bg-purple-600 border-purple-600"
                                      : "border-gray-300"
                                  }`}
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
                        ) : (
                          <p className="px-3 py-4 text-xs text-gray-400 text-center">
                            نتیجه‌ای یافت نشد
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
                      onChange({ ...filters, entry_from: val })
                    }
                    placeholder="از تاریخ..."
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                  <PersianDatePicker
                    value={filters.entry_to}
                    onChange={(val) => onChange({ ...filters, entry_to: val })}
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
            onClick={() => {
              onClose();
            }}
            className="px-6 py-2 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors shadow-sm"
          >
            اعمال فیلترها
          </button>
        </div>
      </div>
    </div>
  );
}
