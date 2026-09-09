/**
 * The two states an invoice carries, defined once.
 *
 * Payment status had three copies — one per invoice page — and they had drifted
 * into contradicting each other. The same `pending` invoice was amber on the
 * purchases page, red on the sales page, and labelled «در انتظار» on repairs
 * and «در انتظار پرداخت» on the other two. Worse, the purchases page painted
 * `partial` and `pending` the same amber, so an invoice half paid and one not
 * paid at all looked identical.
 *
 * Both of these take the **reserved semantic colours** rather than chart
 * series slots: they are severities, not identities. Money not collected is
 * worse than money partly collected, which is worse than money in hand — and
 * that ordering is the whole reason a shop scans these columns.
 */

import type { PaymentStatus, RepairInvoiceStatus } from "../types/api";

/**
 * `K` is the API's own union for that status, not `string` — so the filter
 * chips built from these lists type-check against the query the page sends,
 * and a typo in a key is a compile error rather than a filter that silently
 * matches nothing.
 */
export interface InvoiceStatus<K extends string = string> {
  key: K;
  label: string;
  /** The dot's colour — a semantic token, so it follows the theme. */
  color: string;
  /** The pill's background and label pair. */
  tone: string;
}

const NEUTRAL_TONE = "bg-surface-alt text-text-secondary";

/**
 * Payment progress, worst first.
 *
 * `pending` is red rather than amber, resolving the disagreement in favour of
 * the sales page's reading: nothing has been collected, which is a different
 * situation from a customer who has paid half. Keeping both amber is what
 * made the two indistinguishable.
 */
