import { useState, useRef, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  MagnifyingGlassIcon,
  ChevronDownIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";
import { transition } from "../motion";

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
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
        setSearch("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
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
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`w-full flex justify-between items-center gap-2 rounded-field border
                    px-3.5 py-2.5 text-body-sm text-right bg-surface
                    transition-[border-color,box-shadow] duration-150 focus:outline-none
                    ${
                      error
                        ? "border-danger focus:shadow-[0_0_0_3px_var(--danger-soft)]"
                        : "border-border focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)]"
                    }
                    ${
                      disabled
                        ? "bg-surface-alt text-text-muted cursor-not-allowed"
                        : "hover:border-border-strong cursor-pointer"
                    }`}
      >
        <span
          className={`truncate ${
            selectedOption ? "text-text-primary" : "text-text-muted"
          }`}
        >
          {selectedOption?.label || placeholder}
          {required && <span className="text-danger mr-1">*</span>}
        </span>
        <ChevronDownIcon
          className={`w-4 h-4 shrink-0 text-text-muted transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={transition.fast}
            className="absolute z-50 mt-1.5 w-full bg-surface border border-border
                       rounded-card shadow-lg overflow-hidden"
          >
            <div className="p-2 border-b border-border">
              <div className="relative">
                <MagnifyingGlassIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="جستجو…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-body-sm pr-9 pl-2.5 py-2 rounded-field bg-surface
                             text-text-primary placeholder:text-text-muted border border-border
                             focus:outline-none focus:border-primary
                             focus:shadow-[0_0_0_3px_var(--primary-soft)]
                             transition-[border-color,box-shadow] duration-150"
                  autoFocus
                />
              </div>
            </div>

            <div className="max-h-60 overflow-y-auto p-1">
              {loading ? (
                <div className="px-3 py-6 text-center text-body-sm text-text-secondary">
                  در حال بارگذاری…
                </div>
              ) : filteredOptions.length === 0 ? (
                <div className="px-3 py-6 text-center text-body-sm text-text-secondary">
                  نتیجه‌ای یافت نشد
                </div>
              ) : (
                filteredOptions.map((opt) => {
                  const selected = value === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                        setSearch("");
                      }}
                      // No divider between rows: the hover tint already
                      // separates them, and a line under every option in a
                      // sixty-row list reads as a table.
                      className={`w-full flex items-start justify-between gap-2 text-right
                                  px-3 py-2 rounded-field text-body-sm transition-colors cursor-pointer ${
                                    selected
                                      ? "bg-primary-soft text-primary font-bold"
                                      : "text-text-primary hover:bg-surface-alt"
                                  }`}
                    >
                      <span className="min-w-0">
                        {opt.label}
                        {opt.subLabel && (
                          <span className="block text-body-xs font-normal text-text-secondary mt-0.5">
                            {opt.subLabel}
                          </span>
                        )}
                      </span>
                      {selected && (
                        <CheckIcon className="w-4 h-4 shrink-0 mt-0.5" />
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {error && <p className="mt-1.5 text-body-xs text-danger">{error}</p>}
    </div>
  );
}
