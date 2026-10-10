import { z } from "zod";

export const stockReportQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  // Narrows the report to what one warehouse holds (14.9).
  warehouseId: z.coerce.number().int().positive().optional(),
  // Compared as a string because that's what the frontend sends; anything
  // else counts as false, as before.
  lowStockOnly: z.string().optional(),
  // 14.22: «all» as before; «idle» — stock that has not been sold or used on
  // a repair in `days`; «slow» — stock that has, ranked by how many days
  // the shelf would last at that pace.
  view: z.enum(["all", "idle", "slow"]).default("all"),
  days: z.coerce.number().int().min(1).max(730).default(90),
  // 14.22: each item's quantity in every warehouse, for a column per
  // warehouse. Ignored with `warehouseId`, which already narrows to one.
  perWarehouse: z.string().optional(),
});

export type StockReportQuery = z.infer<typeof stockReportQuerySchema>;

export const dateRangeQuerySchema = z.object({
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;

// The stock movement report (14.21): a period, and optionally one warehouse
// and one category.
export const movementReportQuerySchema = z.object({
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  warehouse_id: z.coerce.number().int().positive().optional(),
  category_id: z.coerce.number().int().positive().optional(),
});

export type MovementReportQuery = z.infer<typeof movementReportQuerySchema>;
