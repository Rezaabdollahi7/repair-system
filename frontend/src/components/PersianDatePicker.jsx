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
  const [viewYear, setViewYear] = useState(initYear);
  const [viewMonth, setViewMonth] = useState(initMonth);
  const ref = useRef(null);

  useEffect(() => {
    const p = gregorianToJalali(value);
    if (p.jy) {
      setViewYear(p.jy);
      setViewMonth(p.jm);
    }
  }, [value]);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

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

  function selectDay(jd) {
    const gregorian = jalaliToGregorian(viewYear, viewMonth, jd);
    onChange(gregorian);
    setOpen(false);
  }

  function clearValue(e) {
    e.stopPropagation();
    onChange("");
  }

  const daysInMonth = jalaaliMonthLength(viewYear, viewMonth);
  const firstDay = firstDayOfJalaliMonth(viewYear, viewMonth);

  const selectedJalali = gregorianToJalali(value);
  const isSelected = (jd) =>
    selectedJalali.jy === viewYear &&
    selectedJalali.jm === viewMonth &&
    selectedJalali.jd === jd;

  const isToday = (jd) =>
    today.jy === viewYear && today.jm === viewMonth && today.jd === jd;

  const displayValue = value
    ? `${selectedJalali.jy}/${String(selectedJalali.jm).padStart(2, "0")}/${String(selectedJalali.jd).padStart(2, "0")}`
    : "";

  return (
    <div ref={ref} className="relative">
      {/* input نمایشی */}
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white text-right flex justify-between items-center hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span className={displayValue ? "text-gray-800" : "text-gray-400"}>
          {displayValue || placeholder}
        </span>
        {value ? (
          <span
            onClick={clearValue}
            className="text-gray-400 hover:text-red-500 cursor-pointer text-lg leading-none"
          >
            ×
          </span>
        ) : (
          <svg
            className="w-4 h-4 text-gray-400"
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

      {/* تقویم */}
      {open && (
        <div
          className="absolute z-50 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-72"
          dir="rtl"
        >
          {/* هدر ماه */}
          <div className="flex items-center justify-between mb-3">
            <button
              onClick={nextMonth}
              className="p-1 hover:bg-gray-100 rounded-lg"
            >
              <ChevronRightIcon className="w-4 h-4 text-gray-600" />
            </button>
            <span className="text-sm font-semibold text-gray-800">
              {MONTH_NAMES[viewMonth - 1]} {viewYear}
            </span>
            <button
              onClick={prevMonth}
              className="p-1 hover:bg-gray-100 rounded-lg"
            >
              <ChevronLeftIcon className="w-4 h-4 text-gray-600" />
            </button>
          </div>

          {/* نام روزها */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 py-1">
                {d}
              </div>
            ))}
          </div>

          {/* روزها */}
          <div className="grid grid-cols-7 gap-y-1">
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((jd) => (
              <button
                key={jd}
                onClick={() => selectDay(jd)}
                className={`
                  text-center text-sm py-1 rounded-lg transition-colors
                  ${isSelected(jd) ? "bg-blue-600 text-white font-bold" : ""}
                  ${isToday(jd) && !isSelected(jd) ? "border border-blue-400 text-blue-600" : ""}
                  ${!isSelected(jd) ? "hover:bg-blue-50 text-gray-700" : ""}
                `}
              >
                {jd}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
