import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

/**
 * The selected tab, kept in the address as `?tab=…` — so a reload, a link
 * sent to a colleague and the browser's back button all land on the same
 * tab. Replaces the history entry rather than pushing one: back should
 * leave the page, not walk back through every tab that was looked at.
 *
 * An unknown or missing value reads as `fallback`, and is not written into
 * the address until the user picks a tab.
 */
export function useTabParam<T extends string>(
  ids: readonly T[],
  fallback: T,
  key: string = "tab",
): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get(key);
  const current = (ids as readonly string[]).includes(raw ?? "")
    ? (raw as T)
    : fallback;

  const select = useCallback(
    (id: T) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          if (id === fallback) next.delete(key);
          else next.set(key, id);
          return next;
        },
        { replace: true },
      );
    },
    [fallback, key, setParams],
  );

  return [current, select];
}
