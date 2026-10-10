import { useEffect, useState } from "react";
import { getWarehouses } from "../api";
import type { Warehouse } from "../types/api";

const CHANGED = "dofixo:warehouses-changed";

/**
 * Tells every mounted `useWarehouses` to ask again — the warehouses page
 * calls it after a create, a rename, a retirement or a new default. The
 * sidebar is one of them: its «انتقال بین انبارها» entry exists only while
 * two warehouses are active (14.16), and must appear the moment the second
 * is added rather than on the next reload.
 */
export function notifyWarehousesChanged() {
  window.dispatchEvent(new Event(CHANGED));
}

/**
 * The workspace's warehouses, for a picker (14.11).
 *
 * `showPicker` is the rule that keeps a one-warehouse shop from ever seeing
 * the concept: a picker appears only once there are two active warehouses —
 * or when the document being edited already sits in one that is not the
 * single active one, so its warehouse is never silently hidden.
 *
 * `enabled` defers the request until the form is actually open: several
 * forms stay mounted while closed, and each would otherwise ask on mount.
 */
export function useWarehouses(
  selected: number | null = null,
  enabled: boolean = true,
) {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(CHANGED, bump);
    return () => window.removeEventListener(CHANGED, bump);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    getWarehouses()
      .then((res) => {
        if (!cancelled) setWarehouses(res.data);
      })
      // A failed list only means no picker: the server files the document
      // in the default warehouse, which is what a missing choice means.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  const active = warehouses.filter((w) => w.is_active);
  const defaultWarehouse = warehouses.find((w) => w.is_default) ?? null;
  const showPicker =
    active.length > 1 ||
    (selected !== null && !active.some((w) => w.id === selected));

  // The active ones, plus the selected one if it has since been retired —
  // an invoice keeps showing where it was filed.
  const options = warehouses.filter((w) => w.is_active || w.id === selected);

  return { warehouses, options, defaultWarehouse, showPicker };
}
