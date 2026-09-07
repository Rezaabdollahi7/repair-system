import prisma, { runInWorkspaceTransaction } from "../lib/prisma";
import type { Prisma } from "../generated/prisma/client";
import { SMS_TEMPLATES } from "../lib/sms";
import { errorMessage } from "./errors";
import {
  extendSubscription,
  notifyOwner,
  REFERRAL_REWARD_DAYS,
} from "./subscription";

/**
 * Records who brought a new workspace, inside sign-up's own transaction.
 *
 * Returns whether the code was recognised, so the response can say so. A
 * mistyped code must not fail the registration — someone who has just paid
 * attention to a form for two minutes should not be turned away over one
 * wrong character — but silently ignoring it would leave them expecting a
 * discount that never arrives.
 *
 * Reading a code belonging to a workspace the caller has no relationship
 * with is allowed by the read-open policy on referral_codes (8.1). Writing
 * the Referral row happens under the NEW workspace's context, which is what
 * that table's WITH CHECK names.
 */
export async function linkReferral(
  tx: Prisma.TransactionClient,
  referredWorkspaceId: number,
  code: string,
): Promise<boolean> {
  const owner = await tx.referralCode.findUnique({
    where: { code },
    select: { workspaceId: true },
  });

  if (!owner) {
    return false;
  }

  // Impossible today — a workspace cannot hold its own code before it
  // exists — but the check costs a line and closes the case for good.
  if (owner.workspaceId === referredWorkspaceId) {
    return false;
  }

  await tx.referral.create({
    data: {
      referrerWorkspaceId: owner.workspaceId,
      referredWorkspaceId,
    },
  });

  return true;
}

/**
 * Pays the referrer once the workspace they invited has bought something.
 *
 * Called after settlePayment, never inside it. The reward is written to a
 * DIFFERENT workspace, which needs its own transaction with its own context
 * — nesting that inside the payment's transaction is precisely the shape
 * runInWorkspaceTransaction exists to avoid.
 *
 * ⚠️ Errors are logged and swallowed, like deleteObject. A customer who has
 * just paid must not see a 500 because somebody else's reward could not be
 * written; and the row is left claimable so it can be picked up again.
 */
export async function rewardReferrer(
  referredWorkspaceId: number,
  paymentId: number,
): Promise<void> {
  try {
    // First purchase only. Later renewals are the shop paying for itself,
    // and rewarding them would turn one introduction into an annuity.
    const verifiedPayments = await prisma.payment.count({
      where: { workspaceId: referredWorkspaceId, status: "verified" },
    });

    if (verifiedPayments > 1) {
      return;
    }

    const referral = await prisma.referral.findUnique({
      where: { referredWorkspaceId },
      select: { id: true, referrerWorkspaceId: true, rewardedAt: true },
    });

    if (!referral || referral.rewardedAt !== null) {
      return;
    }

    // Claimed before the reward is written, conditional on it still being
    // unclaimed: two settlements racing — the return page and the nightly
    // job reaching the same payment — would otherwise both pay out.
    //
    // updateMany rather than update, because a conditional update that
    // matches nothing has to be a count of zero rather than an exception.
    const claimed = await prisma.referral.updateMany({
      where: { id: referral.id, rewardedAt: null },
      data: { rewardedAt: new Date(), paymentId },
    });

    if (claimed.count === 0) {
      return;
    }

    try {
      // The referrer's own workspace, so its own context. The id comes from
      // our row, never from anything the caller sent.
      await runInWorkspaceTransaction(referral.referrerWorkspaceId, (tx) =>
        extendSubscription(tx, referral.referrerWorkspaceId, {
          type: "referral",
          days: REFERRAL_REWARD_DAYS,
          note: `referred workspace ${referredWorkspaceId}`,
        }),
      );
    } catch (error) {
      // Put the claim back. Without this the referral reads as paid while
      // no days were added, and nothing would ever try again — the one
      // failure mode where a customer is quietly short-changed.
      await prisma.referral.updateMany({
        where: { id: referral.id },
        data: { rewardedAt: null, paymentId: null },
      });

      throw error;
    }

    // Outside the block above on purpose: the days are added and the claim
    // is final. An SMS that does not send must not roll either back, so this
    // cannot sit anywhere the revert can reach it.
    //
    // Plain digits, matching what the expiry reminders already send for
    // #DAYS#. Only #DATE# is written in Persian numerals, because that is
    // what toJalaliSms settled on.
    await notifyOwner(
      referral.referrerWorkspaceId,
      SMS_TEMPLATES.REFERRAL_REWARD,
      { DAYS: String(REFERRAL_REWARD_DAYS) },
    );
  } catch (error) {
    console.error(
      `referral reward failed for workspace ${referredWorkspaceId}:`,
      errorMessage(error),
    );
  }
}
