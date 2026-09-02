/**
 * The only module that knows sms.ir exists.
 *
 * Same shape as lib/storage.ts: everything above asks for
 * `sendVerificationCode(phone, code)` and never sees an endpoint, an API key
 * or a template id. Swapping providers should touch this file and nothing else.
 *
 * Uses the global fetch rather than an SDK — one POST to one URL does not
 * justify a dependency.
 */

const SMS_ENDPOINT = "https://api.sms.ir/v1/send/verify";

/**
 * Every template this application can send, by the name the code uses.
 *
 * Ids rather than message text: sms.ir approves each template in its panel
 * and the body lives there, not here. Read from the environment rather than
 * hardcoded because a sandbox template has a different id, and sending a
 * production id from a test account comes back HTTP 400 — which reads in the
 * logs like a malformed request rather than the wrong template.
 */
export const SMS_TEMPLATES = {
  /** #DAYS# — sent at 7 days out and again at 1. */
  BEFORE_EXPIRY: "SMS_TEMPLATE_BEFORE_EXPIRY",
  /** No parameters. The day the subscription ends. */
  ON_EXPIRY: "SMS_TEMPLATE_ON_EXPIRY",
  /** #DAYS# — days left before the data is deleted. */
  AFTER_EXPIRY: "SMS_TEMPLATE_AFTER_EXPIRY",
  /** #DATE# — Jalali, with dashes. */
  PAYMENT_OK: "SMS_TEMPLATE_PAYMENT_OK",
  /** #DAYS# — days added to the referrer. */
  REFERRAL_REWARD: "SMS_TEMPLATE_REFERRAL_REWARD",
} as const;

export type SmsTemplate = (typeof SMS_TEMPLATES)[keyof typeof SMS_TEMPLATES];

/**
 * A user is waiting behind this request, and fetch on its own waits forever.
 * Ten seconds is long enough for a slow provider and short enough that the
 * sign-up form does not appear frozen.
 */
const REQUEST_TIMEOUT_MS = 20_000;

/**
 * Read at import, not at send time, and with no fallback — the same stance
 * lib/prisma.ts takes on DATABASE_URL_APP. A missing key has to stop the
 * process at boot: the alternative is an app that starts, accepts sign-ups,
 * and fails on the one request that matters.
 */
