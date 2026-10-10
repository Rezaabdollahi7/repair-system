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

interface BaseProps {
  /** The item's own setting. A whole-number item takes no decimal point. */
  fractional: boolean;
  className?: string;
  id?: string;
  disabled?: boolean;
  "aria-label"?: string;
  placeholder?: string;
  onBlur?: () => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Two shapes. The usual one treats an empty field as zero. The nullable one
 * — a stock count's line (14.15) — keeps «not entered» apart from «0»,
 * because a counted empty shelf and a shelf nobody has counted yet are
 * different answers.
 */
type QuantityInputProps = BaseProps &
  (
    | { nullable?: false; value: number; onChange: (value: number) => void }
    | {
        nullable: true;
        value: number | null;
        onChange: (value: number | null) => void;
      }
  );

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
export default function QuantityInput(props: QuantityInputProps) {
  const {
    fractional,
    className,
    id,
    disabled,
    placeholder,
    onBlur,
    onKeyDown,
    "aria-label": ariaLabel,
  } = props;
  const nullable = props.nullable === true;

  const toText = (value: number | null) =>
    value === null ? "" : nullable ? String(value) : value ? String(value) : "";
  const fromText = (text: string): number | null =>
    text === "" || text === "."
      ? nullable
        ? null
        : 0
      : isNaN(Number(text))
        ? 0
        : Number(text);

  const [text, setText] = useState(toText(props.value));
  const [seen, setSeen] = useState<number | null>(props.value);

  // The parent changed the value itself — a line reset, an invoice loaded.
  // Adjusted during render rather than in an effect, as React recommends
  // for state derived from a prop.
  if (props.value !== seen) {
    setSeen(props.value);
    if (fromText(text) !== props.value) setText(toText(props.value));
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
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onChange={(e) => {
        const next = normalizeDigits(e.target.value.trim());
        if (!(fractional ? FRACTION : WHOLE).test(next)) return;
        setText(next);
        const parsed = fromText(next);
        setSeen(parsed);
        if (props.nullable === true) props.onChange(parsed);
        else props.onChange(parsed ?? 0);
      }}
      className={className}
    />
  );
}
