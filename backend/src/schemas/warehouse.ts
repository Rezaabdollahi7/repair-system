import { z } from "zod";

export const warehouseBodySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "نام انبار الزامی است")
    .max(60, "نام انبار حداکثر ۶۰ نویسه است"),
  note: z
    .string()
    .trim()
    .max(500, "توضیح حداکثر ۵۰۰ نویسه است")
    .nullable()
    .optional()
    .transform((value) => value || null),
});

export type WarehouseBody = z.infer<typeof warehouseBodySchema>;

export const warehouseStatusSchema = z.object({
  is_active: z.boolean({ message: "وضعیت انبار نامعتبر است" }),
});

export type WarehouseStatusBody = z.infer<typeof warehouseStatusSchema>;
