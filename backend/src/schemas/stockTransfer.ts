import { z } from "zod";
import { paginationQuerySchema, quantitySchema } from "./common";

const optionalText = z
  .string()
  .trim()
  .max(500, "توضیح حداکثر ۵۰۰ نویسه است")
  .nullable()
  .optional()
  .transform((value) => value || null);

const warehouseSchema = (message: string) =>
  z.coerce.number({ message }).int(message).positive(message);

const transferLineSchema = z.object({
  item_id: z.coerce.number().int().positive("کالا را انتخاب کنید"),
  // Always positive: the direction is the header's from → to.
  quantity: quantitySchema("مقدار باید بیشتر از صفر باشد"),
  note: optionalText,
});

/*
 * Both warehouses are required, unlike every other stock document: there
 * is no default to fall back to for a movement between two of them, and a
 * shop with one warehouse has nothing to transfer.
 */
export const stockTransferCreateSchema = z
  .object({
    from_warehouse_id: warehouseSchema("انبار مبدأ را انتخاب کنید"),
    to_warehouse_id: warehouseSchema("انبار مقصد را انتخاب کنید"),
    transferred_at: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.coerce.date().nullable().optional(),
    ),
    description: optionalText,
    lines: z
      .array(transferLineSchema)
      .min(1, "حداقل یک ردیف لازم است")
      .max(200, "حداکثر ۲۰۰ ردیف در یک سند")
      .superRefine((lines, ctx) => {
        // One line per item, as on an adjustment: two would be one transfer
        // written twice, and read in the kardex as two.
        const seen = new Set<number>();
        lines.forEach((line, index) => {
          if (seen.has(line.item_id)) {
            ctx.addIssue({
              code: "custom",
              path: [index, "item_id"],
              message: "هر کالا فقط یک بار در سند می‌آید",
            });
          }
          seen.add(line.item_id);
        });
      }),
  })
  .refine((body) => body.from_warehouse_id !== body.to_warehouse_id, {
    // The database refuses it too (stock_transfers_distinct_warehouses).
    message: "انبار مبدأ و مقصد نمی‌توانند یکی باشند",
    path: ["to_warehouse_id"],
  });

export type StockTransferCreateBody = z.infer<typeof stockTransferCreateSchema>;

export const stockTransferListQuerySchema = paginationQuerySchema.extend({
  // Either side: a warehouse's transfers are the ones in and the ones out.
  warehouse_id: z.coerce.number().int().positive().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

export type StockTransferListQuery = z.infer<
  typeof stockTransferListQuerySchema
>;
