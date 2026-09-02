/**
 * The only module that knows Zibal exists.
 *
 * Same shape as lib/sms.ts and lib/storage.ts: everything above asks for
 * `requestPayment` or `verifyPayment` and never sees an endpoint, a merchant
 * id or a result code. No driver interface and no sandbox implementation —
 * Zibal's own test merchant is a string in the environment, so a second code
 * path would be one nobody runs in production.
 *
 * Global fetch rather than an SDK: three POSTs to one host.
 */

const ZIBAL_BASE = "https://gateway.zibal.ir";

/**
 * Twenty seconds, not ten. The SMS client started at ten and had to be
 * raised — Iranian network conditions on an outbound call are slower than
 * they look from a laptop. A payment request that times out is worse than a
 * slow one: the customer is watching a spinner with their card in hand.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Read at import with no fallback, like DATABASE_URL_APP and JWT_SECRET. A
 * missing merchant has to stop the process at boot rather than surface on
 * the one request that moves money.
 */
function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. See backend/.env.example — the payment client has ` +
        `no default and deliberately does not fall back.`,
    );
  }

  return value;
}

const MERCHANT = requireEnv("ZIBAL_MERCHANT");

/**
 * Read here rather than where the callback is built, so a deployment missing
 * it fails at boot instead of on the first customer who tries to pay.
 *
 * Zibal refuses a callback whose domain is not the one the merchant is
 * registered under (result 106), so a wrong value is not a cosmetic problem —
 * and the failure mode without this line is an app that starts, serves every
 * screen, and breaks only on the one request that takes money.
 *
 * Same reasoning as lib/prisma.ts and lib/sms.ts: refuse to start rather than
 * run half-configured.
 */
const APP_URL = requireEnv("APP_URL").replace(/\/$/, "");

/** Where Zibal returns the customer once they are done. */
export const CALLBACK_URL = `${APP_URL}/subscription/callback`;

/**
 * Zibal's shared test account. Every capability works against it and no money
 * moves, which is exactly what makes it dangerous in production: the app would
 * look entirely healthy while activating subscriptions nobody paid for.
 *
 * ⚠️ The gateway is case-sensitive about this value. "zibal" works; "ZIBAL"
 * comes back result 104, invalid merchant — which reads like a broken
 * account rather than a capital letter. Support quoted it in capitals and
 * the docs write it in lowercase, and finding out cost an evening.
 *
 * The check below lowercases deliberately: whichever spelling reaches
 * production, it must not start.
 */
if (
  process.env.NODE_ENV === "production" &&
  MERCHANT.toLowerCase() === "zibal"
) {
  throw new Error(
    "ZIBAL_MERCHANT is still Zibal's shared test merchant. In production " +
      "that would activate subscriptions against payments that never happened.",
  );
}

/**
 * Result codes from the request and verify endpoints. Named because a bare
 * 115 in a log line tells nobody anything, and because two of them are not
 * failures at all.
 */
export const ZIBAL_RESULT = {
  SUCCESS: 100,
  MERCHANT_NOT_FOUND: 102,
  MERCHANT_INACTIVE: 103,
  MERCHANT_INVALID: 104,
  AMOUNT_TOO_SMALL: 105,
  INVALID_CALLBACK: 106,
  /**
   * "Already verified" — a success, not an error. The customer refreshed the
   * return page, or the settlement job reached a payment the browser already
   * confirmed. The subscription must not be extended a second time for it.
   */
  ALREADY_VERIFIED: 201,
  NOT_PAID: 202,
  INVALID_TRACK_ID: 203,
  /**
   * ⚠️ Our server's address is missing from the panel. Unlike sms.ir, which
   * answers an unlisted address with a bare HTTP 401 indistinguishable from a
   * bad key, Zibal says so plainly — the hour that cost in phase 8 does not
   * repeat here.
   */
  IP_NOT_REGISTERED: 115,
} as const;

/**
 * Transaction states. Only two mean the money moved.
 */
export const ZIBAL_STATUS = {
  AWAITING_PAYMENT: -1,
  INTERNAL_ERROR: -2,
  PAID_VERIFIED: 1,
  /** Paid but not yet confirmed by us — the orphaned payment. */
  PAID_UNVERIFIED: 2,
  CANCELLED_BY_USER: 3,
} as const;

/**
 * Carries Zibal's own result code so the caller can tell "already verified"
 * from "never paid" from "our IP is not on the list". No Persian text is
 * built here: what a shop owner is told is an HTTP concern.
 *
 * `result` is null when the failure happened before Zibal answered — a
 * timeout, DNS, a non-200 response.
 */
export class ZibalError extends Error {
  readonly result: number | null;

  constructor(message: string, result: number | null) {
    super(message);
    this.name = "ZibalError";
    this.result = result;
  }
}

async function callZibal(
  path: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  let response: Response;

  try {
    response = await fetch(`${ZIBAL_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchant: MERCHANT, ...body }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new ZibalError(
      `Could not reach Zibal: ${error instanceof Error ? error.message : String(error)}`,
      null,
    );
  }

  if (!response.ok) {
    throw new ZibalError(`Zibal returned HTTP ${response.status}`, null);
  }

  const parsed: unknown = await response.json();

  if (typeof parsed !== "object" || parsed === null) {
    throw new ZibalError(
      "Zibal returned something that is not an object",
      null,
    );
  }

  return parsed as Record<string, unknown>;
}

