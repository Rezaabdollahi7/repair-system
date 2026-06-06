import { useState, useRef, useEffect } from "react";
import {
  FunnelIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

import PersianDatePicker from "./PersianDatePicker";

const STATUS_OPTIONS = [
  { value: "pending", label: "در انتظار بررسی" },
  { value: "diagnosing", label: "در حال بررسی" },
  { value: "waiting_for_parts", label: "در انتظار قطعه" },
  { value: "repairing", label: "در حال تعمیر" },
  { value: "repaired", label: "تعمیر شده" },
  { value: "delivered", label: "تحویل داده شده" },
  { value: "unrepairable", label: "غیرقابل تعمیر" },
  { value: "ready_for_pickup", label: "آماده تحویل" },
  { value: "not_repaired", label: "تعمیر نشد" },
];

// اضافه شد: گزینه‌های وضعیت فاکتور
const INVOICE_STATUS_OPTIONS = [
  { value: "no_invoice", label: "ثبت نشده" },
  { value: "paid", label: "پرداخت شده" },
  { value: "unpaid", label: "پرداخت نشده" },
  { value: "not_needed", label: "نیاز به فاکتور ندارد" },
];

export default function FilterPanel({
  filters,
  onChange,
  onClear,
  customers,
  personnel,
}) {
  const [open, setOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [invoiceStatusDropdownOpen, setInvoiceStatusDropdownOpen] =
    useState(false); // اضافه شد
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [personnelDropdownOpen, setPersonnelDropdownOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [personnelSearch, setPersonnelSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [invoiceStatusSearch, setInvoiceStatusSearch] = useState(""); // اضافه شد

  const statusRef = useRef(null);
  const invoiceStatusRef = useRef(null); // اضافه شد
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
        // اضافه شد
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

  // اضافه شد: تابع toggle برای وضعیت فاکتور
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
        STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ??
        selected[0]
      );
    return `${selected.length} وضعیت انتخاب شده`;
  }

  // اضافه شد: تابع getLabel برای وضعیت فاکتور
  function getInvoiceStatusLabel() {
    const selected = filters.invoice_status || [];
    if (selected.length === 0) return "همه وضعیت‌های فاکتور";
    if (selected.length === 1) {
      return (
        INVOICE_STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ??
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

  // اضافه شد: فیلتر وضعیت‌های فاکتور
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
    "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-right flex justify-between items-center hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const SearchInput = ({ value, onChange: onChangeFn }) => (
    <div className="p-2 border-b border-gray-100 relative">
      <MagnifyingGlassIcon className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        placeholder="جستجو..."
        value={value}
        onChange={onChangeFn}
        className="w-full text-sm pr-7 pl-2 py-1 border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
        autoFocus
      />
    </div>
  );

  const ClearButton = ({ onClick, multi }) => (
    <button
      onClick={onClick}
      className="w-full text-right px-3 py-2 text-xs text-red-500 hover:bg-red-50 border-b border-gray-100 flex items-center gap-1"
    >
      <XCircleIcon className="w-3.5 h-3.5" />
      {multi ? "پاک کردن انتخاب‌ها" : "پاک کردن انتخاب"}
    </button>
  );

  return (
    <div className="my-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setOpen((p) => !p)}
          className="flex items-center gap-2 border border-gray-300 rounded-lg px-4 py-2 text-sm hover:bg-gray-50"
        >
          <FunnelIcon className="w-4 h-4 text-gray-500" />
          <span>فیلترها</span>
          {open ? (
            <ChevronUpIcon className="w-4 h-4 text-gray-400" />
          ) : (
            <ChevronDownIcon className="w-4 h-4 text-gray-400" />
          )}
          {activeCount > 0 && (
            <span className="bg-blue-600 text-white text-xs rounded-full px-2 py-0.5">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            onClick={onClear}
            className="flex items-center gap-1 text-sm text-red-500 hover:underline"
          >
            <XMarkIcon className="w-4 h-4" />
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 p-4 border border-gray-200 rounded-lg bg-gray-50 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* وضعیت دستگاه */}
          <div ref={statusRef} className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              وضعیت دستگاه
            </label>
            <button
              type="button"
              onClick={() => setStatusDropdownOpen((p) => !p)}
              className={dropdownBtnClass}
            >
              <span
                className={
                  filters.status?.length > 0 ? "text-gray-800" : "text-gray-400"
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
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                <SearchInput
                  value={statusSearch}
                  onChange={(e) => setStatusSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto">
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
                    const isSelected = filters.status?.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        onClick={() => toggleStatus(opt.value)}
                        className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                          isSelected
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-blue-600 border-blue-600"
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
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* اضافه شد: وضعیت فاکتور */}
          <div ref={invoiceStatusRef} className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              وضعیت فاکتور
            </label>
            <button
              type="button"
              onClick={() => setInvoiceStatusDropdownOpen((p) => !p)}
              className={dropdownBtnClass}
            >
              <span
                className={
                  filters.invoice_status?.length > 0
                    ? "text-gray-800"
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
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                <SearchInput
                  value={invoiceStatusSearch}
                  onChange={(e) => setInvoiceStatusSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto">
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
                        className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                          isSelected
                            ? "bg-green-50 text-green-700"
                            : "text-gray-700"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
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
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* مشتری */}
          <div ref={customerRef} className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              مشتری
            </label>
            <button
              type="button"
              onClick={() => setCustomerDropdownOpen((p) => !p)}
              className={dropdownBtnClass}
            >
              <span
                className={
                  filters.customer_id ? "text-gray-800" : "text-gray-400"
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
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                <SearchInput
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto">
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
                        className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                          String(filters.customer_id) === String(c.id)
                            ? "bg-blue-50 text-blue-700"
                            : "text-gray-700"
                        }`}
                      >
                        {c.name} - {c.phone}
                      </button>
                    ))
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-400">
                      نتیجه‌ای یافت نشد
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* مسئول */}
          <div ref={personnelRef} className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-2">
              مسئول
            </label>
            <button
              type="button"
              onClick={() => setPersonnelDropdownOpen((p) => !p)}
              className={dropdownBtnClass}
            >
              <span
                className={
                  filters.personnel_ids?.length > 0
                    ? "text-gray-800"
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
              <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                <SearchInput
                  value={personnelSearch}
                  onChange={(e) => setPersonnelSearch(e.target.value)}
                />
                <div className="max-h-48 overflow-y-auto">
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
                      const isSelected = filters.personnel_ids?.includes(p.id);
                      return (
                        <button
                          key={p.id}
                          onClick={() => togglePersonnel(p.id)}
                          className={`w-full text-right px-3 py-2 text-sm flex items-center gap-2 hover:bg-gray-50 transition-colors ${
                            isSelected
                              ? "bg-purple-50 text-purple-700"
                              : "text-gray-700"
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
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
                          {displayName}
                        </button>
                      );
                    })
                  ) : (
                    <p className="px-3 py-2 text-xs text-gray-400">
                      نتیجه‌ای یافت نشد
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* تاریخ ورود از */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              تاریخ ورود از
            </label>
            <PersianDatePicker
              value={filters.entry_from}
              onChange={(val) => onChange({ ...filters, entry_from: val })}
              placeholder="از تاریخ..."
            />
          </div>

          {/* تاریخ ورود تا */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">
              تاریخ ورود تا
            </label>
            <PersianDatePicker
              value={filters.entry_to}
              onChange={(val) => onChange({ ...filters, entry_to: val })}
              placeholder="تا تاریخ..."
            />
          </div>
        </div>
      )}
    </div>
  );
}
