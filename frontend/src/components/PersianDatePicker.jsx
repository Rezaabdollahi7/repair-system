// src/components/PersianDatePicker.jsx
import { useState, useRef, useEffect } from "react";
import { ChevronRightIcon, ChevronLeftIcon } from "@heroicons/react/24/outline";
import { toJalaali, toGregorian, jalaaliMonthLength } from "jalaali-js";

function gregorianToJalali(dateStr) {
  if (!dateStr) return { jy: null, jm: null, jd: null };
  const [y, m, d] = dateStr.split("-").map(Number);
  return toJalaali(y, m, d);
}

function jalaliToGregorian(jy, jm, jd) {
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

function firstDayOfJalaliMonth(jy, jm) {
  const { gy, gm, gd } = toGregorian(jy, jm, 1);
  const date = new Date(gy, gm - 1, gd);
  return (date.getDay() + 1) % 7;
}

// view modes
const VIEW_DAYS = "days";
const VIEW_MONTHS = "months";
const VIEW_YEARS = "years";

const YEAR_PAGE_SIZE = 12; // تعداد سال در هر صفحه

export default function PersianDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
}) {
  const today = toJalaali(
    new Date().getFullYear(),
    new Date().getMonth() + 1,
    new Date().getDate(),
  );

  const parsed = gregorianToJalali(value);
  const initYear = parsed.jy || today.jy;
  const initMonth = parsed.jm || today.jm;

  const [open, setOpen] = useState(false);
  const [viewMode, setViewMode] = useState(VIEW_DAYS);
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  // صفحه اول سال‌های نمایش‌داده‌شده
  const [yearRangeStart, setYearRangeStart] = useState(
    initYear - (initYear % YEAR_PAGE_SIZE),
  );

  const ref = useRef(null);

  // sync با value بیرونی
  useEffect(() => {
    const p = gregorianToJalali(value);
    if (p.jy) {
      setViewYear(p.jy);
      setViewMonth(p.jm);
    }
  }, [value]);

  // بستن با کلیک بیرون
  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) {
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

  // ── انتخاب روز ─────────────────────────────────────────
  function selectDay(jd) {
    onChange(jalaliToGregorian(viewYear, viewMonth, jd));
    setOpen(false);
    setViewMode(VIEW_DAYS);
  }

  // ── انتخاب ماه ─────────────────────────────────────────
  function selectMonth(mIndex) {
    setViewMonth(mIndex + 1);
    setViewMode(VIEW_DAYS);
  }

  // ── انتخاب سال ─────────────────────────────────────────
  function selectYear(y) {
    setViewYear(y);
    setViewMode(VIEW_MONTHS); // بعد از انتخاب سال، ماه را انتخاب کن
  }

  // ── پاک کردن ───────────────────────────────────────────
  function clearValue(e) {
    e.stopPropagation();
    onChange("");
  }

  // ── محاسبات روزها ───────────────────────────────────────
  const daysInMonth = jalaaliMonthLength(viewYear, viewMonth);
  const firstDay = firstDayOfJalaliMonth(viewYear, viewMonth);
  const selectedJalali = gregorianToJalali(value);

  const isSelected = (jd) =>
    selectedJalali.jy === viewYear &&
    selectedJalali.jm === viewMonth &&
    selectedJalali.jd === jd;

  const isToday = (jd) =>
    today.jy === viewYear && today.jm === viewMonth && today.jd === jd;

  // ── مقدار نمایشی input ──────────────────────────────────
  const displayValue = value
    ? `${selectedJalali.jy}/${String(selectedJalali.jm).padStart(2, "0")}/${String(selectedJalali.jd).padStart(2, "0")}`
    : "";

  // ── سال‌های صفحه جاری ───────────────────────────────────
  const yearList = Array.from(
    { length: YEAR_PAGE_SIZE },
    (_, i) => yearRangeStart + i,
  );

  return (
    <div ref={ref} className="relative">
      {/* ── Input نمایشی ── */}
      <button
        type="button"
        onClick={() => {
          setOpen((p) => !p);
          setViewMode(VIEW_DAYS);
        }}
        className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-surface text-right flex justify-between items-center hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <span
          className={displayValue ? "text-text-primary" : "text-text-secondary"}
        >
          {displayValue || placeholder}
        </span>
        {value ? (
          <span
            onClick={clearValue}
            className="text-text-secondary hover:text-danger cursor-pointer text-lg leading-none"
          >
            ×
          </span>
        ) : (
          <svg
            className="w-4 h-4 text-text-secondary"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        )}
      </button>

      {/* ── پنجره تقویم ── */}
      {open && (
        <div
          className="absolute z-50 mt-1 bg-surface border border-border rounded-xl shadow-lg p-3 w-72"
          dir="rtl"
        >
          {/* ════════════════ نمایش روزها ════════════════ */}
          {viewMode === VIEW_DAYS && (
            <>
              {/* هدر */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={nextMonth}
                  className="p-1 hover:bg-surface-alt rounded-lg"
                >
                  <ChevronRightIcon className="w-4 h-4 text-text-secondary" />
                </button>

                {/* کلیک روی ماه/سال → تغییر view */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setViewMode(VIEW_MONTHS)}
                    className="text-sm font-semibold text-text-primary hover:text-primary hover:bg-primary-soft px-2 py-0.5 rounded-lg transition-colors"
                  >
                    {MONTH_NAMES[viewMonth - 1]}
                  </button>
                  <button
                    onClick={() => {
                      setYearRangeStart(viewYear - (viewYear % YEAR_PAGE_SIZE));
                      setViewMode(VIEW_YEARS);
                    }}
                    className="text-sm font-semibold text-text-primary hover:text-primary hover:bg-primary-soft px-2 py-0.5 rounded-lg transition-colors"
                  >
                    {viewYear}
                  </button>
                </div>

                <button
                  onClick={prevMonth}
                  className="p-1 hover:bg-surface-alt rounded-lg"
                >
                  <ChevronLeftIcon className="w-4 h-4 text-text-secondary" />
                </button>
              </div>

              {/* نام روزها */}
              <div className="grid grid-cols-7 mb-1">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className="text-center text-xs text-text-secondary py-1"
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* روزها */}
              <div className="grid grid-cols-7 gap-y-1">
                {Array.from({ length: firstDay }).map((_, i) => (
                  <div key={`e-${i}`} />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(
                  (jd) => (
                    <button
                      key={jd}
                      onClick={() => selectDay(jd)}
                      className={`
                      text-center text-sm py-1 rounded-lg transition-colors
                      ${isSelected(jd) ? "bg-primary text-text-inverse font-bold" : ""}
                      ${isToday(jd) && !isSelected(jd) ? "border border-primary text-primary" : ""}
                      ${!isSelected(jd) ? "hover:bg-primary-soft text-text-primary" : ""}
                    `}
                    >
                      {jd}
                    </button>
                  ),
                )}
              </div>
            </>
          )}

          {/* ════════════════ انتخاب ماه ════════════════ */}
          {viewMode === VIEW_MONTHS && (
            <>
              {/* هدر */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => {
                    setYearRangeStart(viewYear - (viewYear % YEAR_PAGE_SIZE));
                    setViewMode(VIEW_YEARS);
                  }}
                  className="p-1 hover:bg-surface-alt rounded-lg"
                >
                  <ChevronRightIcon className="w-4 h-4 text-text-secondary" />
                </button>
                <button
                  onClick={() => {
                    setYearRangeStart(viewYear - (viewYear % YEAR_PAGE_SIZE));
                    setViewMode(VIEW_YEARS);
                  }}
                  className="text-sm font-semibold text-text-primary hover:text-primary hover:bg-primary-soft px-2 py-0.5 rounded-lg transition-colors"
                >
                  {viewYear}
                </button>
                <button
                  onClick={() => setViewMode(VIEW_DAYS)}
                  className="p-1 hover:bg-surface-alt rounded-lg"
                >
                  <ChevronLeftIcon className="w-4 h-4 text-text-secondary" />
                </button>
              </div>

              {/* گرید ۱۲ ماه */}
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
                      className={`
                        text-sm py-2 rounded-lg transition-colors
                        ${isCurrentMonth ? "bg-primary text-text-inverse font-bold" : ""}
                        ${isTodayMonth && !isCurrentMonth ? "border border-primary text-primary" : ""}
                        ${!isCurrentMonth ? "hover:bg-primary-soft text-text-primary" : ""}
                      `}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ════════════════ انتخاب سال ════════════════ */}
          {viewMode === VIEW_YEARS && (
            <>
              {/* هدر */}
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setYearRangeStart((s) => s + YEAR_PAGE_SIZE)}
                  className="p-1 hover:bg-surface-alt rounded-lg"
                >
                  <ChevronRightIcon className="w-4 h-4 text-text-secondary" />
                </button>
                <span className="text-sm font-semibold text-text-primary">
                  {yearRangeStart} – {yearRangeStart + YEAR_PAGE_SIZE - 1}
                </span>
                <button
                  onClick={() => setYearRangeStart((s) => s - YEAR_PAGE_SIZE)}
                  className="p-1 hover:bg-surface-alt rounded-lg"
                >
                  <ChevronLeftIcon className="w-4 h-4 text-text-secondary" />
                </button>
              </div>

              {/* گرید ۱۲ سال */}
              <div className="grid grid-cols-3 gap-2">
                {yearList.map((y) => {
                  const isSelectedYear = selectedJalali.jy === y;
                  const isTodayYear = today.jy === y;
                  return (
                    <button
                      key={y}
                      onClick={() => selectYear(y)}
                      className={`
                        text-sm py-2 rounded-lg transition-colors
                        ${isSelectedYear ? "bg-primary text-text-inverse font-bold" : ""}
                        ${isTodayYear && !isSelectedYear ? "border border-primary text-primary" : ""}
                        ${!isSelectedYear ? "hover:bg-primary-soft text-text-primary" : ""}
                      `}
                    >
                      {y}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
