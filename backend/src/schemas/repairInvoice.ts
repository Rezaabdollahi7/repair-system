import { z } from "zod";
import { paginationQuerySchema } from "./common";

export const repairInvoiceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  status: z.enum(["draft", "issued", "paid", "cancelled"]).optional(),
  from_date: z.coerce.date().optional(),
  to_date: z.coerce.date().optional(),
  device_id: z.coerce.number().int().positive().optional(),
});

export type RepairInvoiceListQuery = z.infer<
  typeof repairInvoiceListQuerySchema
>;

const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

// "percentage" applies discount_value as a percent, "fixed" as a rial amount.
const discountType = z.enum(["percentage", "fixed"]).nullable().optional();

const repairInvoiceLineSchema = z.object({
  item_type: z.string().trim().default("custom"),
  // Polymorphic: points at items for an inventory line and at services
  // otherwise, so it carries no relation and is validated as a bare number.
  item_id: z.coerce.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1, "نام آیتم الزامی است"),
  description: optionalText,
  quantity: z.coerce.number().positive().default(1),
  unit: optionalText,
  // Left optional: an inventory line with no price falls back to the item's
  // sell price, which the controller resolves.
  unit_price: z.coerce.number().min(0).optional(),
  discount_type: discountType,
  discount_value: z.coerce.number().min(0).default(0),
});

const repairInvoiceBodySchema = z.object({
  customer_name: optionalText,
  customer_phone: optionalText,
  invoice_date: z.coerce.date().optional(),
  due_date: z.coerce.date().nullable().optional(),
  discount_type: discountType,
  discount_value: z.coerce.number().min(0).default(0),
  tax_rate: z.coerce.number().min(0).max(100).default(0),
  warranty_months: z.coerce.number().int().min(0).default(0),
  technician_id: z.coerce.number().int().positive().nullable().optional(),
  notes: optionalText,
  items: z
    .array(repairInvoiceLineSchema)
    .min(1, "حداقل یک آیتم باید اضافه شود"),
});

export const repairInvoiceCreateSchema = repairInvoiceBodySchema.extend({
  device_id: z.coerce.number().int().positive("دستگاه باید انتخاب شود"),
});

export type RepairInvoiceCreateBody = z.infer<typeof repairInvoiceCreateSchema>;

// device_id is absent: the old update handler never changed it.
export const repairInvoiceUpdateSchema = repairInvoiceBodySchema;

export type RepairInvoiceUpdateBody = z.infer<typeof repairInvoiceUpdateSchema>;

export const repairInvoiceStatusSchema = z.object({
  status: z.enum(["draft", "issued", "paid", "cancelled"], {
    message: "وضعیت نامعتبر است",
  }),
});

export type RepairInvoiceStatusBody = z.infer<typeof repairInvoiceStatusSchema>;

export const repairInvoicePaymentSchema = z.object({
  amount: z.coerce.number().positive("مبلغ پرداختی باید بیشتر از صفر باشد"),
  payment_method: z.string().trim().min(1).default("cash"),
  reference_number: optionalText,
  note: optionalText,
});

export type RepairInvoicePaymentBody = z.infer<
  typeof repairInvoicePaymentSchema
>;