export const PAYMENT_STATUSES: InvoiceStatus<PaymentStatus>[] = [
  {
    key: "pending",
    label: "در انتظار پرداخت",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
  {
    key: "partial",
    label: "پرداخت ناقص",
    color: "var(--warning)",
    tone: "bg-warning-soft text-warning-fg",
  },
  {
    key: "paid",
    label: "پرداخت شده",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
];

/**
 * A voided repair invoice, which owes nothing.
 *
 * Deliberately outside `PAYMENT_STATUSES`: that list is what the filter chips
 * are built from, and «ابطال شده» is not a payment state a shop filters by —
 * it is the invoice's own status, and the status filter already offers it.
 * This entry exists so the lookup has a word for the value rather than
 * printing the raw key, and it is neutral rather than red because there is
 * nothing here to act on.
 */
const CANCELLED_PAYMENT: InvoiceStatus = {
  key: "cancelled",
  label: "ابطال شده",
  color: "var(--text-muted)",
  tone: NEUTRAL_TONE,
};

const PAYMENT_BY_KEY: Map<string, InvoiceStatus> = new Map(
  [...PAYMENT_STATUSES, CANCELLED_PAYMENT].map((status) => [
    status.key,
    status,
  ]),
);

export function paymentStatusOf(key: string): InvoiceStatus {
  return (
    PAYMENT_BY_KEY.get(key) ?? {
      key,
      label: key,
      color: "var(--text-muted)",
      tone: NEUTRAL_TONE,
    }
  );
}

/**
 * What a repair invoice still owes.
 *
 * A cancelled invoice owes nothing, whatever the difference between its two
 * amounts happens to be — those stay on the row as the historical record.
 * Reading the subtraction directly is what made a voided invoice show a
 * balance the shop had no way to collect.
 */
export function repairOutstanding(invoice: {
  status: string;
  total_amount: number;
  paid_amount: number;
}): number {
  if (invoice.status === "cancelled") return 0;
  return invoice.total_amount - invoice.paid_amount;
}

/**
 * A repair invoice's own lifecycle, in the order a document moves through it.
 *
 * `issued` takes `--info`, the one reserved tone the app had never used. It
 * needed a colour of its own: it was written as `bg-primary-soft text-primary`,
 * and once the palette turned those into sand and ink it became identical to
 * the neutral `draft` beside it — two of the four states saying the same
 * thing. It is not a severity either way, which is exactly what an
 * informational tone is for.
 *
 * `draft` stays neutral, and deliberately: an unfinished document is the
 * absence of a state rather than one of its own.
 */
export const REPAIR_INVOICE_STATUSES: InvoiceStatus<RepairInvoiceStatus>[] = [
  {
    key: "draft",
    label: "پیش‌نویس",
    color: "var(--text-muted)",
    tone: NEUTRAL_TONE,
  },
  {
    key: "issued",
    label: "صادر شده",
    color: "var(--info)",
    tone: "bg-info-soft text-info-fg",
  },
  {
    key: "paid",
    label: "پرداخت شده",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
  {
    key: "cancelled",
    label: "ابطال شده",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
];

const REPAIR_BY_KEY: Map<string, InvoiceStatus> = new Map(
  REPAIR_INVOICE_STATUSES.map((status) => [status.key, status]),
);

export function repairInvoiceStatusOf(key: string): InvoiceStatus {
  return (
    REPAIR_BY_KEY.get(key) ?? {
      key,
      label: key,
      color: "var(--text-muted)",
      tone: NEUTRAL_TONE,
    }
  );
}

/**
 * Whether a *device* has been invoiced, which is a different question from
 * how an invoice has been paid.
 *
 * The devices list and its filter panel each described these four in their own
 * words and their own colours, and disagreed: the list called an uninvoiced
 * device «فاکتور ندارد» and tinted it as a warning, while the panel used the
 * same words for a neutral chip and had a separate «نیاز به فاکتور ندارد» in
 * `bg-primary-soft text-primary` — which the palette change turned into the
 * same sand and ink as the neutral one, leaving two of the four states
 * looking identical.
 *
 * `no_invoice` is the warning because it is the one that needs doing:
 * a repair finished and not yet billed. `not_needed` is a decision already
 * taken, so it is neutral, and it is named for what it is rather than for
 * what it lacks.
 */
export const DEVICE_INVOICE_STATUSES: InvoiceStatus[] = [
  {
    key: "not_needed",
    label: "فاکتور لازم نیست",
    color: "var(--text-muted)",
    tone: NEUTRAL_TONE,
  },
  {
    key: "no_invoice",
    label: "فاکتور صادر نشده",
    color: "var(--warning)",
    tone: "bg-warning-soft text-warning-fg",
  },
  {
    key: "unpaid",
    label: "پرداخت نشده",
    color: "var(--danger)",
    tone: "bg-danger-soft text-danger-fg",
  },
  {
    key: "paid",
    label: "پرداخت شده",
    color: "var(--success)",
    tone: "bg-success-soft text-success-fg",
  },
];

const DEVICE_INVOICE_BY_KEY: Map<string, InvoiceStatus> = new Map(
  DEVICE_INVOICE_STATUSES.map((status) => [status.key, status]),
);

export function deviceInvoiceStatusOf(key: string): InvoiceStatus {
  return (
    DEVICE_INVOICE_BY_KEY.get(key) ?? {
      key,
      label: key,
      color: "var(--text-muted)",
      tone: NEUTRAL_TONE,
    }
  );
}

/**
 * Which of the four a device row is in, from the three fields the list
 * carries. The order matters: a device marked as not needing an invoice is
 * that, whatever else is true of it.
 */
export function deviceInvoiceStateOf(device: {
  needs_invoice: boolean;
  invoice_count: number;
  invoice_status: string | null;
}): InvoiceStatus {
  if (!device.needs_invoice) return DEVICE_INVOICE_BY_KEY.get("not_needed")!;
  if (device.invoice_count > 0) {
    return device.invoice_status === "paid"
      ? DEVICE_INVOICE_BY_KEY.get("paid")!
      : DEVICE_INVOICE_BY_KEY.get("unpaid")!;
  }
  return DEVICE_INVOICE_BY_KEY.get("no_invoice")!;
}
