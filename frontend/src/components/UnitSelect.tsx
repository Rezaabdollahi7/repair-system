import { useState } from "react";
import { rememberUnit, useUnits } from "../utils/units";

const NEW_UNIT = "__new__";

interface UnitSelectProps {
  value: string;
  onChange: (unit: string) => void;
  id?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

/**
 * Which unit something is counted in, with a way to add one the list does
 * not have — «حلقه» for tape, «شاخه» for pipe, «جفت» for hinges.
 *
 * The list is the defaults plus every unit the shop has already used; the
 * last option turns the field into a text box. A unit is only text on the
 * item, so naming it here is all «adding» it takes: it is offered in every
 * picker on the page at once, and to the whole shop after the item is saved.
 * A value that is in no list — an item saved with an odd unit — is kept as an
 * option rather than silently replaced.
 */
export default function UnitSelect({
  value,
  onChange,
  id,
  className,
  disabled,
  "aria-label": ariaLabel,
}: UnitSelectProps) {
  const units = useUnits();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");

  const options = value && !units.includes(value) ? [...units, value] : units;

  const confirm = () => {
    const name = draft.trim().slice(0, 20);
    if (name) {
      rememberUnit(name);
      onChange(name);
    }
    setDraft("");
    setAdding(false);
  };

  if (adding) {
    return (
      <div className="flex gap-1.5">
        <input
          id={id}
          type="text"
          value={draft}
          maxLength={20}
          autoFocus
          disabled={disabled}
          aria-label="نام واحد جدید"
          placeholder="مثلاً: حلقه"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter adds the unit rather than submitting the whole form.
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setAdding(false);
            }
          }}
          className={`${className ?? ""} min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={confirm}
          disabled={!draft.trim()}
          className="shrink-0 px-3 rounded-field bg-primary text-primary-fg text-body-sm font-bold disabled:opacity-50 cursor-pointer"
        >
          افزودن
        </button>
        <button
          type="button"
          onClick={() => setAdding(false)}
          aria-label="انصراف از واحد جدید"
          className="shrink-0 px-2 rounded-field border border-border text-text-secondary text-body-sm cursor-pointer hover:bg-surface-alt"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => {
        if (e.target.value === NEW_UNIT) setAdding(true);
        else onChange(e.target.value);
      }}
      className={className}
    >
      {options.map((unit) => (
        <option key={unit} value={unit}>
          {unit}
        </option>
      ))}
      <option value={NEW_UNIT}>+ واحد جدید…</option>
    </select>
  );
}
