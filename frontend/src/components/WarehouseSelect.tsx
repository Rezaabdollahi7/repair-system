import type { Warehouse } from "../types/api";

interface WarehouseSelectProps {
  options: Warehouse[];
  /** null means «the default», which is what the server does with it too. */
  value: number | null;
  defaultWarehouse: Warehouse | null;
  onChange: (id: number) => void;
  label?: string;
  id?: string;
  className?: string;
}

const selectClass =
  "w-full border border-border-field rounded-field px-3 py-2 text-body-sm bg-surface text-text-primary hover:border-border-strong focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_var(--primary-soft)] transition-[border-color,box-shadow]";

/**
 * Which warehouse a document moves stock in (14.11). Rendered only where
 * `useWarehouses().showPicker` says so; the caller owns that decision because
 * it also owns the layout the field sits in.
 */
export default function WarehouseSelect({
  options,
  value,
  defaultWarehouse,
  onChange,
  label = "انبار",
  id = "warehouse-select",
  className,
}: WarehouseSelectProps) {
  const current = value ?? defaultWarehouse?.id ?? "";

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-body-sm font-medium text-text-primary mb-1.5"
      >
        {label}
      </label>
      <select
        id={id}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className={selectClass}
      >
        {options.map((warehouse) => (
          <option key={warehouse.id} value={warehouse.id}>
            {warehouse.name}
            {warehouse.is_default ? " (پیش‌فرض)" : ""}
            {warehouse.is_active ? "" : " (غیرفعال)"}
          </option>
        ))}
      </select>
    </div>
  );
}
