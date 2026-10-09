import { z } from "zod";
import { paginationQuerySchema } from "./common";

/*
 * A comma-separated list, the same shape the devices and sale-invoice lists
 * already take. Written out here rather than shared: three schemas each have
 * their own copy of these six lines, and pulling them into common.ts is a
 * refactor of all three, not part of adding one filter.
 */
const csvStrings = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

export const purchaseInvoiceListQuerySchema = paginationQuerySchema.extend({
  supplier: z.string().trim().optional(),
  /*
   * Filtering purchases by payment state, which the sale-invoice list has
   * always had and this one had not — so the two pages could not offer the
   * same control. It is what a shop uses to find what it still owes.
   */
  payment_status: csvStrings.optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

export type PurchaseInvoiceListQuery = z.infer<
  typeof purchaseInvoiceListQuerySchema
>;

const invoiceLineSchema = z.object({
  item_id: z.coerce.number().int().positive("مشخصات کالاها ناقص است"),
  quantity: z.coerce.number().int().positive("مشخصات کالاها ناقص است"),
  // Positive, not min(0): the old check rejected a zero price and its message
  // said so, so a free line has never been accepted here.
  unit_price: z.coerce.number().positive("قیمت واحد باید مثبت باشد"),
});

export const purchaseInvoiceCreateSchema = z.object({
  supplier_name: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
  invoice_date: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.date().nullable().optional(),
  ),
  paid_amount: z.coerce.number().min(0).default(0),
  note: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
  items: z.array(invoiceLineSchema).min(1, "حداقل یک کالا باید انتخاب شود"),
});

export type PurchaseInvoiceCreateBody = z.infer<
  typeof purchaseInvoiceCreateSchema
>;

/*
 * The same shape as create. An edit replaces the header and rebuilds the
 * whole line list — as the sale-invoice update does — because a purchase's
 * lines are what moved the stock, and reconciling a partial change against
 * what is already in the warehouse is a harder problem than resending the
 * invoice as it should now read.
 */
export const purchaseInvoiceUpdateSchema = purchaseInvoiceCreateSchema;

export type PurchaseInvoiceUpdateBody = z.infer<
  typeof purchaseInvoiceUpdateSchema
>;

export const purchaseInvoicePaymentSchema = z.object({
  paid_amount: z.coerce.number().min(0),
});

export type PurchaseInvoicePaymentBody = z.infer<
  typeof purchaseInvoicePaymentSchema
>;
