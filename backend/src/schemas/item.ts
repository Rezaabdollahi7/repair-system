import { z } from "zod";
import {
  paginationQuerySchema,
  quantitySchema,
  warehouseIdSchema,
} from "./common";

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

/**
 * Stock state, as a filter.
 *
 * The same three buckets `stockStatus()` in the report controller reports —
 * `out` for nothing left, `low` for at or below the item's own minimum, `ok`
 * for above it — so a list filtered by one of these agrees with the badge the
 * row is wearing.
 */
export const stockFilterSchema = z.enum(["ok", "low", "out"]);

export type StockFilter = z.infer<typeof stockFilterSchema>;

export const itemListQuerySchema = paginationQuerySchema.extend({
  categoryId: z.coerce.number().int().positive().optional(),
  stock: stockFilterSchema.optional(),
});

export type ItemListQuery = z.infer<typeof itemListQuerySchema>;

export const itemSearchQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive().optional(),
  stock: stockFilterSchema.optional(),
});

export type ItemSearchQuery = z.infer<typeof itemSearchQuerySchema>;

// Its own schema rather than paginationQuerySchema: this endpoint has always
// defaulted to 20 rows, not 10.
export const itemTransactionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type ItemTransactionsQuery = z.infer<typeof itemTransactionsQuerySchema>;

// The kardex (14.19): one item's ledger, filtered by warehouse and by the
// document's date.
export const itemKardexQuerySchema = z.object({
  warehouse_id: z.coerce.number().int().positive().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(200).default(50),
});

export type ItemKardexQuery = z.infer<typeof itemKardexQuerySchema>;

export const invoiceSearchQuerySchema = z.object({
  q: z.string().trim().optional(),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type InvoiceSearchQuery = z.infer<typeof invoiceSearchQuerySchema>;

/** A minimum that may be fractional for a fractional item — 2.5 metres —
 * at the three places the column holds. */
const minStockSchema = z.coerce
  .number()
  .min(0)
  .refine((value) => /^\d+(\.\d{1,3})?$/.test(String(value)), {
    message: "حداقل موجودی حداکثر سه رقم اعشار می‌پذیرد",
  });

// Field naming is mixed (categoryId and minStock in camelCase, sell_price in
// snake_case) because that's what the frontend already sends. Left alone: a
// database migration isn't the place to renegotiate the request contract.
// The fields added in 14.8 follow the camelCase most of them use.
export const itemCreateSchema = z
  .object({
    code: z.string().trim().min(1, "کد کالا الزامی است"),
    name: z.string().trim().min(1, "نام کالا الزامی است"),
    unit: z
      .string()
      .trim()
      .min(1, "واحد کالا الزامی است")
      // A shop may name its own units (حلقه، شاخه); a sentence is not one.
      .max(20, "نام واحد حداکثر ۲۰ نویسه است"),
    categoryId: z.coerce.number().int().positive().nullable().optional(),
    minStock: minStockSchema.default(0),
    description: optionalText,
    sell_price: z.coerce.number().min(0).default(0),
    isFractional: z.boolean().default(false),
    // What the shop already holds, entered with the item (14.8) rather than
    // as a second, zero-priced purchase.
    openingStock: z.coerce.number().min(0).default(0),
    openingCost: z.coerce.number().min(0).nullable().optional(),
    warehouseId: warehouseIdSchema,
  })
  .refine(
    (body) =>
      body.openingStock === 0 ||
      (body.openingCost !== null &&
        body.openingCost !== undefined &&
        body.openingCost > 0),
    {
      // Agreed 9 October: without its cost, opening stock would value the
      // warehouse — and every later margin — at nothing.
      message: "برای موجودی اولیه، بهای خرید هر واحد الزامی است",
      path: ["openingCost"],
    },
  )
  .refine(
    (body) =>
      body.openingStock === 0 ||
      /^\d+(\.\d{1,3})?$/.test(String(body.openingStock)),
    {
      message: "موجودی اولیه حداکثر سه رقم اعشار می‌پذیرد",
      path: ["openingStock"],
    },
  );

export type ItemCreateBody = z.infer<typeof itemCreateSchema>;

export const itemUpdateSchema = z
  .object({
    code: z.string().trim().min(1, "کد کالا الزامی است"),
    name: z.string().trim().min(1, "نام کالا الزامی است"),
    unit: z
      .string()
      .trim()
      .min(1, "واحد کالا الزامی است")
      // A shop may name its own units (حلقه، شاخه); a sentence is not one.
      .max(20, "نام واحد حداکثر ۲۰ نویسه است"),
    categoryId: z.coerce.number().int().positive().nullable(),
    minStock: minStockSchema,
    description: optionalText,
    sell_price: z.coerce.number().min(0),
    isFractional: z.boolean(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "هیچ فیلدی برای ویرایش ارسال نشده",
  });

export type ItemUpdateBody = z.infer<typeof itemUpdateSchema>;

export const quickPurchaseSchema = z.object({
  quantity: quantitySchema("تعداد باید بیشتر از صفر باشد"),
  // Positive, as on a purchase invoice. Zero was accepted here, and that is
  // how opening stock came to be recorded as free.
  unit_price: z.coerce.number().positive("قیمت باید بیشتر از صفر باشد"),
  note: optionalText,
  warehouse_id: warehouseIdSchema,
});

export type QuickPurchaseBody = z.infer<typeof quickPurchaseSchema>;

export const quickSaleSchema = z.object({
  quantity: quantitySchema("تعداد باید بیشتر از صفر باشد"),
  customer_name: optionalText,
  warehouse_id: warehouseIdSchema,
});

export type QuickSaleBody = z.infer<typeof quickSaleSchema>;