function resultOf(body: Record<string, unknown>): number | null {
  return typeof body.result === "number" ? body.result : null;
}

export interface PaymentRequest {
  /** Rials. Worked out by utils/pricing, never taken from the client. */
  amountRials: number;
  orderId: string;
  /** Shown in Zibal's own reports, which is where a payment gets matched up. */
  description: string;
  /** Lets the gateway offer the customer their saved cards. */
  mobile?: string;
}

/**
 * Registers an order and returns the id the customer is redirected with.
 *
 * ⚠️ The redirect itself is the browser's job, not ours: Zibal requires a
 * Referer header on /start/{trackId} matching the registered domain, and only
 * a real navigation from app.dofixo.ir carries one. The Caddyfile's
 * Referrer-Policy has to stay strict-origin-when-cross-origin for that — with
 * no-referrer the gateway simply refuses to open, and nothing appears in our
 * logs at all.
 */
export async function requestPayment(
  input: PaymentRequest,
): Promise<{ trackId: bigint }> {
  const body = await callZibal("/v1/request", {
    amount: input.amountRials,
    callbackUrl: CALLBACK_URL,
    orderId: input.orderId,
    description: input.description,
    ...(input.mobile ? { mobile: input.mobile } : {}),
  });

  const result = resultOf(body);

  if (result !== ZIBAL_RESULT.SUCCESS) {
    throw new ZibalError(
      `Zibal refused the payment request (result ${String(result)}): ` +
        `${String(body.message ?? "no message")}`,
      result,
    );
  }

  if (typeof body.trackId !== "number") {
    throw new ZibalError(
      "Zibal accepted the request but returned no trackId",
      null,
    );
  }

  // int64 in their API. BigInt rather than number, matching the column.
  return { trackId: BigInt(body.trackId) };
}

export interface VerifiedPayment {
  /** True when this call confirmed it; false when it was already confirmed. */
  newlyVerified: boolean;
  /** Rials, as Zibal has it. The caller checks this against what it expected. */
  amountRials: number;
  refNumber: string | null;
  cardNumber: string | null;
  paidAt: Date | null;
}

/**
 * Confirms a payment and ends its session.
 *
 * Result 201 resolves rather than throwing: "already verified" is what a
 * customer refreshing the return page produces, and what the settlement job
 * finds when the browser got there first. The caller must not extend the
 * subscription again for it — hence `newlyVerified`, which is the whole
 * reason this returns a flag instead of just the amount.
 */
export async function verifyPayment(trackId: bigint): Promise<VerifiedPayment> {
  const body = await callZibal("/v1/verify", { trackId: Number(trackId) });

  const result = resultOf(body);

  if (
    result !== ZIBAL_RESULT.SUCCESS &&
    result !== ZIBAL_RESULT.ALREADY_VERIFIED
  ) {
    throw new ZibalError(
      `Zibal did not verify the payment (result ${String(result)}): ` +
        `${String(body.message ?? "no message")}`,
      result,
    );
  }

  const paidAtRaw = body.paidAt;

  return {
    newlyVerified: result === ZIBAL_RESULT.SUCCESS,
    amountRials: typeof body.amount === "number" ? body.amount : 0,
    refNumber: body.refNumber == null ? null : String(body.refNumber),
    cardNumber: typeof body.cardNumber === "string" ? body.cardNumber : null,
    paidAt: typeof paidAtRaw === "string" ? new Date(paidAtRaw) : null,
  };
}

export interface PaymentInquiry {
  status: number;
  amountRials: number;
  paid: boolean;
}

/**
 * Asks what became of a payment without confirming it.
 *
 * Used by the settlement job (8.7) to tell a customer who wandered off
 * mid-payment from one whose card was declined — verify would answer 202 for
 * both, and only one of them should be chased.
 */
export async function inquirePayment(trackId: bigint): Promise<PaymentInquiry> {
  const body = await callZibal("/v1/inquiry", { trackId: Number(trackId) });

  const result = resultOf(body);

  if (result !== ZIBAL_RESULT.SUCCESS) {
    throw new ZibalError(
      `Zibal could not report on the payment (result ${String(result)})`,
      result,
    );
  }

  const status = typeof body.status === "number" ? body.status : 0;

  return {
    status,
    amountRials: typeof body.amount === "number" ? body.amount : 0,
    paid:
      status === ZIBAL_STATUS.PAID_VERIFIED ||
      status === ZIBAL_STATUS.PAID_UNVERIFIED,
  };
}
