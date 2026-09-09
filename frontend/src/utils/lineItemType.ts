/**
 * The three kinds of line an invoice can carry, defined once.
 *
 * There are three of them and there were two colours. Both the repair form
 * and the repair detail modal wrote the same ternary —
 *
 *     item_type === "inventory" ? green
 *       : item_type === "service" ? "bg-primary-soft text-primary"
 *       : "bg-primary-soft text-primary"
 *
 * — with the last two branches identical, so «خدمت» and «دلخواه» were the
 * same chip. The sales form went further and collapsed the question itself,
 * printing «دلخواه» for anything that was not stock, which is right there
 * because a sale has no service line — but it meant three sites disagreeing
 * about how many types exist.
 *
 * These are an **identity**, not a severity: which of three kinds of thing is
 * on this line, with no ordering between them. So they take chart series
 * slots rather than the reserved semantic tones. `inventory` keeps the teal
 * nearest the green it had, since it is the common case and the one a shop
 * scans for — it is also the only type that moves stock.
 *
 * All three pairs were validated against the dataviz palette checks in both
 * themes; the worst is teal↔orange at ΔE 8.5 protan, and each chip carries
 * its own word, which is the secondary encoding that band requires.
 */

import { SERIES } from "./chartSeries";

export interface LineItemType {
  key: string;
  label: string;
  color: string;
}

export const LINE_ITEM_TYPES: LineItemType[] = [
  { key: "inventory", label: "انبار", color: SERIES[2] },
  // Slot 1, not slot 2. The palette later swapped those two, and following
  // the number would have put the gold here — beside the orange of «دلخواه»,
  // which is the one pair among these three that does not separate.
  { key: "service", label: "خدمت", color: SERIES[0] },
  { key: "custom", label: "دلخواه", color: SERIES[3] },
];

const BY_KEY: Map<string, LineItemType> = new Map(
  LINE_ITEM_TYPES.map((type) => [type.key, type]),
);

/**
 * Unknown keys fall back to «دلخواه» rather than to a muted chip. A line the
 * server describes with a type this build has never heard of is still a line
 * somebody typed by hand, which is what «دلخواه» means.
 */
export function lineItemTypeOf(key: string): LineItemType {
  return BY_KEY.get(key) ?? BY_KEY.get("custom")!;
}
