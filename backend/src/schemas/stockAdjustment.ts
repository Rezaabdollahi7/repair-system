import { z } from "zod";
import {
  paginationQuerySchema,
  quantitySchema,
  warehouseIdSchema,
} from "./common";

/**
 * The reasons a person may give for adjusting the shelf by hand (14.14).
 * `count` is not among them: it belongs to the stock-count document (14.15),
 * and the database refuses it on an adjustment line as well.
 */
export const ADJUSTMENT_REASONS = [
  "damage",
  "loss",
  "found",
  "entry_error",
  "internal_use",
  "return_from_use",
  "other",
] as const;

export type AdjustmentReason = (typeof ADJUSTMENT_REASONS)[number];

/** Which way each reason can move stock. */
export const REASON_DIRECTION: Record<
  AdjustmentReason,
  "in" | "out" | "either"
> = {
  damage: "out",
  loss: "out",
  internal_use: "out",
  found: "in",
  return_from_use: "in",
  entry_error: "either",
  other: "either",
};

/** The reasons' Persian names, for the messages below. */
export const REASON_LABELS: Record<AdjustmentReason, string> = {
  damage: "خرابی",
  loss: "مفقودی",
  found: "پیدا شده",
  entry_error: "اصلاح خطای ثبت",
  internal_use: "مصرف داخلی",
  return_from_use: "برگشت از مصرف",
  other: "سایر",
};

const optionalText = z
  .string()
  .trim()
  .max(500, "توضیح حداکثر ۵۰۰ نویسه است")
  .nullable()
  .optional()
  .transform((value) => value || null);

/*
 * A direction and a positive quantity rather than a signed number: «۳ عدد
 * کاهش» is how a person thinks about it, and a minus sign typed into a
 * quantity field is the easiest thing in the form to get wrong.
 */
const adjustmentLineSchema = z
  .object({
    item_id: z.coerce.number().int().positive("کالا را انتخاب کنید"),
    direction: z.enum(["in", "out"], {
      message: "افزایش یا کاهش را مشخص کنید",
    }),
    quantity: quantitySchema("مقدار باید بیشتر از صفر باشد"),
    reason: z.enum(ADJUSTMENT_REASONS, { message: "دلیل را انتخاب کنید" }),
    note: optionalText,
    /*
     * What one unit is worth, for stock coming in — a found part, a forgotten
     * delivery. Optional: without it the item keeps its average, which is
     * the honest answer when nobody knows. Meaningless going out, where the
     * stock leaves at its average whatever is typed.
     */
    unit_cost: z.coerce
      .number()
      .positive("بهای واحد باید مثبت باشد")
      .nullable()
      .optional(),
  })
  .superRefine((line, ctx) => {
    const allowed = REASON_DIRECTION[line.reason];
    if (allowed !== "either" && allowed !== line.direction) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: `دلیل «${REASON_LABELS[line.reason]}» فقط برای ${
          allowed === "out" ? "کاهش" : "افزایش"
        } موجودی است`,
      });
    }
    if (line.reason === "other" && !line.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "برای دلیل «سایر» توضیح الزامی است",
      });
    }
    if (line.direction === "out" && line.unit_cost != null) {
      ctx.addIssue({
        code: "custom",
        path: ["unit_cost"],
        message: "کالایی که خارج می‌شود با میانگین بهای خودش خارج می‌شود",
      });
    }
  });

export const stockAdjustmentCreateSchema = z.object({
  // Omitted, the workspace's default — all a one-warehouse shop sends.
  warehouse_id: warehouseIdSchema,
  adjusted_at: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.coerce.date().nullable().optional(),
  ),
  description: optionalText,
  lines: z
    .array(adjustmentLineSchema)
    .min(1, "حداقل یک ردیف لازم است")
    .max(200, "حداکثر ۲۰۰ ردیف در یک سند")
    .superRefine((lines, ctx) => {
      // One line per item: two lines for one item in one document would be
      // one adjustment written twice, and read in the kardex as two.
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
});

export type StockAdjustmentCreateBody = z.infer<
  typeof stockAdjustmentCreateSchema
>;

export const stockAdjustmentListQuerySchema = paginationQuerySchema.extend({
  warehouse_id: z.coerce.number().int().positive().optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

export type StockAdjustmentListQuery = z.infer<
  typeof stockAdjustmentListQuerySchema
>;
