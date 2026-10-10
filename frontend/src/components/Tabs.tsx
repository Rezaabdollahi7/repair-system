import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { spring } from "../motion";
import { toPersianDigits } from "../utils/formatters";

type IconComponent = React.ComponentType<{ className?: string }>;

export interface TabItem<T extends string> {
  id: T;
  label: string;
  /** A count beside the label — «کاردکس ۱۲» — or nothing when undefined. */
  count?: number;
  icon?: IconComponent;
}

interface TabsProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** What the set of tabs is, for a screen reader: «بخش‌های صفحه‌ی کالا». */
  ariaLabel: string;
  /**
   * Prefixes the ids that join each tab to its panel, and names the
   * sliding underline — two tab sets on one page need different ones.
   */
  idPrefix: string;
  className?: string;
}

/** The id a tab's button carries; its panel points back at it. */
const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
/** The id a tab's panel carries; its button points at it. */
const panelId = (prefix: string, id: string) => `${prefix}-panel-${id}`;

/**
 * A row of tabs (14.17) — the codebase had none, and the item page (14.18)
 * is the first screen with more sections than one scroll should hold.
 *
 * Follows the WAI-ARIA tabs pattern: one tab in the page's Tab order (the
 * selected one), arrow keys move between them and select as they go, Home
 * and End jump to the ends. The arrows follow the reading direction — in
 * this right-to-left app ← is «next» — read from the element rather than
 * assumed, so the component is right in an LTR island too.
 *
 * On a phone the row scrolls sideways rather than wrapping, and the
 * selected tab is scrolled into view: five labels do not fit in 390px, and
 * a wrapped second row reads as a second set of tabs.
 */
export default function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  ariaLabel,
  idPrefix,
  className = "",
}: TabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    const selected = list?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!list || !selected) return;
    // Sideways only, by measurement: scrollIntoView would also scroll the
    // page to the tabs, which on a deep link to `?tab=…` is a jump nobody
    // asked for. Rectangles rather than scrollLeft, whose sign RTL flips.
    const bounds = list.getBoundingClientRect();
    const tab = selected.getBoundingClientRect();
    const margin = 16;
    if (tab.left < bounds.left) {
      list.scrollBy({ left: tab.left - bounds.left - margin });
    } else if (tab.right > bounds.right) {
      list.scrollBy({ left: tab.right - bounds.right + margin });
    }
  }, [value]);

  const focusTab = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    onChange(tab.id);
    document.getElementById(tabId(idPrefix, tab.id))?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    const rtl =
      listRef.current !== null &&
      getComputedStyle(listRef.current).direction === "rtl";
    const next = rtl ? "ArrowLeft" : "ArrowRight";
    const previous = rtl ? "ArrowRight" : "ArrowLeft";

    if (e.key === next) focusTab(index + 1);
    else if (e.key === previous) focusTab(index - 1);
    else if (e.key === "Home") focusTab(0);
    else if (e.key === "End") focusTab(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`flex overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            id={tabId(idPrefix, tab.id)}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={panelId(idPrefix, tab.id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`relative shrink-0 flex items-center gap-2 px-4 py-3 text-body-sm font-bold whitespace-nowrap cursor-pointer transition-colors ${
              selected
                ? "text-text-primary"
                : "text-text-secondary hover:text-text-primary"
            }`}
          >
            {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={`min-w-[1.5rem] px-1.5 py-0.5 rounded-pill text-body-xs tabular-nums text-center ${
                  selected
                    ? "bg-primary text-primary-fg"
                    : "bg-surface-alt text-text-secondary"
                }`}
              >
                {toPersianDigits(tab.count)}
              </span>
            )}
            {selected && (
              // One element that slides between tabs rather than one per
              // tab fading in and out: the eye follows where it went.
              <motion.span
                layoutId={`${idPrefix}-indicator`}
                transition={spring}
                className="absolute inset-x-2 -bottom-px h-0.5 rounded-pill bg-primary"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  idPrefix: string;
  id: string;
  /** Rendered only while selected: a hidden kardex need not load. */
  active: boolean;
  children: React.ReactNode;
  className?: string;
}

/** The content under one tab, joined to its button for a screen reader. */
export function TabPanel({
  idPrefix,
  id,
  active,
  children,
  className = "",
}: TabPanelProps) {
  if (!active) return null;
  return (
    <div
      role="tabpanel"
      id={panelId(idPrefix, id)}
      aria-labelledby={tabId(idPrefix, id)}
      // Reachable by Tab when the panel opens with no focusable content of
      // its own — the pattern's advice, and harmless when it has some.
      tabIndex={0}
      className={`focus-visible:outline-none ${className}`}
    >
      {children}
    </div>
  );
}
