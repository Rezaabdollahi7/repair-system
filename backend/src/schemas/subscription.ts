import { z } from "zod";
import { trackIdSchema } from "./common";

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

export const verifySchema = z.object({
  track_id: trackIdSchema,
});

export type VerifyBody = z.infer<typeof verifySchema>;
