/**
 * Every template this application can send, by the name the code uses.
 *
 * Ids rather than message text: sms.ir approves each template in its panel
 * and the body lives there, not here. Read from the environment rather than
 * hardcoded because a sandbox template has a different id, and sending a
 * production id from a test account comes back HTTP 400 — which reads in the
 * logs like a malformed request rather than the wrong template.
 *
 * Its own module, apart from lib/sms, for one reason: **this file has no
 * side effects**. lib/sms resolves every id below at import and throws if
 * one is missing, so anything that merely wants to know which variables
 * exist — jest.providerEnv, for instance — cannot import lib/sms without
 * triggering the very failure it is trying to prevent. Importing this
 * instead lets the test setup give every name a default by walking the list,
 * so adding a template here is the only edit a new template needs.
 *
 * lib/sms re-exports it, so nothing else imports this path directly.
 */
export const SMS_TEMPLATES = {
  /** #DAYS# — sent at 7 days out and again at 1. */
  BEFORE_EXPIRY: "SMS_TEMPLATE_BEFORE_EXPIRY",
  /** #DAYS# — days of grace left before writes stop. Sent on day 0. */
  ON_EXPIRY: "SMS_TEMPLATE_ON_EXPIRY",
  /** #DAYS# — days left before the data is deleted. */
  AFTER_EXPIRY: "SMS_TEMPLATE_AFTER_EXPIRY",
  /** #DATE# — Jalali, with dashes. */
  PAYMENT_OK: "SMS_TEMPLATE_PAYMENT_OK",
  /** #DAYS# — days added to the referrer. */
  REFERRAL_REWARD: "SMS_TEMPLATE_REFERRAL_REWARD",

  // The three a workshop sends to its own customer, charged to that
  // workshop's SMS wallet rather than to us (12.5). Every one above this
  // line is ours to pay for; every one below is theirs, and nothing in
  // utils/subscriptionJob or utils/otp may ever reach for these.
  //
  // All three take #NAME# #DEVICE# #NUMBER# #SHOP#. The parameter map and
  // the approved wording live in utils/smsTemplates.
  /** A device was taken in. */
  DEVICE_ACCEPTED: "SMS_TEMPLATE_DEVICE_ACCEPTED",
  /** A device is ready to be collected. */
  DEVICE_READY: "SMS_TEMPLATE_DEVICE_READY",
  /** A device was handed back. */
  DEVICE_DELIVERED: "SMS_TEMPLATE_DEVICE_DELIVERED",
} as const;

export type SmsTemplate = (typeof SMS_TEMPLATES)[keyof typeof SMS_TEMPLATES];
