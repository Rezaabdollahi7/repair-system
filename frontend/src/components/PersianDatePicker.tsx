import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ChevronRightIcon,
  ChevronLeftIcon,
  CalendarDaysIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { toJalaali, toGregorian, jalaaliMonthLength } from "jalaali-js";
import { transition } from "../motion";
import { toPersianDigits } from "../utils/formatters";

/**
 * A Jalali date that may be absent: every field is null when the input was
 * empty or unparseable, which the render path checks for.
 */
interface MaybeJalaali {
  jy: number | null;
  jm: number | null;
  jd: number | null;
}

function gregorianToJalali(dateStr: string | null | undefined): MaybeJalaali {
  if (!dateStr) return { jy: null, jm: null, jd: null };

  // The API returns full ISO timestamps ("2026-01-15T10:30:00.000Z"), not
  // bare dates. Splitting the whole string on "-" left NaN as the day and
  // produced a nonsensical Jalali year.
  //
  // Read through Date so the calendar shows the day as it fell in the user's
  // own timezone: a record saved at 02:00 in Tehran is the previous day in
  // UTC, and taking the raw date part would show it a day early.
  const local = new Date(dateStr);
  if (Number.isNaN(local.getTime())) {
    return { jy: null, jm: null, jd: null };
  }

  return toJalaali(local.getFullYear(), local.getMonth() + 1, local.getDate());
}

