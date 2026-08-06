import { z } from "zod";

export const personnelListQuerySchema = z.object({
  search: z.string().trim().optional(),
  role: z.string().trim().optional(),
  // Accepted and ignored: the frontend sends it, but this endpoint has never
  // paginated and the list is small enough that it doesn't need to.
  limit: z.coerce.number().int().positive().optional(),
});

export type PersonnelListQuery = z.infer<typeof personnelListQuerySchema>;

const password = z.string().min(6, "رمز عبور باید حداقل ۶ کاراکتر باشد");

export const personnelCreateSchema = z.object({
  full_name: z.string().trim().min(1, "نام الزامی است"),
  username: z.string().trim().min(1, "نام کاربری الزامی است"),
  password,
  phone: z
    .string()
    .trim()
    .nullable()
    .optional()
    .transform((value) => value || null),
  role_id: z.coerce.number().int().positive(),
});

export type PersonnelCreateBody = z.infer<typeof personnelCreateSchema>;

export const personnelUpdateSchema = z
  .object({
    full_name: z.string().trim().min(1, "نام الزامی است"),
    username: z.string().trim().min(1, "نام کاربری الزامی است"),
    password,
    phone: z
      .string()
      .trim()
      .nullable()
      .transform((value) => value || null),
    role_id: z.coerce.number().int().positive(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "هیچ فیلدی برای ویرایش ارسال نشده",
  });

export type PersonnelUpdateBody = z.infer<typeof personnelUpdateSchema>;
