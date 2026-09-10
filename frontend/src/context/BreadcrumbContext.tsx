import { createContext, useContext, useEffect, type ReactNode } from "react";

/**
 * How a detail page tells the shell what to call it.
 *
 * The header is the only thing that names a screen — the pages' own `<h1>`s
 * were removed — and it works out the name from the sidebar entry whose path
 * matches. That works for every page the nav lists, and not at all for
 * `/customers/:id`, where the name is the customer's and the shell cannot
 * know it.
 *
 * So the page hands it up. `parent` also makes the crumb ahead of the name a
 * real link, which is the way back to the list.
 */
export interface Crumb {
  name: string;
  parent?: { name: string; path: string };
}

interface BreadcrumbContextValue {
  crumb: Crumb | null;
  setCrumb: (crumb: Crumb | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue | null>(null);

export function BreadcrumbProvider({
  value,
  children,
}: {
  value: BreadcrumbContextValue;
  children: ReactNode;
}) {
  return (
    <BreadcrumbContext.Provider value={value}>
      {children}
    </BreadcrumbContext.Provider>
  );
}

/**
 * Publishes this page's crumb while it is mounted, and clears it on the way
 * out — otherwise the name of the customer you just left would sit in the
 * header of the page you moved to.
 *
 * `name` may be empty while the page is still loading; the shell falls back
 * to its own guess until the real one arrives.
 */
export function usePageCrumb(crumb: Crumb | null) {
  const context = useContext(BreadcrumbContext);
  const setCrumb = context?.setCrumb;

  // Serialised rather than passed as an object: callers build the crumb
  // inline, so a new object every render would loop.
  const key = crumb ? JSON.stringify(crumb) : null;

  useEffect(() => {
    if (!setCrumb) return;

    setCrumb(key ? (JSON.parse(key) as Crumb) : null);
    return () => setCrumb(null);
  }, [key, setCrumb]);
}

/** Read by the shell only. */
export function useCrumb(): Crumb | null {
  return useContext(BreadcrumbContext)?.crumb ?? null;
}