function jalaliToGregorian(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

const MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

const DAY_NAMES = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function firstDayOfJalaliMonth(jy: number, jm: number): number {
  const { gy, gm, gd } = toGregorian(jy, jm, 1);
  const date = new Date(gy, gm - 1, gd);
  return (date.getDay() + 1) % 7;
}

// view modes
const VIEW_DAYS = "days";
const VIEW_MONTHS = "months";
const VIEW_YEARS = "years";

type ViewMode = typeof VIEW_DAYS | typeof VIEW_MONTHS | typeof VIEW_YEARS;

/** Years shown per page in the year grid. */
const YEAR_PAGE_SIZE = 12;

interface PersianDatePickerProps {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
  clearable?: boolean;
}

export default function PersianDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
}: PersianDatePickerProps) {
  const today = toJalaali(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate(),
  );

  const parsed = gregorianToJalali(value);
  const initYear = parsed.jy || today.jy;
  const initMonth = parsed.jm || today.jm;

  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(VIEW_DAYS);
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  // Start of the year page currently shown.
  const [yearRangeStart, setYearRangeStart] = useState(
    initYear - (initYear % YEAR_PAGE_SIZE),
  );

  const ref = useRef<HTMLDivElement>(null);

  // Follow the value the parent holds.
  useEffect(() => {
    const p = gregorianToJalali(value);
    if (p.jy !== null && p.jm !== null) {
      setViewYear(p.jy);
      setViewMonth(p.jm);
    }
  }, [value]);

  // Close on an outside click.
  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setViewMode(VIEW_DAYS);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  // ── navigation ──────────────────────────────────────────
  function prevMonth() {
    if (viewMonth === 1) {
      setViewMonth(12);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) {
      setViewMonth(1);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  }

  function selectDay(jd: number) {
    onChange(jalaliToGregorian(viewYear, viewMonth, jd));
    setOpen(false);
    setViewMode(VIEW_DAYS);
  }

  function selectMonth(mIndex: number) {
    setViewMonth(mIndex + 1);
    setViewMode(VIEW_DAYS);
  }

  function selectYear(y: number) {
    setViewYear(y);
    // Month next, so picking a year does not close the calendar on a date
    // the user never chose.
    setViewMode(VIEW_MONTHS);
  }

  function clearValue(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
  }

  const daysInMonth = jalaaliMonthLength(viewYear, viewMonth);
  const firstDay = firstDayOfJalaliMonth(viewYear, viewMonth);
  const selectedJalali = gregorianToJalali(value);

  const isSelected = (jd: number) =>
    selectedJalali.jy === viewYear &&
    selectedJalali.jm === viewMonth &&
    selectedJalali.jd === jd;

  const isToday = (jd: number) =>
    today.jy === viewYear && today.jm === viewMonth && today.jd === jd;

  // Persian-digit like every other date the app prints. The calendar cells
  // were converted; the field showing the chosen date was still Latin, so
  // picking ۱۷ put "17" in the box.
  const displayValue = value
    ? toPersianDigits(
        `${selectedJalali.jy}/${String(selectedJalali.jm).padStart(2, "0")}/${String(selectedJalali.jd).padStart(2, "0")}`,
      )
    : "";

  const yearList = Array.from(
    { length: YEAR_PAGE_SIZE },
    (_, i) => yearRangeStart + i,
  );

  return (
    <div ref={ref} className="relative">
      {/* Display input */}
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          setViewMode(VIEW_DAYS);
        }}
        className="w-full flex justify-between items-center gap-2 rounded-field border border-border
                   px-3.5 py-2.5 text-body-sm bg-surface text-right cursor-pointer
                   hover:border-border-strong focus:outline-none focus:border-primary
                   focus:shadow-[0_0_0_3px_var(--primary-soft)]
                   transition-[border-color,box-shadow] duration-150"
      >
        <span
          className={`truncate ${displayValue ? "text-text-primary" : "text-text-muted"}`}
        >
          {displayValue || placeholder}
        </span>
        {value ? (
          <span
            role="button"
            tabIndex={-1}
            aria-label="پاک کردن تاریخ"
            onClick={clearValue}
            className="shrink-0 p-0.5 rounded-md text-text-muted hover:text-danger transition-colors cursor-pointer"
          >
            <XMarkIcon className="w-4 h-4" />
          </span>
        ) : (
          <CalendarDaysIcon className="w-4 h-4 shrink-0 text-text-muted" />
        )}
      </button>

      {/* Calendar popover */}
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition.fast}
          className="absolute z-50 mt-1.5 bg-surface border border-border rounded-card shadow-lg p-3 w-72"
          dir="rtl"
        >
          {/* Day view */}
          {viewMode === VIEW_DAYS && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-field text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>

                {/* Clicking month or year switches view */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode(VIEW_MONTHS)}
                    className="text-body-sm font-bold text-text-primary hover:text-primary hover:bg-primary-soft px-2 py-1 rounded-field transition-colors cursor-pointer"
                  >
                    {MONTH_NAMES[viewMonth - 1]}
                  </button>
                  <button
                    onClick={() => {
                      setYearRangeStart(viewYear - (viewYear % YEAR_PAGE_SIZE));
                      setViewMode(VIEW_YEARS);
                    }}
                    className="text-body-sm font-bold text-text-primary hover:text-primary hover:bg-primary-soft px-2 py-1 rounded-field transition-colors cursor-pointer"
                  >
                    {toPersianDigits(viewYear)}
                  </button>
                </div>

                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-field text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Day names */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className="text-center text-body-xs font-bold text-text-muted py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Days */}
              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                  (jd) => (
                    <button
                      key={jd}
                      onClick={() => selectDay(jd)}
                      className={`text-center text-body-sm py-1.5 rounded-field
                        transition-colors cursor-pointer
                        ${isSelected(jd) ? "bg-primary text-primary-fg font-bold" : ""}
                        ${isToday(jd) && !isSelected(jd) ? "ring-1 ring-inset ring-primary text-primary font-bold" : ""}
                        ${!isSelected(jd) ? "hover:bg-surface-alt text-text-primary" : ""}`}
                    >
                      {toPersianDigits(jd)}
                    </button>
                  ),
                )}
              </div>
            </>
          )}

          {/* Month view */}
          {viewMode === VIEW_MONTHS && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => {
                    setYearRangeStart(viewYear - (viewYear % YEAR_PAGE_SIZE));
                    setViewMode(VIEW_YEARS);
                  }}
                  className="p-1.5 rounded-field text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setYearRangeStart(viewYear - (viewYear % YEAR_PAGE_SIZE));
                    setViewMode(VIEW_YEARS);
                  }}
                  className="text-body-sm font-bold text-text-primary hover:text-primary hover:bg-primary-soft px-2 py-1 rounded-field transition-colors cursor-pointer"
                >
                  {toPersianDigits(viewYear)}
                </button>
                <button
                  onClick={() => setViewMode(VIEW_DAYS)}
                  className="p-1.5 rounded-field text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {MONTH_NAMES.map((name, i) => {
                  const isCurrentMonth =
                    selectedJalali.jy === viewYear &&
                    selectedJalali.jm === i + 1;
                  const isTodayMonth =
                    today.jy === viewYear && today.jm === i + 1;
                  return (
                    <button
                      key={name}
                      onClick={() => selectMonth(i)}
                      className={`text-body-sm py-2 rounded-field transition-colors cursor-pointer
                        ${isCurrentMonth ? "bg-primary text-primary-fg font-bold" : ""}
                        ${isTodayMonth && !isCurrentMonth ? "ring-1 ring-inset ring-primary text-primary font-bold" : ""}
                        ${!isCurrentMonth ? "hover:bg-surface-alt text-text-primary" : ""}`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* Year view */}
          {viewMode === VIEW_YEARS && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setYearRangeStart((s) => s + YEAR_PAGE_SIZE)}
                  className="p-1.5 rounded-field text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronRightIcon className="w-4 h-4" />
                </button>
                <span className="text-body-sm font-bold text-text-primary">
                  {toPersianDigits(yearRangeStart)} –{" "}
                  {toPersianDigits(yearRangeStart + YEAR_PAGE_SIZE - 1)}
                </span>
                <button
                  onClick={() => setYearRangeStart((s) => s - YEAR_PAGE_SIZE)}
                  className="p-1.5 rounded-field text-text-secondary hover:bg-surface-alt hover:text-text-primary transition-colors cursor-pointer"
                >
                  <ChevronLeftIcon className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {yearList.map((y) => {
                  const isSelectedYear = selectedJalali.jy === y;
                  const isTodayYear = today.jy === y;
                  return (
                    <button
                      key={y}
                      onClick={() => selectYear(y)}
                      className={`text-body-sm py-2 rounded-field transition-colors cursor-pointer
                        ${isSelectedYear ? "bg-primary text-primary-fg font-bold" : ""}
                        ${isTodayYear && !isSelectedYear ? "ring-1 ring-inset ring-primary text-primary font-bold" : ""}
                        ${!isSelectedYear ? "hover:bg-surface-alt text-text-primary" : ""}`}
                    >
                      {toPersianDigits(y)}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>
      )}
    </div>
  );
}
