/**
 * The class strings the list pages share — their toolbar and their table.
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

/* ── Toolbar ────────────────────────────────────────────────────────── */

/**
 * The row above every list: search on the reading-start edge, actions at
 * the far one.
 *
 * The search field and the buttons used to be two stacked rows, which cost
 * a hundred pixels of the screen before a single row of data — on a laptop
 * that is two table rows the user could have been reading.
 */
export const toolbar = "flex flex-col sm:flex-row sm:items-center gap-3 mb-4";

/** Grows to fill whatever the buttons leave. min-w-0 so it may shrink. */
export const toolbarSearch = "relative flex-1 min-w-0";

/** Keeps its natural width; full width only when stacked on a phone. */
export const toolbarActions = "flex gap-2 shrink-0";

export const searchIcon =
  "pointer-events-none absolute top-1/2 -translate-y-1/2 right-3.5 w-[1.15rem] h-[1.15rem] text-text-muted";

export const searchField =
  "w-full bg-surface text-text-primary placeholder:text-text-muted text-body-sm " +
  "border border-border-field rounded-field py-2.5 pr-11 pl-3.5 " +
  "hover:border-border-strong focus:outline-none focus:border-primary " +
  "focus:shadow-[0_0_0_3px_var(--primary-soft)] " +
  "transition-[border-color,box-shadow] duration-150";

/** The page's main action — "ثبت دستگاه جدید", "فاکتور جدید". */
export const primaryButton =
  "flex-1 sm:flex-none px-4 py-2.5 rounded-field bg-primary text-primary-fg " +
  "text-body-sm font-bold shadow-primary hover:bg-primary-hover transition-colors " +
  "flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap";

/** Everything beside it — filters, categories. */
export const secondaryButton =
  "flex-1 sm:flex-none px-4 py-2.5 rounded-field border border-border bg-surface " +
  "text-text-primary text-body-sm font-bold hover:bg-surface-alt " +
  "hover:border-border-strong transition-colors flex items-center justify-center " +
  "gap-2 cursor-pointer whitespace-nowrap";

/** Selects that sit in the toolbar beside the search field. */
export const toolbarSelect =
  "shrink-0 border border-border-field rounded-field px-3.5 py-2.5 text-body-sm bg-surface " +
  "text-text-primary hover:border-border-strong focus:outline-none focus:border-primary " +
  "focus:shadow-[0_0_0_3px_var(--primary-soft)] " +
  "transition-[border-color,box-shadow] cursor-pointer";
