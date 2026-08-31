import { Request, Response } from "express";
import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import {
  requestPayment,
  verifyPayment,
  ZibalError,
  ZIBAL_RESULT,
} from "../lib/zibal";
import { ValidatedRequest } from "../middleware/validate";
import { AuthenticatedRequest } from "../types/request";
import { errorMessage } from "../utils/errors";
import { generateOrderId } from "../utils/orderId";
import { quotePrice } from "../utils/pricing";
import { rewardReferrer } from "../utils/referral";
import {
  extendSubscription,
  REFERRAL_DISCOUNT_PERCENT,
  REFERRAL_REWARD_DAYS,
} from "../utils/subscription";
import { workspaceIdOf } from "../utils/workspace";
import type { CheckoutBody, VerifyBody } from "../schemas/subscription";

/**
 * Zibal's own errors never reach the workshop: they are result codes and
 * gateway messages, useful to an operator reading the log and to nobody else.
 */
const GENERIC_GATEWAY_FAILURE =
  "ارتباط با درگاه پرداخت برقرار نشد. دوباره تلاش کنید";

// GET /api/subscription — what the plan selection screen needs
export const status = async (req: Request, res: Response) => {
  try {
    const workspaceId = workspaceIdOf(req);

    // Sequential rather than Promise.all: heavy parallel queries on a
    // ten-connection pool starved ordinary requests once already (the data
    // export in 5.3). Nobody is waiting on milliseconds here.
    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      select: { status: true, expiresAt: true, neverExpires: true },
    });

    const plans = await prisma.plan.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
    });

    // A referral discount is owed only on a first purchase, so it is spent
    // the moment one verifies. Checked here as well as at checkout, because
    // this is what the price on screen is based on.
    const referral = await prisma.referral.findUnique({
      where: { referredWorkspaceId: workspaceId },
      select: { rewardedAt: true },
    });

    const paidBefore = await prisma.payment.count({
      where: { workspaceId, status: "verified" },
    });

    const referralApplies = referral !== null && paidBefore === 0;

    res.json({
      status: workspace.status,
      expires_at: workspace.expiresAt?.toISOString() ?? null,
      never_expires: workspace.neverExpires,
      referral_applies: referralApplies,
      plans: plans.map((plan) => {
        const quote = quotePrice({
          planPriceRials: plan.priceRials,
          referralApplies,
        });

        return {
          code: plan.code,
          name: plan.name,
          duration_days: plan.durationDays,
          base_price_rials: quote.basePriceRials,
          amount_rials: quote.amountRials,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

/**
 * Whether a code may be used by this workspace right now.
 *
 * The database questions pricing deliberately left out: existence, expiry,
 * the total-use ceiling, and whether this workspace has spent it before.
 * Returns the row so the caller has its id for the use record.
 */
async function usableDiscountCode(code: string, workspaceId: number) {
  const row = await prisma.discountCode.findUnique({ where: { code } });

  if (!row || !row.isActive) {
    return null;
  }

  if (row.expiresAt !== null && row.expiresAt < new Date()) {
    return null;
  }

  const alreadyUsed = await prisma.discountCodeUse.findUnique({
    where: {
      discountCodeId_workspaceId: { discountCodeId: row.id, workspaceId },
    },
    select: { id: true },
  });

  if (alreadyUsed) {
    return null;
  }

  if (row.maxUses !== null) {
    // Counted rather than read off a column: a counter the application role
    // cannot increment would need a write grant on reference data, and one
    // that can drift from the rows it counts is worse than none.
    // Counted across every workspace, which needs the second policy added in
    // migration 20260830070000: under workspace_isolation alone a caller
    // counts only their own uses, sees zero, and the ceiling never binds.
    const used = await prisma.discountCodeUse.count({
      where: { discountCodeId: row.id },
    });

    if (used >= row.maxUses) {
      return null;
    }
  }

  return row;
}

// POST /api/subscription/checkout
export const checkout = async (req: Request, res: Response) => {
  try {
    const { plan_code, discount_code } = (req as ValidatedRequest).valid
      .body as CheckoutBody;
    const workspaceId = workspaceIdOf(req);
    const actor = (req as AuthenticatedRequest).user;

    const plan = await prisma.plan.findUnique({ where: { code: plan_code } });

    if (!plan || !plan.isActive) {
      return res.status(404).json({ error: "این پلن در دسترس نیست" });
    }

    const referral = await prisma.referral.findUnique({
      where: { referredWorkspaceId: workspaceId },
      select: { id: true },
    });

    const paidBefore = await prisma.payment.count({
      where: { workspaceId, status: "verified" },
    });

    const referralApplies = referral !== null && paidBefore === 0;

    const discountRow = discount_code
      ? await usableDiscountCode(discount_code, workspaceId)
      : null;

    // A code that was typed and rejected is worth saying so: silently
    // charging full price leaves the customer believing it applied.
    if (discount_code && !discountRow) {
      return res
        .status(400)
        .json({ error: "کد تخفیف معتبر نیست یا قبلاً استفاده شده است" });
    }

    const quote = quotePrice({
      planPriceRials: plan.priceRials,
      referralApplies,
      discountCode: discountRow
        ? { type: discountRow.type, value: discountRow.value }
        : undefined,
    });

    const orderId = generateOrderId(workspaceId);

    // Written before Zibal is called, so a gateway that answers slowly or
    // not at all still leaves a row explaining what was attempted. A payment
    // that exists only in Zibal's records is one nobody here can reconcile.
    //
    // Price and duration are copied onto the row rather than read back
    // through planId later: prices move with inflation, and a receipt from
    // last year that renders at this year's price is not a receipt.
    const payment = await prisma.payment.create({
      data: {
        workspaceId,
        planId: plan.id,
        orderId,
        status: "pending",
        basePriceRials: quote.basePriceRials,
        discountRials: quote.discountRials,
        amountRials: quote.amountRials,
        planDurationDays: plan.durationDays,
        createdBy: actor?.id ?? null,
      },
      select: { id: true },
    });

    let trackId: bigint;

    try {
      ({ trackId } = await requestPayment({
        amountRials: quote.amountRials,
        orderId,
        // Shown in Zibal's reports, which is the only place a payment gets
        // matched back to a workshop by hand.
        description: `${plan.name} — کارگاه ${workspaceId}`,
        mobile: actor?.username,
      }));
    } catch (error) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: "failed",
          failureReason:
            error instanceof ZibalError
              ? `request result ${String(error.result)}: ${error.message}`
              : errorMessage(error),
        },
      });

      console.error("zibal request failed:", error);
      return res.status(502).json({ error: GENERIC_GATEWAY_FAILURE });
    }

    await prisma.payment.update({
      where: { id: payment.id },
      data: { trackId },
    });

    // ⚠️ The client must navigate to this, not fetch it. Zibal requires a
    // Referer header matching the registered domain on /start/{trackId}, and
    // only a real navigation from app.dofixo.ir carries one — which in turn
    // depends on the Caddyfile keeping Referrer-Policy at
    // strict-origin-when-cross-origin. With no-referrer the gateway refuses
    // to open and nothing appears in our logs at all.
    res.json({
      payment_id: payment.id,
      amount_rials: quote.amountRials,
      redirect_url: `https://gateway.zibal.ir/start/${trackId}`,
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ error: errorMessage(error) });
    } else {
      console.error("checkout error after response:", error);
    }
  }
};

