import { useState } from "react";

/** Persian and Arabic-Indic digits, and the Persian decimal separator. */
function normalizeDigits(text: string): string {
  return text
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, ".");
}

const WHOLE = /^\d*$/;
// Three places, the most the columns hold (14.1).
const FRACTION = /^\d*(\.\d{0,3})?$/;

function parse(text: string): number {
  const value = Number(text);
  return text === "" || text === "." || isNaN(value) ? 0 : value;
}

interface QuantityInputProps {
  value: number;
  onChange: (value: number) => void;
  /** The item's own setting. A whole-number item takes no decimal point. */
  fractional: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  placeholder?: string;
}

/**
 * A quantity field that takes «۰٫۴» as readily as «0.4» (14.11).
 *
 * Text rather than type="number": a number input bound to a number cannot
 * hold «0.» on the way to «0.4» — the half-typed value parses to zero and the
 * caret jumps — and it refuses Persian digits from a Persian keyboard, which
 * is the keyboard this app's users type on. The text is kept here; the parent
 * only ever sees the number. A keystroke that would make the text something
 * other than a quantity (a letter, a fourth decimal, any decimal on a
 * whole-number item) is simply not taken.
 */
export default function QuantityInput({
  value,
  onChange,
  fractional,
  className,
  id,
  disabled,
  placeholder,
  "aria-label": ariaLabel,
}: QuantityInputProps) {
  const [text, setText] = useState(value ? String(value) : "");
  const [seen, setSeen] = useState(value);

  // The parent changed the value itself — a line reset, an invoice loaded.
  // Adjusted during render rather than in an effect, as React recommends
  // for state derived from a prop.
  if (value !== seen) {
    setSeen(value);
    if (parse(text) !== value) setText(value ? String(value) : "");
  }

  return (
    <input
      id={id}
      type="text"
      inputMode={fractional ? "decimal" : "numeric"}
      dir="ltr"
      autoComplete="off"
      value={text}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        const next = normalizeDigits(e.target.value.trim());
        if (!(fractional ? FRACTION : WHOLE).test(next)) return;
        setText(next);
        const parsed = parse(next);
        setSeen(parsed);
        onChange(parsed);
      }}
      className={className}
    />
  );
}
