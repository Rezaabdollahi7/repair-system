/**
 * The class strings the four list tables share.
 *
 * Not a Table component — the pages differ too much in their columns and
 * row actions for one to be worth the indirection. But four hand-typed
 * copies of the same nine class strings drift within a week, and the point
 * of the design system is that they cannot. Constants keep them identical
 * while each page still writes its own markup.
 */

export const tableCard =
  "bg-surface border border-border rounded-card shadow-sm overflow-hidden";

/** Wide tables scroll here, inside the card, rather than widening the page. */
export const tableScroll = "overflow-x-auto";

export const thead = "bg-surface-alt";

export const th =
  "px-3 py-3 text-center text-body-xs font-bold text-text-secondary whitespace-nowrap";

export const tbody = "divide-y divide-border";

/**
 * Rows used to invert to a solid --primary on hover, which turned every soft
 * status badge inside them into a stain. A tint of the row's own surface says
 * "this one" just as clearly and leaves the contents readable.
 */
export const tr = "transition-colors hover:bg-surface-alt/70";

/** Clickable rows say so, and keep a visible focus ring for the keyboard. */
export const trClickable = `${tr} cursor-pointer`;

export const td = "px-3 py-3 text-body-sm text-center text-text-primary";

export const tdMuted = "px-3 py-3 text-body-sm text-center text-text-secondary";

/** Status pills. Pair with a `bg-*-soft text-*-fg` tone from the palette. */
export const badge =
  "inline-flex items-center px-2.5 py-1 rounded-pill text-body-xs font-bold whitespace-nowrap";

/** Small square icon button in a row's action column. */
export const iconButton =
  "p-2 rounded-field transition-colors cursor-pointer hover:opacity-80";

/** The card shown in place of the table below `lg`. */
export const rowCard =
  "bg-surface border border-border rounded-card shadow-sm p-4 transition-colors";
