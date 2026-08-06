import { z } from "zod";
import { paginationQuerySchema } from "./common";

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

export const itemListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
});

export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

export const itemSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
});

export type ItemSearchQuery = z.infer<typeof itemSearchQuerySchema>;

// Its own schema rather than paginationQuerySchema: this endpoint has always
// defaulted to 20 rows, not 10.
export const itemTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ItemTransactionsQuery = z.infer<typeof itemTransactionsQuerySchema>;

export const invoiceSearchQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type InvoiceSearchQuery = z.infer<typeof invoiceSearchQuerySchema>;

// Field naming is mixed (categoryId and minStock in camelCase, sell_price in
// snake_case) because that's what the frontend already sends. Left alone: a
// database migration isn't the place to renegotiate the request contract.
export const itemCreateSchema = z.object({
  code: z.string().trim().min(1, "کد کالا الزامی است"),
  name: z.string().trim().min(1, "نام کالا الزامی است"),
  unit: z.string().trim().min(1, "واحد کالا الزامی است"),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  minStock: z.coerce.number().int().min(0).default(0),
  description: optionalText,
  sell_price: z.coerce.number().min(0).default(0),
});

export type ItemCreateBody = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = z
  .object({
    code: z.string().trim().min(1, "کد کالا الزامی است"),
    name: z.string().trim().min(1, "نام کالا الزامی است"),
    unit: z.string().trim().min(1, "واحد کالا الزامی است"),
    categoryId: z.coerce.number().int().positive().nullable(),
    minStock: z.coerce.number().int().min(0),
    description: optionalText,
    sell_price: z.coerce.number().min(0),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "هیچ فیلدی برای ویرایش ارسال نشده",
  });

export type ItemUpdateBody = z.infer<typeof itemUpdateSchema>;

export const quickPurchaseSchema = z.object({
  quantity: z.coerce.number().int().positive("تعداد باید بیشتر از صفر باشد"),
  unit_price: z.coerce.number().min(0, "قیمت باید مثبت باشد"),
  note: optionalText,
});

export type QuickPurchaseBody = z.infer<typeof quickPurchaseSchema>;

export const quickSaleSchema = z.object({
  quantity: z.coerce.number().int().positive("تعداد باید بیشتر از صفر باشد"),
  customer_name: optionalText,
});

export type QuickSaleBody = z.infer<typeof quickSaleSchema>;
