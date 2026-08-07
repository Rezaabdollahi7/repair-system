import { z } from "zod";

export const stockReportQuerySchema = z.object({
  categoryId: z.coerce.number().int().positive().optional(),
  // Compared as a string because that's what the frontend sends; anything
  // else counts as false, as before.
  lowStockOnly: z.string().optional(),
});

export type StockReportQuery = z.infer<typeof stockReportQuerySchema>;

export const dateRangeQuerySchema = z.object({
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
});

export type DateRangeQuery = z.infer<typeof dateRangeQuerySchema>;
