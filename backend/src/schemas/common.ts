import { z } from "zod";

/**
 * Shared route-param schema for the `/:id` pattern every resource uses.
 * Coercion matters here: Express hands params over as strings, so the schema
 * is what turns "42" into a number Prisma will accept.
 */
export const idParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export type IdParam = z.infer<typeof idParamSchema>;

/**
 * Pagination shared by every list endpoint. The limit is capped so a client
 * can't ask for the whole table in one request.
 */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  // Ceiling raised from 100: the invoice forms fetch whole lists to populate
  // their dropdowns, and 100 silently rejected those requests.
  limit: z.coerce.number().int().positive().max(1000).default(10),
});

/**
 * Zibal's trackId, which is int64 — past what a JS number holds exactly, so
 * it travels as a string and is parsed to BigInt here.
 *
 * Shared by the subscription verify and the SMS wallet verify: it is the same
 * value from the same gateway, and two copies would be two places to get the
 * bigint conversion wrong.
 */
export const trackIdSchema = z
  .string()
  .regex(/^\d+$/, "شناسه پرداخت نامعتبر است")
  .transform((value) => BigInt(value));

/**
 * A stock quantity on a document line (14.1): positive, and no finer than
 * the three decimal places the columns hold — 0.125 metre of cable, not
 * 0.1255. Whether an item may move by fractions at all is the item's own
 * setting, checked by the stock service against the row, not here.
 */
export const quantitySchema = (message: string) =>
  z.coerce
    .number()
    .positive(message)
    // On the number's own spelling: 0.1 prints as "0.1" even though it is
    // not exactly a tenth, and anything a person typed with more than three
    // places, or small enough to print in exponent form, does not match.
    .refine((value) => /^\d+(\.\d{1,3})?$/.test(String(value)), {
      message: "تعداد حداکثر سه رقم اعشار می‌پذیرد",
    });

/** An optional warehouse on a document; omitted, the workspace's default. */
export const warehouseIdSchema = z.coerce
  .number()
  .int()
  .positive()
  .nullable()
  .optional();
