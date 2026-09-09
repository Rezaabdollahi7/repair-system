import { lineItemTypeOf } from "../utils/lineItemType";

/**
 * The type chip on an invoice line.
 *
 * Deliberately not `StatusPill`. That pill carries a dot ahead of its label,
 * and these sit in a one-of-twelve grid column beside the line's own fields —
 * around fifty pixels on a phone, where a dot plus «دلخواه» does not fit and
 * the pill wraps mid-row. So this is the same tint, at the density the column
 * allows, with the word doing the work the dot does elsewhere.
 */
export default function LineItemTypeChip({ type }: { type: string }) {
  const { label, color } = lineItemTypeOf(type);

  return (
    <span
      className="inline-block rounded-pill border px-1.5 py-0.5 text-body-xs
                 font-bold whitespace-nowrap text-text-primary"
      style={{
        backgroundColor: `color-mix(in oklab, ${color} 14%, var(--surface))`,
        borderColor: `color-mix(in oklab, ${color} 32%, var(--surface))`,
      }}
    >
      {label}
    </span>
  );
}
