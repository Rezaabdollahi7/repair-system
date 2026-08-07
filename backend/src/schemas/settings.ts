import { z } from "zod";

// The frontend still sends 1/0 for these flags in some places, so both shapes
// are accepted while it moves to true/false.
const flexibleBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => Boolean(value));

const optionalText = z
  .string()
  .trim()
  .nullable()
  .transform((value) => value || null);

export const settingsUpdateSchema = z
  .object({
    company_name: optionalText,
    company_address: optionalText,
    company_phone: optionalText,
    company_email: optionalText,
    company_website: optionalText,
    default_tax_rate: z.coerce.number().min(0).max(100),
    default_warranty_months: z.coerce.number().int().min(0),
    invoice_prefix: z.string().trim().min(1),
    invoice_footer_text: optionalText,
    sale_invoice_paper_size: z.string().trim().min(1),
    sale_invoice_show_logo: flexibleBoolean,
    sale_invoice_show_company_info: flexibleBoolean,
    sale_invoice_show_email: flexibleBoolean,
    sale_invoice_show_website: flexibleBoolean,
    sale_invoice_show_device_info: flexibleBoolean,
    sale_invoice_show_customer_phone: flexibleBoolean,
    sale_invoice_show_discount: flexibleBoolean,
    sale_invoice_show_tax: flexibleBoolean,
    sale_invoice_show_stamp: flexibleBoolean,
    sale_invoice_show_signature: flexibleBoolean,
    sale_invoice_show_warranty: flexibleBoolean,
    sale_invoice_show_technician: flexibleBoolean,
    sale_invoice_header_text: optionalText,
    sale_invoice_footer_text: optionalText,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "هیچ فیلدی برای آپدیت ارسال نشده",
  });

export type SettingsUpdateBody = z.infer<typeof settingsUpdateSchema>;

export const uploadTypeParamSchema = z.object({
  type: z.enum(["logo", "stamp", "signature"], {
    message: "نوع تصویر نامعتبر است",
  }),
});

export type UploadTypeParam = z.infer<typeof uploadTypeParamSchema>;
