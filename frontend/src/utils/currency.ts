import { useSyncExternalStore } from "react";

/**
 * The unit a workshop reads money in — a setting (settings.currency_unit),
 * تومان by default.
 *
 * ⚠️ Display only. Every amount the API sends and takes is in rials, and
 * stays in rials: this module is the one place that divides by ten on the
 * way to the screen (formatPersianCurrency, formatPersianCompact) and
 * multiplies back on the way in (MoneyInput). Nothing else converts. A page
 * that did its own «/ 10» would print a tenth of the figure for a shop that
 * reads rials.
 *
 * Module state rather than a context, so formatters can read it without
 * every caller passing it down. CurrencyGate (in the layout) sets it from
 * the settings before the pages render, and remounts them when it changes,
 * which is what makes a plain function read here safe during render.
 *
 * Dofixo's own prices — the subscription, the SMS wallet — are not the
 * shop's money and are always in تومان; those pages do not use this.
 */

export type CurrencyUnit = "toman" | "rial";

let unit: CurrencyUnit = "toman";
const listeners = new Set<() => void>();

export function currencyUnit(): CurrencyUnit {
  return unit;
}

export function setCurrencyUnit(next: CurrencyUnit): void {
  if (next === unit) return;
  unit = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCurrencyUnit(): CurrencyUnit {
  return useSyncExternalStore(subscribe, currencyUnit);
}

/** «تومان» or «ریال», for a label beside an amount or in a heading. */
export function currencyLabel(): string {
  return unit === "toman" ? "تومان" : "ریال";
}

/** How many rials one shown unit is. */
function factor(): number {
  return unit === "toman" ? 10 : 1;
}

/** A stored amount, in rials, as the number the screen shows. */
export function fromRials(rials: number): number {
  return rials / factor();
}

/** A number typed in the shown unit, as the rials the API takes. */
export function toRials(shown: number): number {
  return Math.round(shown * factor());
}

/**
 * Places after the decimal point a money field accepts: one in تومان, so a
 * stored ۱۲٬۳۴۵ ریال reads ۱٬۲۳۴٫۵ تومان and saves back unchanged, none in
 * ریال.
 */
export function moneyDecimals(): number {
  return unit === "toman" ? 1 : 0;
}
