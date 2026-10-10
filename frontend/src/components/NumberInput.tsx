import { useLayoutEffect, useRef, useState } from "react";

const PERSIAN_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

/** Persian and Arabic-Indic digits to Latin; everything else unchanged. */
function toLatinDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660));
}

function toPersian(text: string): string {
  return text.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/**
 * What the user typed, as the canonical Latin text the field keeps: digits,
 * and at most one «.». Thousands separators of every spelling are dropped;
 * the Persian decimal «٫» and a Latin «.» both mean the decimal point. A
 * comma is a thousands separator here, never a decimal — it is what the
 * field itself prints between groups, so it has to read back as nothing.
 */
function canonical(typed: string): string {
  return toLatinDigits(typed)
    .replace(/[,٬\s‌‏‎]/g, "")
    .replace(/٫/g, ".");
}

/** «1234567.5» → «۱,۲۳۴,۵۶۷٫۵», as formatPersianCurrency prints money. */
function display(text: string, separators: boolean): string {
  if (text === "") return "";
  const [whole, fraction] = text.split(".");
  const grouped = separators
    ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")
    : whole;
  return toPersian(text.includes(".") ? `${grouped}٫${fraction}` : grouped);
}

/** A character that counts towards the caret: a digit or the decimal point. */
const COUNTED = /[0-9۰-۹٠-٩.٫]/;

function countedBefore(text: string, position: number): number {
  let count = 0;
  for (let i = 0; i < position && i < text.length; i++) {
    if (COUNTED.test(text[i])) count++;
  }
  return count;
}

function positionAfter(text: string, counted: number): number {
  if (counted <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (COUNTED.test(text[i])) seen++;
    if (seen === counted) return i + 1;
  }
  return text.length;
}

export interface NumberInputProps {
  value: number | null;
  onChange: (value: number | null) => void;
  /** Places after the decimal point the field accepts; 0 for money. */
  decimals?: number;
  /** Groups of three with «,». Off for a tax rate or a number of months. */
  separators?: boolean;
  /**
   * Shows 0 as an empty field with a «۰» placeholder — the default. A field
   * that shows «۰» invites typing around it: a click lands the caret before
   * the zero and «۱۰۰۰۰۰۰» becomes ۱۰٬۰۰۰٬۰۰۰. Off only where 0 and empty
   * must read differently (a stock count's line).
   */
  zeroAsEmpty?: boolean;
  /** Text alignment; right by default, as everything else in an RTL form. */
  align?: "right" | "center" | "left";
  id?: string;
  name?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Every number a person types into this app — prices, payments, quantities
 * (through QuantityInput), rates — goes through this field.
 *
 * It shows what the tables show: Persian digits, grouped in threes with
 * «,», the decimal as «٫». It takes Persian, Arabic-Indic or Latin digits,
 * whichever keyboard is up, and a pasted «1,200,000» as readily as a typed
 * «۱۲۰۰۰۰۰». A keystroke that would make it something other than a number
 * (a letter, a second decimal point, a decimal where none is allowed) is not
 * taken.
 *
 * Text rather than type="number": a number input cannot show separators or
 * Persian digits, and bound to a number it cannot hold «۲٫» on the way to
 * «۲٫۵». The canonical text lives here; the parent only ever sees a number,
 * or null for an empty field. When the separators move as the user types,
 * the caret is put back after the same digit it was after, rather than
 * jumping to the end.
 */
export default function NumberInput({
  value,
  onChange,
  decimals = 0,
  separators = true,
  zeroAsEmpty = true,
  align = "right",
  id,
  name,
  className,
  placeholder,
  disabled,
  required,
  autoFocus,
  "aria-label": ariaLabel,
  "aria-invalid": ariaInvalid,
  onBlur,
  onKeyDown,
}: NumberInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const caret = useRef<number | null>(null);

  const fromValue = (next: number | null) =>
    next === null || Number.isNaN(next) || (zeroAsEmpty && next === 0)
      ? ""
      : String(next);
  const toValue = (text: string): number | null =>
    text === "" || text === "." ? null : Number(text);

  const [text, setText] = useState(() => fromValue(value));
  const [seen, setSeen] = useState<number | null>(value);

  // The parent changed the value itself — a line reset, an invoice loaded.
  // Adjusted during render, as React recommends for state derived from a
  // prop; a value the field itself just reported is left alone, so «۲٫» is
  // not rewritten to «۲» while the user is still typing.
  if (value !== seen) {
    setSeen(value);
    if (toValue(text) !== value) setText(fromValue(value));
  }

  const shown = display(text, separators);

  useLayoutEffect(() => {
    if (caret.current === null || !inputRef.current) return;
    const position = positionAfter(shown, caret.current);
    inputRef.current.setSelectionRange(position, position);
    caret.current = null;
  }, [shown]);

  const pattern =
    decimals > 0 ? new RegExp(`^\\d*(\\.\\d{0,${decimals}})?$`) : /^\d*$/;

  return (
    <input
      ref={inputRef}
      id={id}
      name={name}
      type="text"
      inputMode={decimals > 0 ? "decimal" : "numeric"}
      dir="ltr"
      autoComplete="off"
      value={shown}
      disabled={disabled}
      required={required}
      autoFocus={autoFocus}
      placeholder={placeholder ?? (zeroAsEmpty ? "۰" : undefined)}
      aria-label={ariaLabel}
      aria-invalid={ariaInvalid}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const typed = e.target.value;
        const position = e.target.selectionStart ?? typed.length;
        let before = countedBefore(typed, position);
        let next = canonical(typed);
        // Backspace over a separator removes only the «,», which the field
        // would put straight back — so take the digit before it instead, as
        // a person pressing backspace there means.
        if (next === text && typed.length < shown.length && before > 0) {
          next = next.slice(0, before - 1) + next.slice(before);
          before -= 1;
        }
        if (!pattern.test(next)) return;
        // «007» → «7», but «0.5» stays — the zero before a point is a digit.
        next = next.replace(/^0+(?=\d)/, "");
        caret.current = before;
        setText(next);
        const parsed = toValue(next);
        setSeen(parsed);
        onChange(parsed);
      }}
      style={{ textAlign: align }}
      className={className}
    />
  );
}