function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set. See backend/.env.example — the SMS client has no ` +
        `default and deliberately does not fall back to a no-op.`,
    );
  }

  return value;
}

const API_KEY = requireEnv("SMS_API_KEY");

/**
 * Every template id is resolved at import, so a deployment missing one stops
 * at boot rather than on the night the cron first needs it — which would be
 * a subscription lapsing with no warning sent, discovered by a customer.
 */
function requireTemplateId(name: string): number {
  const id = Number(requireEnv(name));

  if (!Number.isInteger(id)) {
    throw new Error(`${name} must be an integer template id.`);
  }

  return id;
}

const TEMPLATE_ID = requireTemplateId("SMS_TEMPLATE_ID");

const TEMPLATE_IDS: Record<string, number> = Object.fromEntries(
  Object.values(SMS_TEMPLATES).map((name) => [name, requireTemplateId(name)]),
);

/**
 * Provider status codes worth naming. sms.ir returns many more; these are the
 * ones a caller might branch on, and naming them keeps bare numbers out of
 * the controller.
 *
 * They fall into two groups, which matters for what the user is told:
 * OUR problem (credit, key, template) — retrying changes nothing and the
 * shop owner can do nothing about it, so it belongs in the logs.
 * THEIR number (blacklisted, parameter too long) — retrying that number will
 * fail the same way.
 */
export const SMS_STATUS = {
  SUCCESS: 1,
  CREDIT_EXHAUSTED: 102,
  INVALID_KEY: 10,
  DISABLED_KEY: 11,
  TEMPLATE_NOT_FOUND: 113,
  PARAMETER_TOO_LONG: 114,
  BLACKLISTED: 115,
  TOO_MANY_REQUESTS: 20,
} as const;

/**
 * Carries the provider's own status so the caller can decide what the user
 * sees. No Persian text is built here: a message for a shop owner is an HTTP
 * concern, and this module has no idea whether it is serving sign-up, a
 * password reset, or an operator script.
 *
 * `providerStatus` is null when the failure happened before the provider
 * answered — a timeout, a DNS failure, a non-200 response.
 */
export class SmsError extends Error {
  readonly providerStatus: number | null;

  constructor(message: string, providerStatus: number | null) {
    super(message);
    this.name = "SmsError";
    this.providerStatus = providerStatus;
  }
}

export interface SmsResult {
  messageId: number;
  cost: number;
}

/**
 * sms.ir wants ten digits with no leading zero (their own example is
 * 919xxxx904), while phoneSchema stores eleven starting 09.
 *
 * Re-validated rather than trusted: every caller today comes through
 * phoneSchema, but a wrong number here means a code delivered to a stranger,
 * which is not a failure that announces itself.
 */
function toProviderMobile(phone: string): string {
  if (!/^09\d{9}$/.test(phone)) {
    throw new SmsError(`Not an Iranian mobile number: ${phone}`, null);
  }

  return phone.slice(1);
}

/**
 * One POST, one template, whatever parameters it takes.
 *
 * sms.ir's verify endpoint serves every approved template, not just
 * verification codes — the name is theirs and means "templated", not "OTP".
 */
async function send(
  phone: string,
  templateId: number,
  parameters: { name: string; value: string }[],
): Promise<SmsResult> {
  const mobile = toProviderMobile(phone);

  let response: Response;

  try {
    response = await fetch(SMS_ENDPOINT, {
      method: "POST",
      headers: {
        "x-api-key": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mobile, templateId, parameters }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // Timeout, DNS, connection refused. Worth distinguishing in the message
    // because the fix is different: EAI_AGAIN on an Iranian mobile connection
    // is the network, not the credentials — the same trap Arvan set in phase 4.
    throw new SmsError(
      `Could not reach sms.ir: ${error instanceof Error ? error.message : String(error)}`,
      null,
    );
  }

  if (!response.ok) {
    // ⚠️ 401 here is indistinguishable from a bad key, and is usually this
    // server's address missing from the panel's allowlist. 400 is usually a
    // template id from the wrong account.
    throw new SmsError(`sms.ir returned HTTP ${response.status}`, null);
  }

  const body: unknown = await response.json();

  // The body's `status` is not the HTTP status: a rejected message arrives as
  // HTTP 200 with status 0. Reading only response.ok would treat an exhausted
  // account as a delivered message.
  const status =
    typeof body === "object" && body !== null && "status" in body
      ? (body as { status: unknown }).status
      : null;

  if (status !== SMS_STATUS.SUCCESS) {
    const message =
      typeof body === "object" && body !== null && "message" in body
        ? String((body as { message: unknown }).message)
        : "no message";

    throw new SmsError(
      `sms.ir rejected the message (status ${String(status)}): ${message}`,
      typeof status === "number" ? status : null,
    );
  }

  const data =
    typeof body === "object" && body !== null && "data" in body
      ? ((body as { data: unknown }).data as Record<string, unknown>)
      : {};

  return {
    messageId: Number(data.messageId ?? 0),
    cost: Number(data.cost ?? 0),
  };
}

/**
 * Sends one of the subscription templates.
 *
 * ⚠️ Parameter values must not contain a slash. Whether sms.ir accepts one
 * was never established, and the failure would be an HTTP 400 that reads
 * like a wrong template id — so dates are formatted ۱۴۰۵-۰۹-۱۲ and this
 * refuses anything else rather than finding out in production.
 */
export function sendTemplate(
  phone: string,
  template: SmsTemplate,
  parameters: Record<string, string>,
): Promise<SmsResult> {
  const entries = Object.entries(parameters);

  for (const [name, value] of entries) {
    if (value.includes("/")) {
      throw new SmsError(`Parameter ${name} must not contain a slash`, null);
    }

    // The panel's own ceiling. Longer values come back as status 114, which
    // is a rejected message rather than an error worth waking anyone for.
    if (value.length > 40) {
      throw new SmsError(
        `Parameter ${name} is longer than 40 characters`,
        null,
      );
    }
  }

  return send(
    phone,
    TEMPLATE_IDS[template],
    entries.map(([name, value]) => ({ name, value })),
  );
}

/**
 * Sends one verification code. Resolves on the provider's own success status,
 * throws SmsError otherwise.
 *
 * The code never reaches a log line here, on success or failure — a code in
 * the logs is a code anyone with log access can use inside its three-minute
 * life.
 */
export function sendVerificationCode(
  phone: string,
  code: string,
): Promise<SmsResult> {
  return send(phone, TEMPLATE_ID, [{ name: "Code", value: code }]);
}
