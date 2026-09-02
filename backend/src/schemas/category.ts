import { z } from "zod";

export const categoryBodySchema = z.object({
  name: z.string().trim().min(1, "نام دسته‌بندی الزامی است"),
  description: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
});

export type CategoryBody = z.infer<typeof categoryBodySchema>;
