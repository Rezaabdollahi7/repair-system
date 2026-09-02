import { randomInt } from "node:crypto";
import type { Prisma } from "../generated/prisma/client";

/**
 * No I, O, 0 or 1. This code gets read down a telephone line by one repair
 * shop owner to another, and those are the four characters that come back
 * wrong.
 */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

/**
 * Five tries, then give up. Thirty-two characters over six places is about a
 * billion codes, so a collision is already unlikely and five in a row is not
 * something that happens — but this runs inside the sign-up transaction, and
 * an unbounded loop there is the worst possible way to fail.
 */
const MAX_ATTEMPTS = 5;

/**
 * randomInt rather than Math.random: not because a referral code is a
 * secret, but because randomInt is uniform across the alphabet without
 * having to think about it, and the cost is nothing at six characters.
 */
export function generateReferralCode(): string {
  let code = "";

  for (let i = 0; i < CODE_LENGTH; i += 1) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }

  return code;
}

/**
 * Gives a workspace its invite code.
 *
 * ⚠️ Checks for a collision with a SELECT before inserting, rather than
 * inserting and retrying when the unique constraint complains. The obvious
 * version does not work here: in Postgres, any error inside a transaction
 * poisons it, so the retry and everything after it fails with "current
 * transaction is aborted" — and since this runs inside sign-up, that would
 * take the whole registration down with it.
 *
 * The SELECT reads across every workspace, which the read-open policy on
 * referral_codes allows on purpose: a code nobody else can see is a code we
 * cannot check for collisions.
 */
export async function createReferralCode(
  tx: Prisma.TransactionClient,
  workspaceId: number,
): Promise<string> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const code = generateReferralCode();

    const taken = await tx.referralCode.findUnique({
      where: { code },
      select: { id: true },
    });

    if (taken === null) {
      await tx.referralCode.create({ data: { workspaceId, code } });
      return code;
    }
  }

  throw new Error(
    `Could not find an unused referral code in ${MAX_ATTEMPTS} attempts`,
  );
}
