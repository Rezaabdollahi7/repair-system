import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

export const serviceCreateSchema = z.object({
  name: z.string().trim().min(1, "نام خدمت الزامی است"),
  description: optionalText,
  default_price: z.coerce.number().min(0).default(0),
  unit: z.string().trim().min(1).default("خدمت"),
});

export type ServiceCreateBody = z.infer<typeof serviceCreateSchema>;

// The frontend still sends 1/0 for this flag, so both shapes are accepted.
const flexibleBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => Boolean(value));

export const serviceUpdateSchema = z
  .object({
    name: z.string().trim().min(1, "نام خدمت الزامی است"),
    description: z
      .string()
      .trim()
      .nullable()
      .transform((value) => value || null),
    default_price: z.coerce.number().min(0),
    unit: z.string().trim().min(1),
    is_active: flexibleBoolean,
    sort_order: z.coerce.number().int().min(0),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "هیچ فیلدی برای ویرایش ارسال نشده",
  });

export type ServiceUpdateBody = z.infer<typeof serviceUpdateSchema>;
