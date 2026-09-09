import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
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
import type { PaymentStatus } from "../types/api";
import { backdrop, modalPanel } from "../motion";
import PaymentStatusBadge from "./PaymentStatusBadge";
import { PAYMENT_STATUSES } from "../utils/invoiceStatus";

/**
 * The filter state this panel edits. Exported because SaleInvoiceList owns
 * the value and passes it down — one shape, defined where it is read.
 *
 * The amount fields carry "" rather than undefined when cleared, which is
 * what the number inputs produce.
 */
export interface SaleInvoiceFilters {
  payment_status: PaymentStatus[];
  date_from: string;
  date_to: string;
  amount_from: number | "";
  amount_to: number | "";
}

interface SaleInvoiceFilterPanelProps {
  filters: SaleInvoiceFilters;
  onChange: (filters: SaleInvoiceFilters) => void;
  onClear: () => void;
  isOpen: boolean;
  onClose: () => void;
}

/*
 * From the shared status list. This was the fourth copy, and it carried the
 * same collision the purchases page did: `partial` and `pending` both amber,
 * so a half-paid invoice and an unpaid one looked the same in the very panel
 * you open to tell them apart.
 */
const PAYMENT_STATUS_OPTIONS = PAYMENT_STATUSES.map((status) => ({
  value: status.key,
  label: status.label,
}));

interface SectionTitleProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
}

function SectionTitle({ icon: Icon, title }: SectionTitleProps) {
  return (
    <div className="flex items-center gap-2 mb-3 pb-2">
      <Icon className="w-5 h-5 text-text-secondary" />
      <span className="text-body-sm font-semibold text-text-primary">
        {title}
      </span>
    </div>
  );
}

interface ClearButtonProps {
  onClick: () => void;
  multi?: boolean;
}

function ClearButton({ onClick, multi }: ClearButtonProps) {
  return (
    <button
      onClick={onClick}
      className="w-full text-right px-3 py-2 text-body-xs text-danger-fg hover:bg-danger-soft border-b border-border flex items-center gap-1 transition-colors"
    >
      <XCircleIcon className="w-3.5 h-3.5" />
      {multi ? "پاک کردن انتخاب‌ها" : "پاک کردن انتخاب"}
    </button>
  );
}

export default function SaleInvoiceFilterPanel({
  filters,
  onChange,
  onClear,
  isOpen,
  onClose,
}: SaleInvoiceFilterPanelProps) {
  const [paymentStatusDropdownOpen, setPaymentStatusDropdownOpen] =
    useState(false);
  const [paymentStatusSearch, setPaymentStatusSearch] = useState("");

  const paymentStatusRef = useRef<HTMLDivElement>(null);

  const activeCount = Object.values(filters).filter((v) =>
    Array.isArray(v) ? v.length > 0 : v !== "" && v !== undefined,
  ).length;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        paymentStatusRef.current &&
        !paymentStatusRef.current.contains(e.target as Node)
      ) {
        setPaymentStatusDropdownOpen(false);
        setPaymentStatusSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function togglePaymentStatus(value: PaymentStatus) {
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
    "w-full border border-border rounded-field px-3.5 py-2.5 text-body-sm bg-surface text-right " +
    "flex justify-between items-center gap-2 cursor-pointer hover:border-border-strong " +
    "focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] duration-150";

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-2 sm:p-4 overflow-y-auto">
      <motion.div
        variants={backdrop}
        initial="hidden"
        animate="visible"
        onClick={onClose}
        className="fixed inset-0 bg-scrim/50"
      />
      <motion.div
        variants={modalPanel}
        initial="hidden"
        animate="visible"
        className="relative bg-surface border border-border rounded-panel shadow-xl w-full max-w-2xl my-2 sm:my-8"
        dir="rtl"
      >
        {/* هدر */}
        <div className="sticky top-0 bg-surface rounded-t-2xl border-b border-border px-4 sm:px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-primary-soft p-2 rounded-field">
              <FunnelIcon className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-text-primary">
                فیلترهای پیشرفته
              </h2>
              {activeCount > 0 && (
                <p className="text-body-xs text-text-secondary mt-0.5">
                  {activeCount} فیلتر فعال
                </p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {activeCount > 0 && (
              <button
                onClick={onClear}
                className="px-3 py-1.5 text-body-sm text-danger-fg hover:bg-danger-soft rounded-field transition-colors flex items-center gap-1"
              >
                <XMarkIcon className="w-4 h-4" />
                پاک کردن همه
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-alt rounded-field transition-colors"
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
                      filters.payment_status?.length
                        ? "text-text-primary font-medium"
                        : "text-text-secondary"
                    }
                  >
                    {getPaymentStatusLabel()}
                  </span>
                  {paymentStatusDropdownOpen ? (
                    <ChevronUpIcon className="w-4 h-4 text-text-secondary shrink-0" />
                  ) : (
                    <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
                  )}
                </button>

                {paymentStatusDropdownOpen && (
                  <div className="absolute z-50 mt-2 w-full bg-surface border border-border rounded-card shadow-lg overflow-hidden">
                    <div className="p-2 border-b border-border relative">
                      <input
                        type="text"
                        placeholder="جستجو..."
                        value={paymentStatusSearch}
                        onChange={(e) => setPaymentStatusSearch(e.target.value)}
                        className="w-full text-body-sm pr-3 pl-2 py-2 border border-border-field rounded-field bg-surface text-text-primary focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] duration-150"
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
                            className={`w-full text-right px-3 py-2.5 text-body-sm flex items-center gap-3 hover:bg-surface-alt transition-colors ${
                              isSelected ? "bg-accent-soft" : ""
                            }`}
                          >
                            <span
                              className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                isSelected
                                  ? "bg-primary border-primary text-primary-fg"
                                  : "border-border"
                              }`}
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
                            <PaymentStatusBadge status={opt.value} />
                          </button>
                        );
                      })}
                      {filteredPaymentStatuses.length === 0 && (
                        <p className="px-3 py-4 text-body-xs text-text-secondary text-center">
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
                  className="w-full border border-border rounded-field px-3.5 py-2.5 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] duration-150"
                />
                <PersianDatePicker
                  value={filters.date_to}
                  onChange={(val) => onChange({ ...filters, date_to: val })}
                  placeholder="تا تاریخ..."
                  className="w-full border border-border rounded-field px-3.5 py-2.5 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] duration-150"
                />
              </div>
            </div>

            {/* بازه مبلغ کل */}
            <div>
              <SectionTitle icon={CurrencyDollarIcon} title="بازه مبلغ کل" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-body-xs text-text-secondary mb-1">
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
                    className="w-full border border-border-field rounded-field px-3.5 py-2.5 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] duration-150"
                  />
                </div>
                <div>
                  <label className="block text-body-xs text-text-secondary mb-1">
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
                    className="w-full border border-border-field rounded-field px-3.5 py-2.5 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow] duration-150"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* فوتر */}
        <div className="sticky bottom-0 bg-surface-alt rounded-b-2xl border-t border-border px-4 sm:px-6 py-4 flex flex-col sm:flex-row justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2.5 rounded-field border border-border bg-surface text-body-sm font-bold
                       text-text-primary hover:border-border-strong transition-colors cursor-pointer"
          >
            بستن
          </button>
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-field bg-primary text-primary-fg text-body-sm font-bold
                       shadow-primary hover:bg-primary-hover transition-colors cursor-pointer"
          >
            اعمال فیلترها
          </button>
        </div>
      </motion.div>
    </div>
  );
}
