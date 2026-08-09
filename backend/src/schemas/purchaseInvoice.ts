import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const purchaseInvoiceListQuerySchema = paginationQuerySchema.extend({
  supplier: z.string().trim().optional(),
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

export const purchaseInvoicePaymentSchema = z.object({
  paid_amount: z.coerce.number().min(0),
});

export type PurchaseInvoicePaymentBody = z.infer<
  typeof purchaseInvoicePaymentSchema
>;
