/**
 * The class strings the list pages share — their toolbar and their table.
 *
 * Not a Table component — the pages differ too much in their columns and
 * row actions for one to be worth the indirection. But four hand-typed
 * copies of the same nine class strings drift within a week, and the point
 * of the design system is that they cannot. Constants keep them identical
 * while each page still writes its own markup.
 */

/*
 * `rounded-panel` (24px) rather than `rounded-card` (12px), matching the
 * dashboard's cards. Changed here rather than overridden on the devices page:
 * a corner radius is the one thing in a design system that has to agree
 * everywhere, and one list page with softer corners than the other seven
 * reads as a mistake rather than as a redesign in progress.
 *
 * `table-shell` is a marker, not a style: index.css hangs the cell grid and
 * the alternating rows off it. It lives on the card rather than on the
 * <table> so all twelve lists get both from the class they already use, and
 * so the relief tables inside the chart cards — which are not in a card —
 * keep their own quieter treatment.
 */
export const tableCard =
  "table-shell bg-surface border border-border rounded-card shadow-sm overflow-hidden";

/** Wide tables scroll here, inside the card, rather than widening the page. */
export const tableScroll = "overflow-x-auto";

export const thead = "bg-accent";

/*
 * A step up from `text-body-xs`/`text-body-sm`, which is where these started.
 *
 * 12px column headings and 14px cells are a dashboard's sizes, and this is
 * not a dashboard — it is the screen a shop has open all day, reading part
 * numbers and amounts off it across a counter. The row padding goes up with
 * the type so the lines do not close ranks.
 *
 * `text-table` is 15px rather than body-md's 16: at 16 the widest of these
 * tables no longer fit the content area on a laptop, and the column that
 * fell off the edge was the actions one. See the note beside the token.
 *
 * The horizontal padding came down from `px-3` to `px-2.5` in the same
 * pass to pay for the extra pixel of type. Ten columns times four pixels
 * a side is forty pixels of table, which is the difference between the
 * devices list fitting a laptop and scrolling.
 */
export const th =
  "px-2.5 py-3.5 text-center text-table font-bold text-white bg-brand-deep whitespace-nowrap";

export const tbody = "divide-y divide-border";

/**
 * Rows used to invert to a solid --primary on hover, which turned every soft
 * status badge inside them into a stain. A tint of the row's own surface says
 * "this one" just as clearly and leaves the contents readable.
 */
export const tr = "transition-colors hover:bg-surface-alt/70";

/** Clickable rows say so, and keep a visible focus ring for the keyboard. */
export const trClickable = `${tr} cursor-pointer`;

export const td = "px-2.5 py-3.5 text-table text-center text-text-primary";

export const tdMuted =
  "px-2.5 py-3.5 text-table text-center text-text-secondary";

/**
 * A cell whose text colour the caller sets.
 *
 * `td` carries `text-text-primary`, so composing it as `${td} text-success-fg`
 * put two colour utilities on one element and left the winner to whichever
 * Tailwind emitted last — which was the primary one. The invoice tables had
 * been asking for a green «پرداخت‌شده» and a red «مانده» since they were
 * written, and getting neither.
 */
export const tdBare = "px-2.5 py-3.5 text-table text-center";

/**
 * A cell holding controls rather than text — the row's action buttons.
 *
 * Padding only: the buttons align themselves, and a `text-center` here would
 * fight the `justify-end` inside them. It exists because these cells were
 * hand-written as `px-3 py-3`, which is the padding the table used two steps
 * ago — so on every list the actions column sat two pixels shallower than
 * the six columns beside it.
 */
export const tdActions = "px-2.5 py-3.5";

/** Status pills. Pair with a `bg-*-soft text-*-fg` tone from the palette. */
export const badge =
  "inline-flex items-center px-2.5 py-1 rounded-pill text-body-xs font-bold whitespace-nowrap";

/** Small square icon button in a row's action column. */
export const iconButton = "p-2 rounded-field transition-colors cursor-pointer";

/*
 * The row actions, one class per kind of action.
 *
 * All of them used to be `text-text-muted` until hovered, so a row ended in
 * three identical grey squares and the only way to learn which one deleted
 * the record was to point at it and read the tooltip. Each now wears the
 * colour of what it does, at rest:
 *
 *   view      اطلاعات   the informational tone
 *   edit      ویرایش    amber — a change, not yet a loss
 *   delete    حذف       red
 *   confirm   ساختن     green, for the actions that create or approve
 *   neutral             the reversible toggles, which should stay quiet
 *
 * A tinted square with a strong icon rather than a strong square with a pale
 * icon: at 34px a solid red button repeated down a column is louder than the
 * data, and these sit beside numbers a shop is trying to read. The tints are
 * the same `*-soft` steps the status badges use, so a row's actions and its
 * badges belong to one palette.
 *
 * The brand blue is deliberately not among them. It is spent once per screen
 * — on the active nav item — and eight rows of it down an action column is
 * exactly the "everything is emphasised, so nothing is" the accent exists to
 * avoid. `view` takes the informational tone instead.
 */
export const actionView = `${iconButton} bg-info-soft text-info-fg hover:bg-info-soft-hover`;

export const actionEdit = `${iconButton} bg-warning-soft text-warning-fg hover:bg-warning-soft-hover`;

export const actionDelete = `${iconButton} bg-danger-soft text-danger-fg hover:bg-danger-soft-hover`;

export const actionConfirm = `${iconButton} bg-success-soft text-success-fg hover:bg-success-soft-hover`;

export const actionNeutral = `${iconButton} bg-surface-alt text-text-secondary hover:bg-primary-soft-hover hover:text-text-primary`;

/** The card shown in place of the table below `lg`. */
export const rowCard =
  "bg-surface border border-border rounded-panel shadow-sm p-4 transition-colors";

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