/**
 * Confirms a paid transaction and extends the subscription.
 *
 * Shared by the return page and, in 8.7, the nightly settlement job — which
 * is why it takes ids rather than a request. Everything that must happen
 * together happens in one transaction: the payment row, the discount use,
 * the expiry and its event.
 *
 * Returns false when there was nothing new to do.
 */
export async function settlePayment(
  workspaceId: number,
  trackId: bigint,
): Promise<{ extended: boolean; expiresAt: Date | null }> {
  const payment = await prisma.payment.findFirst({
    where: { trackId, workspaceId },
    select: {
      id: true,
      status: true,
      amountRials: true,
      planDurationDays: true,
    },
  });

  if (!payment) {
    throw new Error(`No payment for trackId ${trackId} in this workspace`);
  }

  // Already settled. The customer refreshed the return page, or the job
  // reached one the browser had confirmed. Not an error, and emphatically
  // not another thirty days.
  if (payment.status === "verified") {
    return { extended: false, expiresAt: null };
  }

  const verified = await verifyPayment(trackId);

  // ⚠️ The one check that cannot be skipped. Zibal reports what it actually
  // took, and if that is not what we asked for, something between here and
  // the gateway changed it. Extending on a mismatch would be selling a
  // subscription for whatever the customer decided to pay.
  if (verified.amountRials !== payment.amountRials.toNumber()) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "failed",
        failureReason: `amount mismatch: expected ${payment.amountRials.toString()}, Zibal reported ${verified.amountRials}`,
      },
    });

    throw new Error("Verified amount does not match the payment record");
  }

  const expiresAt = await runInWorkspaceTransaction(workspaceId, async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "verified",
        refNumber: verified.refNumber,
        cardNumber: verified.cardNumber,
        paidAt: verified.paidAt,
        verifiedAt: new Date(),
      },
    });

    return extendSubscription(tx, workspaceId, {
      type: "payment",
      days: payment.planDurationDays,
      paymentId: payment.id,
    });
  });

  // After the payment's own transaction, not inside it: the reward is
  // written to the referrer's workspace, which needs its own context.
  // Swallows its own errors — a customer who has just paid must not see a
  // failure because somebody else's thirty days could not be written.
  await rewardReferrer(workspaceId, payment.id);

  return { extended: true, expiresAt };
}

