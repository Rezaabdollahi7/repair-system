import { z } from "zod";
import { paginationQuerySchema, warehouseIdSchema } from "./common";

const optionalText = z
  .string()
  .trim()
  .max(500, "توضیح حداکثر ۵۰۰ نویسه است")
  .nullable()
  .optional()
  .transform((value) => value || null);

export const stockCountCreateSchema = z.object({
  // Omitted, the workspace's default.
  warehouse_id: warehouseIdSchema,
  // A partial count: one category. Omitted, every active item.
  category_id: z.coerce.number().int().positive().nullable().optional(),
  blind: z.boolean().default(false),
  description: optionalText,
});

export type StockCountCreateBody = z.infer<typeof stockCountCreateSchema>;

const STATUSES = ["draft", "applied", "cancelled"] as const;

export const stockCountListQuerySchema = paginationQuerySchema.extend({
  status: z.enum(STATUSES).optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
});

export type StockCountListQuery = z.infer<typeof stockCountListQuerySchema>;

export const stockCountLineParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  lineId: z.coerce.number().int().positive(),
});

export type StockCountLineParams = z.infer<typeof stockCountLineParamsSchema>;

/*
 * What the shelf holds: zero or more, at most three decimal places — the
 * columns' precision. Whether a fraction suits this item is the item's own
 * setting, checked against the row. null clears a count entered by mistake.
 */
const countedSchema = z
  .number({ message: "مقدار شمرده‌شده نامعتبر است" })
  .min(0, "مقدار شمرده‌شده نمی‌تواند منفی باشد")
  .refine((value) => /^\d+(\.\d{1,3})?$/.test(String(value)), {
    message: "مقدار حداکثر سه رقم اعشار می‌پذیرد",
  })
  .nullable();

export const stockCountLineUpdateSchema = z.object({
  counted_quantity: countedSchema,
  note: optionalText,
});

export type StockCountLineUpdateBody = z.infer<
  typeof stockCountLineUpdateSchema
>;

export const stockCountAddLineSchema = z.object({
  item_id: z.coerce.number().int().positive("کالا را انتخاب کنید"),
});

export type StockCountAddLineBody = z.infer<typeof stockCountAddLineSchema>;

export const stockCountApplySchema = z.object({
  // Required to go ahead when items moved after they were counted — the
  // warning the shop has to have read (14.15).
  acknowledge_moved: z.boolean().default(false),
});

export type StockCountApplyBody = z.infer<typeof stockCountApplySchema>;
