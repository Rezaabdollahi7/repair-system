import type { StockCountStatus } from "../types/api";

/**
 * A count's three states and how each reads (14.15). A draft is work in
 * progress, not a warning — the informational tone; applied is done;
 * cancelled is set aside, muted rather than red.
 */
export const STOCK_COUNT_STATUSES: Record<
  StockCountStatus,
  { label: string; color: string; tone: string }
> = {
  draft: {
    label: "در حال شمارش",
    color: "var(--info)",
    tone: "bg-info-soft text-info-fg",
  },
  applied: {
    label: "اعمال‌شده",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
  cancelled: {
    label: "لغو‌شده",
    color: "var(--text-muted)",
    tone: "bg-surface-alt text-text-muted",
  },
};
