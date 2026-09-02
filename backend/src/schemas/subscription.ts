import { z } from "zod";

/**
 * A plan code, never a price. The amount is worked out from the Plan row on
 * the server: a price that arrives in a request body is a price the customer
 * chose.
 */
export const checkoutSchema = z.object({
  plan_code: z.string().min(1).max(32),
  discount_code: z
    .string()
    .trim()
    .toUpperCase()
    .min(1)
    .max(32)
    .optional()
    // An empty field on the form arrives as "", which should mean "no code"
    // rather than "the code is empty" — otherwise the customer gets a
    // validation error for leaving an optional box alone.
    .or(z.literal("").transform(() => undefined)),
});

export type CheckoutBody = z.infer<typeof checkoutSchema>;

/**
 * Zibal's trackId is int64, past what a JS number holds exactly, so it
 * travels as a string and is parsed to BigInt here.
 */
export const verifySchema = z.object({
  track_id: z
    .string()
    .regex(/^\d+$/, "شناسه پرداخت نامعتبر است")
    .transform((value) => BigInt(value)),
});

export type VerifyBody = z.infer<typeof verifySchema>;
