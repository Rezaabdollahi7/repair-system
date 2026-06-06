import { useState, useRef, useEffect } from "react";
import {
  FunnelIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XMarkIcon,
  XCircleIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  CreditCardIcon,
} from "@heroicons/react/24/outline";
import PersianDatePicker from "./PersianDatePicker";

const PAYMENT_STATUS_OPTIONS = [
  { value: "paid", label: "پرداخت شده", color: "bg-green-100 text-green-700" },
  {
    value: "partial",
    label: "پرداخت ناقص",
    color: "bg-yellow-100 text-yellow-700",
  },
  {
    value: "pending",
    label: "در انتظار پرداخت",
    color: "bg-orange-100 text-orange-700",
  },
];

export default function SaleInvoiceFilterPanel({
  filters,
  onChange,
  onClear,
  isOpen,
  onClose,
}) {
  const [paymentStatusDropdownOpen, setPaymentStatusDropdownOpen] =
    useState(false);
  const [paymentStatusSearch, setPaymentStatusSearch] = useState("");

  const paymentStatusRef = useRef(null);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "" && v !== undefined,
  ).length;

  useEffect(() => {
    function handleClickOutside(e) {
      if (
        paymentStatusRef.current &&
        !paymentStatusRef.current.contains(e.target)
      ) {
        setPaymentStatusDropdownOpen(false);
        setPaymentStatusSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function togglePaymentStatus(value) {
    const current = filters.payment_status || [];
    const updated = current.includes(value)
      ? current.filter((s) => s !== value)
      : [...current, value];
    onChange({ ...filters, payment_status: updated });
  }

  function getPaymentStatusLabel() {
    const selected = filters.payment_status || [];
    if (selected.length === 0) return "همه وضعیت‌ها";
    if (selected.length === 1) {
      return (
        PAYMENT_STATUS_OPTIONS.find((o) => o.value === selected[0])?.label ||
        selected[0]
      );
    }
    return `${selected.length} وضعیت انتخاب شده`;
  }

  const filteredPaymentStatuses = PAYMENT_STATUS_OPTIONS.filter((o) =>
    o.label.includes(paymentStatusSearch),
  );

  const dropdownBtnClass =
    "w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white text-right flex justify-between items-center hover:border-green-400 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-green-500 transition-all";

  const SectionTitle = ({ icon: Icon, title }) => (
    <div className="flex items-center gap-2 mb-3 pb-2 ">
      <Icon className="size-6 text-green-600" />
      <span className="text-sm font-semibold text-gray-700">{title}</span>
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl my-2 sm:my-8 animate-in fade-in zoom-in duration-200"
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
          <div className="space-y-6">
            {/* وضعیت پرداخت */}
            <div>
              <SectionTitle icon={CreditCardIcon} title="وضعیت پرداخت" />
              <div ref={paymentStatusRef} className="relative">
                <button
                  type="button"
                  onClick={() => setPaymentStatusDropdownOpen((p) => !p)}
                  className={dropdownBtnClass}
                >
                  <span
                    className={
                      filters.payment_status?.length > 0
                        ? "text-gray-800 font-medium"
                        : "text-gray-400"
                    }
                  >
                    {getPaymentStatusLabel()}
                  </span>
                  {paymentStatusDropdownOpen ? (
                    <ChevronUpIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                </button>

                {paymentStatusDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-gray-100 relative">
                      <input
                        type="text"
                        placeholder="جستجو..."
                        value={paymentStatusSearch}
                        onChange={(e) => setPaymentStatusSearch(e.target.value)}
                        className="w-full text-sm pr-3 pl-2 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-56 overflow-y-auto">
                      {filters.payment_status?.length > 0 && (
                        <ClearButton
                          multi
                          onClick={() => {
                            onChange({ ...filters, payment_status: [] });
                            setPaymentStatusDropdownOpen(false);
                            setPaymentStatusSearch("");
                          }}
                        />
                      )}
                      {filteredPaymentStatuses.map((opt) => {
                        const isSelected = filters.payment_status?.includes(
                          opt.value,
                        );
                        return (
                          <button
                            key={opt.value}
                            onClick={() => togglePaymentStatus(opt.value)}
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
                      {filteredPaymentStatuses.length === 0 && (
                        <p className="px-3 py-4 text-xs text-gray-400 text-center">
                          نتیجه‌ای یافت نشد
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* بازه تاریخ فاکتور */}
            <div>
              <SectionTitle icon={CalendarIcon} title="بازه تاریخ فاکتور" />
              <div className="space-y-3">
                <PersianDatePicker
                  value={filters.date_from}
                  onChange={(val) => onChange({ ...filters, date_from: val })}
                  placeholder="از تاریخ..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <PersianDatePicker
                  value={filters.date_to}
                  onChange={(val) => onChange({ ...filters, date_to: val })}
                  placeholder="تا تاریخ..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
              </div>
            </div>

            {/* بازه مبلغ کل */}
            <div>
              <SectionTitle icon={CurrencyDollarIcon} title="بازه مبلغ کل" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    از مبلغ (ریال)
                  </label>
                  <input
                    type="number"
                    value={filters.amount_from || ""}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        amount_from: e.target.value
                          ? Number(e.target.value)
                          : "",
                      })
                    }
                    min="0"
                    step="10000"
                    placeholder="حداقل مبلغ"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    تا مبلغ (ریال)
                  </label>
                  <input
                    type="number"
                    value={filters.amount_to || ""}
                    onChange={(e) =>
                      onChange({
                        ...filters,
                        amount_to: e.target.value ? Number(e.target.value) : "",
                      })
                    }
                    min="0"
                    step="10000"
                    placeholder="حداکثر مبلغ"
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
