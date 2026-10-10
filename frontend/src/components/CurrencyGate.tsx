import { Fragment, useEffect, useState, type ReactNode } from "react";
import { getSettings } from "../api";
import { setCurrencyUnit, useCurrencyUnit } from "../utils/currency";

/**
 * Holds the pages back until the shop's money unit is known, then renders
 * them keyed on it.
 *
 * Two things depend on that. A page printed before the setting arrived
 * would show rials as tomans for a moment — the same digits, worth ten
 * times less — which is worse than a blank beat. And the formatters read the
 * unit as plain module state (utils/currency), so when it changes, from the
 * settings page, the key remounts everything below and every figure is
 * printed again in the new unit.
 */
export default function CurrencyGate({ children }: { children: ReactNode }) {
  const unit = useCurrencyUnit();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getSettings()
      .then((res) => setCurrencyUnit(res.data.currency_unit ?? "toman"))
      // Unreachable settings means an unreachable API: the page will say
      // so itself. Tomans, the default, until then.
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  if (!ready) return null;
  return <Fragment key={unit}>{children}</Fragment>;
}
