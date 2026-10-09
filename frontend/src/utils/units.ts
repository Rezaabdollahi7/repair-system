/**
 * The units an item can be counted in, and which of them are usually
 * measured rather than counted (14.11).
 *
 * The fractional default is only a default: a shop that sells cable by the
 * whole metre unticks it, and one that sells paste by the gram can tick it on
 * «بسته». What decides is the item's own `isFractional`, which the server
 * enforces on every movement.
 */
export const UNIT_OPTIONS = [
  { value: "عدد", label: "عدد" },
  { value: "متر", label: "متر" },
  { value: "کیلوگرم", label: "کیلوگرم" },
  { value: "بسته", label: "بسته" },
  { value: "کارتن", label: "کارتن" },
  { value: "لیتر", label: "لیتر" },
  { value: "دستگاه", label: "دستگاه" },
];

const FRACTIONAL_UNITS = new Set(["متر", "کیلوگرم", "لیتر"]);

export function isFractionalByDefault(unit: string): boolean {
  return FRACTIONAL_UNITS.has(unit.trim());
}
