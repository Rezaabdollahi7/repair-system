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
