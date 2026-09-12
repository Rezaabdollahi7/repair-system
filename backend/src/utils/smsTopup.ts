import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import {
  requestPayment,
  verifyPayment,
  WALLET_CALLBACK_URL,
  ZibalError,
} from "../lib/zibal";
import { MAX_TOPUP_RIALS, MIN_TOPUP_RIALS } from "../schemas/sms";
import { errorMessage } from "./errors";
import { generateOrderId, ORDER_PREFIX } from "./orderId";
import { creditWallet } from "./smsWallet";

/**
 * Buying SMS credit. The subscription checkout's twin, deliberately written
 * as its own thing rather than parameterised out of it.
 *
 * The tables are separate for a reason worth restating here, because this is
 * the file most likely to tempt someone into merging them: four call sites
 * count verified rows in `payments` to mean "this workshop has bought a
 * subscription before", and a top-up among them would silently cancel a
 * referred shop's first-purchase discount and its referrer's reward.
 */

/**
 * Zibal's own errors never reach the workshop: they are result codes and
 * gateway messages, useful to an operator reading the log and to nobody
 * else. Same string the subscription controller uses, for the same reason.
 */
export const GENERIC_GATEWAY_FAILURE =
  "ارتباط با درگاه پرداخت برقرار نشد. دوباره تلاش کنید";

/**
 * Registers a top-up with Zibal and returns where to send the customer.
 *
 * The row is written before the gateway is called, so a gateway that answers
 * slowly or not at all still leaves something explaining what was attempted.
 * A payment that exists only in Zibal's records is one nobody here can
 * reconcile.
 */
export async function startTopup(
  workspaceId: number,
  input: { amountRials: number; actorId?: number | null; mobile?: string },
): Promise<{ topupId: number; amountRials: number; redirectUrl: string }> {
  // Re-checked here as well as in the Zod schema. The schema is what a
  // request passes through; this is what the function guarantees, and the
  // settlement path compares Zibal's figure against whatever landed in the
  // row — so a bad amount reaching the row at all is worth preventing twice.
  if (
    !Number.isSafeInteger(input.amountRials) ||
    input.amountRials < MIN_TOPUP_RIALS ||
    input.amountRials > MAX_TOPUP_RIALS
  ) {
    throw new Error(
      `A top-up must be a whole number of rials between ${MIN_TOPUP_RIALS} ` +
        `and ${MAX_TOPUP_RIALS}, got ${input.amountRials}`,
    );
  }

  // DFXS-, where a subscription payment is DFX-. Zibal's panel shows this
  // string and nothing else of ours, so the two have to be tellable apart by
  // eye when somebody rings up about a transaction.
  const orderId = generateOrderId(workspaceId, ORDER_PREFIX.SMS_TOPUP);

  const topup = await prisma.smsTopup.create({
    data: {
      workspaceId,
      orderId,
      amountRials: input.amountRials,
      status: "pending",
      createdBy: input.actorId ?? null,
    },
    select: { id: true },
  });

  let trackId: bigint;

  try {
    ({ trackId } = await requestPayment({
      amountRials: input.amountRials,
      orderId,
      description: `شارژ کیف پول پیامکی — کارگاه ${workspaceId}`,
      mobile: input.mobile,
      // Its own page. Without this the customer lands on the subscription
      // callback, which would ask the backend to verify a trackId that is
      // not in `payments` and be told there is no such payment.
      callbackUrl: WALLET_CALLBACK_URL,
    }));
  } catch (error) {
    await prisma.smsTopup.update({
      where: { id: topup.id },
      data: {
        status: "failed",
        failureReason:
          error instanceof ZibalError
            ? `request result ${String(error.result)}: ${error.message}`
            : errorMessage(error),
      },
    });

    throw error;
  }

  await prisma.smsTopup.update({
    where: { id: topup.id },
    data: { trackId },
  });

  return {
    topupId: topup.id,
    amountRials: input.amountRials,
    // ⚠️ The client must navigate to this, not fetch it. Zibal requires a
    // Referer matching the registered domain on /start/{trackId}, and only a
    // real navigation from app.dofixo.ir carries one — which in turn depends
    // on the Caddyfile keeping Referrer-Policy at
    // strict-origin-when-cross-origin.
    redirectUrl: `https://gateway.zibal.ir/start/${trackId}`,
  };
}

/**
 * Confirms a paid top-up and adds the credit.
 *
 * Takes ids rather than a request because it is shared by the return page
 * and, once 8.11 makes a cross-workspace sweep possible again, by the
 * nightly job. Everything that must happen together happens in one
 * transaction: the row's status, the balance and the ledger line.
 *
 * Returns whether this call was the one that credited. A customer who
 * refreshes the return page, and a job that reaches a top-up the browser
 * already confirmed, both arrive here — and the balance must move once.
 */
export async function settleTopup(
  workspaceId: number,
  trackId: bigint,
): Promise<{ credited: boolean; balanceAfterRials: number | null }> {
  const topup = await prisma.smsTopup.findFirst({
    where: { trackId, workspaceId },
    select: { id: true, status: true, amountRials: true },
  });

  if (!topup) {
    throw new Error(`No SMS top-up for trackId ${trackId} in this workspace`);
  }

  // Already settled. Not an error, and emphatically not a second credit.
  if (topup.status === "verified") {
    return { credited: false, balanceAfterRials: null };
  }

  const verified = await verifyPayment(trackId);

  // ⚠️ The check that cannot be skipped. Zibal reports what it actually
  // took, and if that is not what we asked for, something between here and
  // the gateway changed it. Crediting on a mismatch would be selling credit
  // for whatever the customer decided to pay.
  if (verified.amountRials !== topup.amountRials.toNumber()) {
    await prisma.smsTopup.update({
      where: { id: topup.id },
      data: {
        status: "failed",
        failureReason: `amount mismatch: expected ${topup.amountRials.toString()}, Zibal reported ${verified.amountRials}`,
      },
    });

    throw new Error("Verified amount does not match the top-up record");
  }

  const balanceAfterRials = await runInWorkspaceTransaction(
    workspaceId,
    async (tx) => {
      // updateMany with the status in the predicate, not update by id.
      //
      // Zibal's result 201 means "already verified", which verifyPayment
      // resolves rather than throwing — so two callers can both get here
      // with a row that was still `paid` when each of them read it. This
      // makes the transition itself the gate: whoever changes the row
      // credits, and the loser changes nothing.
      const claimed = await tx.smsTopup.updateMany({
        where: { id: topup.id, status: { not: "verified" } },
        data: {
          status: "verified",
          refNumber: verified.refNumber,
          cardNumber: verified.cardNumber,
          paidAt: verified.paidAt,
          verifiedAt: new Date(),
        },
      });

      if (claimed.count === 0) {
        return null;
      }

      const credit = await creditWallet(tx, workspaceId, {
        amountRials: topup.amountRials.toNumber(),
        type: "topup",
        topupId: topup.id,
        description: `شارژ کیف پول — ${verified.refNumber ?? trackId}`,
      });

      return credit.balanceAfterRials;
    },
  );

  return balanceAfterRials === null
    ? { credited: false, balanceAfterRials: null }
    : { credited: true, balanceAfterRials };
}
