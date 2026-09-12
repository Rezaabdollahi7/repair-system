import { z } from "zod";
import { trackIdSchema } from "./common";

/**
 * 20,000 toman, from the brief. Below this the gateway's own fee eats the
 * transaction, and it is roughly sixty messages — enough to be worth getting
 * a card out for.
 */
export const MIN_TOPUP_RIALS = 200_000;

/**
 * 10,000,000 toman. Not a policy about how much credit a shop may hold —
 * they can top up again — but a guard against a typed zero too many. A shop
 * that means to buy 500,000 toman and sends ten times that has made a
 * mistake the gateway would happily complete.
 */
export const MAX_TOPUP_RIALS = 100_000_000;

/*
 * Both live here rather than in utils/smsTopup, which is where the rest of
 * the top-up logic is. Nothing under schemas/ imports anything with a side
 * effect, and utils/smsTopup reaches lib/zibal — which throws at import
 * without ZIBAL_MERCHANT and APP_URL. Pulling the payment client in behind a
 * Zod schema is the same shape of surprise jest.setup.ts has had to absorb
 * three times already.
 *
 * startTopup imports them back from here and re-checks: the schema is what a
 * request passes through, the function is what it guarantees.
 */

/**
 * An amount, never a plan — the opposite of checkoutSchema, and the one
 * place in the app where the client does choose the figure.
 *
 * That makes the bounds load-bearing rather than cosmetic: this is the only
 * number a caller can put in a request body that ends up at a payment
 * gateway. The floor and ceiling live in utils/smsTopup beside the reasoning
 * for each, and startTopup re-checks them, so a second route added later
 * cannot get in under a different rule.
 *
 * Rials, like every amount the API carries. The frontend divides by ten for
 * display and multiplies back before sending.
 */
export const topupSchema = z.object({
  amount_rials: z
    .number()
    .int("مبلغ باید عدد صحیح باشد")
    .min(MIN_TOPUP_RIALS, `حداقل مبلغ شارژ ${MIN_TOPUP_RIALS / 10} تومان است`)
    .max(MAX_TOPUP_RIALS, `حداکثر مبلغ شارژ ${MAX_TOPUP_RIALS / 10} تومان است`),
});

export type TopupBody = z.infer<typeof topupSchema>;

export const walletVerifySchema = z.object({
  track_id: trackIdSchema,
});

export type WalletVerifyBody = z.infer<typeof walletVerifySchema>;