// POST /api/subscription/verify
export const verify = async (req: Request, res: Response) => {
  try {
    const { track_id } = (req as ValidatedRequest).valid.body as VerifyBody;
    const workspaceId = workspaceIdOf(req);

    const settled = await settlePayment(workspaceId, track_id);

    res.json({
      extended: settled.extended,
      expires_at: settled.expiresAt?.toISOString() ?? null,
    });
  } catch (error) {
    if (error instanceof ZibalError && error.result === ZIBAL_RESULT.NOT_PAID) {
      // Cancelled, or the card was declined. The row stays pending and the
      // customer can simply try again.
      return res.status(400).json({ error: "پرداخت انجام نشد یا لغو شده است" });
    }

    console.error("verify failed:", error);
    res.status(500).json({ error: GENERIC_GATEWAY_FAILURE });
  }
};

// GET /api/subscription/payments
export const payments = async (req: Request, res: Response) => {
  try {
    const rows = await prisma.payment.findMany({
      where: { workspaceId: workspaceIdOf(req) },
      orderBy: { createdAt: "desc" },
      include: {
        plan: { select: { name: true } },
        author: { select: { fullName: true } },
      },
    });

    res.json(
      rows.map((row) => ({
        id: row.id,
        order_id: row.orderId,
        plan_name: row.plan.name,
        status: row.status,
        base_price_rials: row.basePriceRials.toNumber(),
        discount_rials: row.discountRials.toNumber(),
        amount_rials: row.amountRials.toNumber(),
        ref_number: row.refNumber,
        card_number: row.cardNumber,
        paid_at: row.paidAt?.toISOString() ?? null,
        created_at: row.createdAt.toISOString(),
        created_by_name: row.author?.fullName ?? null,
      })),
    );
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};

// GET /api/subscription/referral — what the invite page needs
export const referral = async (req: Request, res: Response) => {
  try {
    const workspaceId = workspaceIdOf(req);

    const code = await prisma.referralCode.findUnique({
      where: { workspaceId },
      select: { code: true },
    });

    const invited = await prisma.referral.findMany({
      where: { referrerWorkspaceId: workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, rewardedAt: true },
    });

    res.json({
      code: code?.code ?? null,
      reward_days: REFERRAL_REWARD_DAYS,
      discount_percent: REFERRAL_DISCOUNT_PERCENT,
      // Nothing identifying about the invited workshops: who took the link
      // is their business, and the referrer only needs to know it counted.
      invited_count: invited.length,
      rewarded_count: invited.filter((row) => row.rewardedAt !== null).length,
      invites: invited.map((row) => ({
        created_at: row.createdAt.toISOString(),
        rewarded_at: row.rewardedAt?.toISOString() ?? null,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: errorMessage(error) });
  }
};
