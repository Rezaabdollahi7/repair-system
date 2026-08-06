import { z } from "zod";

export const loginSchema = z.object({
  username: z.string().trim().min(1, "نام کاربری و رمز عبور الزامی است"),
  password: z.string().min(1, "نام کاربری و رمز عبور الزامی است"),
});

export type LoginBody = z.infer<typeof loginSchema>;

export const changePasswordSchema = z.object({
  current_password: z.string().min(1, "رمز فعلی و جدید الزامی است"),
  new_password: z.string().min(6, "رمز جدید باید حداقل ۶ کاراکتر باشد"),
});

export type ChangePasswordBody = z.infer<typeof changePasswordSchema>;
