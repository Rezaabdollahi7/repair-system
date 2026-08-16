import { useState, useRef, useEffect } from "react";
import {
  MagnifyingGlassIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from "@heroicons/react/24/outline";

/**
 * Option values are widened to string | number because callers pass both:
 * ids arrive from the API as numbers, while status and category codes are
 * strings.
 */
export type SelectValue = string | number;

export interface SelectOption {
  value: SelectValue;
  label: string;
  subLabel?: string;
}

interface SearchableSelectProps {
  options?: SelectOption[];
  value?: SelectValue | null;
  onChange: (value: SelectValue) => void;
  onSearch?: (query: string) => void;
  onOpen?: () => void;
  placeholder?: string;
  disabled?: boolean;
  loading?: boolean;
  required?: boolean;
  error?: string;
}

export default function SearchableSelect({
  options = [],
  value,
  onChange,
  onSearch,
  onOpen,
  placeholder = "انتخاب کنید...",
  disabled = false,
  loading = false,
  required = false,
  error = "",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (onSearch) {
      onSearch(search);
    }
  }, [search, onSearch]);

  const filteredOptions = options.filter((opt) =>
    opt.label.toLowerCase().includes(search.toLowerCase()),
  );

  const selectedOption = options.find((opt) => opt.value === value);

  const handleToggle = () => {
    if (disabled) return;
    const willOpen = !isOpen;
    setIsOpen(willOpen);
    if (willOpen && onOpen) {
      onOpen();
    }
  };

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`w-full border rounded-lg px-3 py-2 text-sm bg-surface text-right flex justify-between items-center ${
          error ? "border-danger" : "border-border"
        } ${disabled ? "bg-surface-alt cursor-not-allowed" : "hover:border-primary"}`}
      >
        <span
          className={
            selectedOption ? "text-text-primary" : "text-text-secondary"
          }
        >
          {selectedOption?.label || placeholder}
          {required && <span className="text-danger mr-1">*</span>}
        </span>
        {isOpen ? (
          <ChevronUpIcon className="w-4 h-4 text-text-secondary shrink-0" />
        ) : (
          <ChevronDownIcon className="w-4 h-4 text-text-secondary shrink-0" />
        )}
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-surface border border-border rounded-lg shadow-lg">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                placeholder="جستجو..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm pr-8 pl-2 py-1.5 border border-border rounded focus:outline-none focus:ring-1 focus:ring-primary bg-surface text-text-primary"
                autoFocus
              />
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {loading ? (
              <div className="px-3 py-4 text-center text-sm text-text-secondary">
                در حال بارگذاری...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-text-secondary">
                نتیجه‌ای یافت نشد
              </div>
            ) : (
              filteredOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`w-full text-right px-3 py-2 text-sm hover:bg-surface-alt transition-colors border-b border-b-border ${
                    value === opt.value
                      ? "bg-primary-soft text-primary font-medium"
                      : "text-text-primary"
                  }`}
                >
                  {opt.label}
                  {opt.subLabel && (
                    <span className="text-xs text-text-secondary block mt-1">
                      {opt.subLabel}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
