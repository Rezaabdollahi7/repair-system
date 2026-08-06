import { z } from "zod";
import { paginationQuerySchema } from "./common";

/**
 * Several filters arrive as comma-separated lists ("repaired,delivered").
 * Split here so handlers receive arrays rather than re-parsing strings.
 */
const csvStrings = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string()));

const csvNumbers = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((part) => Number(part.trim()))
      .filter((id) => Number.isInteger(id) && id > 0),
  )
  .pipe(z.array(z.number()));

export const INVOICE_STATUS_FILTERS = [
  "no_invoice",
  "paid",
  "unpaid",
  "not_needed",
] as const;

export const deviceListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().optional(),
  status: csvStrings.optional(),
  model: z.string().trim().optional(),
  customer_id: z.coerce.number().int().positive().optional(),
  entry_from: z.coerce.date().optional(),
  entry_to: z.coerce.date().optional(),
  personnel_ids: csvNumbers.optional(),
  invoice_status: csvStrings.optional(),
});

export type DeviceListQuery = z.infer<typeof deviceListQuerySchema>;

// The frontend still sends 1/0 for this flag, so both shapes are accepted
// while it moves to true/false.
const flexibleBoolean = z
  .union([z.boolean(), z.literal(0), z.literal(1)])
  .transform((value) => Boolean(value));

const optionalDate = z.coerce.date().nullable().optional();
const optionalText = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => value || null);

export const deviceCreateSchema = z.object({
  customer_id: z.coerce.number().int().positive().nullable().optional(),
  device_name: z.string().trim().min(1, "نام دستگاه الزامی است"),
  brand: optionalText,
  model: optionalText,
  serial_number: optionalText,
  entry_date: optionalDate,
  exit_date: optionalDate,
  // Preserves the controller's existing default, which differs from the
  // schema's "received" — the controller has always won here.
  status: z.string().trim().min(1).default("pending"),
  description: optionalText,
});

export type DeviceCreateBody = z.infer<typeof deviceCreateSchema>;

/**
 * Every field optional: the old handler built its UPDATE from whichever keys
 * were present, so sending only `status` had to leave the rest untouched.
 */
export const deviceUpdateSchema = z
  .object({
    customer_id: z.coerce.number().int().positive().nullable(),
    device_name: z.string().trim().min(1, "نام دستگاه الزامی است"),
    brand: optionalText,
    model: optionalText,
    serial_number: optionalText,
    entry_date: optionalDate,
    exit_date: optionalDate,
    status: z.string().trim().min(1),
    description: optionalText,
    needs_invoice: flexibleBoolean,
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, {
    message: "هیچ فیلدی برای آپدیت ارسال نشده",
  });

export type DeviceUpdateBody = z.infer<typeof deviceUpdateSchema>;
