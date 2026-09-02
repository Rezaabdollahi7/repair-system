import { z } from "zod";
import { paginationQuerySchema } from "./common";

const csvStrings = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

export const saleInvoiceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  payment_status: csvStrings.optional(),
  date_from: z.coerce.date().optional(),
  date_to: z.coerce.date().optional(),
  amount_from: z.coerce.number().optional(),
  amount_to: z.coerce.number().optional(),
});

export type SaleInvoiceListQuery = z.infer<typeof saleInvoiceListQuerySchema>;

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

/**
 * A line is either an inventory item or a free-text one. item_type carries
 * that distinction in the request but isn't stored: on read, a line with a
 * null item_id is a custom one.
 */
const saleInvoiceLineSchema = z
  .object({
    item_type: z.string().trim().optional(),
    item_id: z.coerce.number().int().positive().nullable().optional(),
    name: optionalText,
    unit: optionalText,
    quantity: z.coerce.number().int().positive("مشخصات کالاها ناقص است"),
    unit_price: z.coerce.number().min(0),
  })
  .refine((line) => line.item_type !== "inventory" || Boolean(line.item_id), {
    message: "مشخصات کالاها ناقص است",
  })
  .refine((line) => line.item_type === "inventory" || Boolean(line.name), {
    message: "نام و تعداد آیتم دلخواه الزامی است",
  });

const saleInvoiceBodySchema = z.object({
  customer_id: z.coerce.number().int().positive().nullable().optional(),
  customer_name: optionalText,
  customer_phone: optionalText,
  device_id: z.coerce.number().int().positive().nullable().optional(),
  invoice_date: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.date().nullable().optional(),
  ),
  paid_amount: z.coerce.number().min(0).default(0),
  note: optionalText,
  items: z.array(saleInvoiceLineSchema).min(1, "حداقل یک کالا باید انتخاب شود"),
});

export const saleInvoiceCreateSchema = saleInvoiceBodySchema;
export type SaleInvoiceCreateBody = z.infer<typeof saleInvoiceCreateSchema>;

// The same shape: the old update handler replaced every field and rebuilt the
// whole line list, so a partial update was never supported here.
export const saleInvoiceUpdateSchema = saleInvoiceBodySchema;
export type SaleInvoiceUpdateBody = z.infer<typeof saleInvoiceUpdateSchema>;

export const saleInvoicePaymentSchema = z.object({
  paid_amount: z.coerce.number().min(0),
});

export type SaleInvoicePaymentBody = z.infer<typeof saleInvoicePaymentSchema>;
