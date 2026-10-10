import { useEffect, useState } from "react";
import { getItemUnits } from "../api";

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

const FRACTIONAL_UNITS = new Set([
  "متر",
  "کیلوگرم",
  "لیتر",
  "گرم",
  "سانتی‌متر",
]);

export function isFractionalByDefault(unit: string): boolean {
  return FRACTIONAL_UNITS.has(unit.trim());
}

/*
 * The units a shop has added, shared by every picker on the page. Fetched
 * once per page load; a unit added in one form is pushed here so the next
 * form offers it straight away, before any item has been saved with it.
 */
let shopUnits: string[] | null = null;
let loading: Promise<string[]> | null = null;
const listeners = new Set<(units: string[]) => void>();

function publish(units: string[]) {
  shopUnits = units;
  for (const listener of listeners) listener(units);
}

/** Records a unit the user has just named, for every picker on the page. */
export function rememberUnit(unit: string) {
  const name = unit.trim();
  if (!name) return;
  const current = shopUnits ?? [];
  if (!current.includes(name)) publish([...current, name]);
}

/**
 * The defaults, then the units this shop has used (GET /items/units), then
 * any just added — each once. A unit is the text on an item, not a row of
 * its own: the list grows with what the shop actually counts in.
 */
export function useUnits(): string[] {
  const [units, setUnits] = useState<string[]>(shopUnits ?? []);

  useEffect(() => {
    listeners.add(setUnits);
    if (shopUnits === null && loading === null) {
      loading = getItemUnits()
        .then((res) => res.data)
        // No list only means only the defaults are offered.
        .catch(() => [] as string[]);
      void loading.then((fetched) => {
        const extra = (shopUnits ?? []).filter((u) => !fetched.includes(u));
        publish([...fetched, ...extra]);
      });
    }
    return () => {
      listeners.delete(setUnits);
    };
  }, []);

  const defaults = UNIT_OPTIONS.map((option) => option.value);
  return [...defaults, ...units.filter((unit) => !defaults.includes(unit))];
}
