import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const customerListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
});

export type CustomerListQuery = z.infer<typeof customerListQuerySchema>;

export const customerBodySchema = z.object({
  name: z.string().trim().min(1, "نام مشتری الزامی است"),
  // Empty string and absent are both stored as null, matching how the old
  // handler treated a blank phone field.
  phone: z
    .string()
    .trim()
    .max(20, "شماره تلفن طولانی است")
    .optional()
    .nullable()
    .transform((value) => value || null),
});

export type CustomerBody = z.infer<typeof customerBodySchema>;

/*
 * Notes are edited from their own panel on the customer page, with their own
 * save button, so they get their own endpoint rather than riding along in
 * `customerBodySchema`. Sending a name and a phone to save a note would mean
 * the notes panel had to hold — and could stale-overwrite — fields it does
 * not show.
 */
export const customerNotesSchema = z.object({
  notes: z
    .string()
    .max(5000, "یادداشت طولانی است")
    .optional()
    .nullable()
    // Trimmed to nothing is no note at all. Inner newlines survive: a shop
    // writes these as a list.
    .transform((value) => value?.trim() || null),
});

export type CustomerNotesBody = z.infer<typeof customerNotesSchema>;
