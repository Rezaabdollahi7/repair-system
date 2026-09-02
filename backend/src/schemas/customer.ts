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
