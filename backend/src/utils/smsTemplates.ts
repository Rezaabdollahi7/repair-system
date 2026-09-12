import { SMS_TEMPLATES, type SmsTemplate } from "../lib/sms";
import type { Prisma } from "../generated/prisma/client";

/**
 * What each customer notification says, and how a device becomes its four
 * parameters.
 *
 * ⚠️ The text below is not what gets sent. sms.ir approves a template in its
 * panel and stores the body there; we hold an id and a parameter list. The
 * copies here exist for two things and nothing else:
 *
 *   1. naming the parameters, which must match the approved template exactly
 *      — a body approved with #CUSTOMER# where this sends #NAME# fails at
 *      send time as a rejected message, not at boot and not in any test that
 *      mocks the provider;
 *   2. counting parts, so a message can be costed before it is sent, which
 *      has to happen before the wallet is debited.
 *
 * If a body is edited in the panel and not here, the cost estimate drifts
 * and nothing else breaks. The caps below hold every one of these to two
 * parts, so that drift is bounded at one part either way.
 */

/** Derived from the generated client, so a schema change is a compile error. */
export type DeviceSmsKind = Prisma.SmsMessageUncheckedCreateInput["kind"];

/**
 * Approved 1405/06/19, on the second submission. The first was refused with
 * «نام مجموعه باید ثابت باشد» — the sending organisation's name has to be
 * fixed text rather than a parameter, which is why «دوفیکسو» is written out
 * and the workshop's name is an ordinary data field beside the device and
 * the reception number.
 */
export const DEVICE_SMS: Record<
  DeviceSmsKind,
  { template: SmsTemplate; body: string }
> = {
  device_accepted: {
    template: SMS_TEMPLATES.DEVICE_ACCEPTED,
    body: "#NAME# عزیز، دستگاه #DEVICE# با شماره پذیرش #NUMBER# در تعمیرگاه #SHOP# پذیرش شد.\nدوفیکسو",
  },
  device_ready: {
    template: SMS_TEMPLATES.DEVICE_READY,
    body: "#NAME# عزیز، دستگاه #DEVICE# با شماره پذیرش #NUMBER# در تعمیرگاه #SHOP# آماده تحویل است.\nدوفیکسو",
  },
  device_delivered: {
    template: SMS_TEMPLATES.DEVICE_DELIVERED,
    body: "#NAME# عزیز، دستگاه #DEVICE# با شماره پذیرش #NUMBER# تحویل داده شد.\nتعمیرگاه #SHOP# | دوفیکسو",
  },
};

/**
 * How much of each value survives.
 *
 * All four are inside sms.ir's 25-character ceiling, and together they hold
 * every template above to two parts at its longest — 127, 134 and 131
 * characters against the 134 that two parts buys. `ready` is exactly at the
 * line, which is deliberate rather than lucky: see NUMBER below.
 *
 * Raising any of them means re-checking that, not merely checking against
 * 25. A third part costs a third of the message again, on every message of
 * that kind, silently.
 */
export const PARAM_CAPS = {
  NAME: 18,
  DEVICE: 16,
  /**
   * Ten, and the only one of these four chosen from below rather than above.
   *
   * Cutting a name short is cosmetic; cutting digits off a reception number
   * produces a different number, which the customer then reads back over the
   * phone and nobody can find. So this is set well past any id the platform
   * will issue — ten digits is ten billion devices — rather than trimmed to
   * what looks tidy.
   *
   * Ten is also the ceiling: at eleven the `ready` template reaches 135
   * characters, one past the 134 that two parts buys, and every message of
   * that kind would cost half as much again.
   */
  NUMBER: 10,
  SHOP: 22,
} as const;

/** Used when a value is missing, or turns out to be nothing but spaces. */
const FALLBACK = {
  NAME: "مشتری",
  DEVICE: "دستگاه",
  SHOP: "تعمیرگاه",
} as const;

/**
 * Makes one value safe to send.
 *
 * Three things happen here, and each of them is a message that would
 * otherwise fail on somebody's real phone number:
 *
 *   * a slash is replaced rather than passed on. `sendTemplate` refuses one
 *     — whether sms.ir accepts it was never established — and device names
 *     like «یخچال ال‌جی/سامسونگ» are ordinary. Throwing at send time over a
 *     character the shop typed months ago is not a useful failure.
 *   * newlines and other control characters are flattened, because a
 *     parameter is a value inside a line rather than a line of its own.
 *   * the result is cut to its cap and trimmed again, so a cut never leaves
 *     a trailing space.
 */
function clean(
  value: string | null | undefined,
  cap: number,
  fallback: string,
): string {
  const flattened = (value ?? "")
    .replace(/[/\\]/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (flattened === "") {
    return fallback;
  }

  return flattened.slice(0, cap).trim();
}

export interface DeviceSmsInput {
  customerName: string | null;
  deviceName: string | null;
  /** The device id, which is the reception number the shop quotes. */
  receptionNumber: number;
  workspaceName: string | null;
}

export interface RenderedSms {
  template: SmsTemplate;
  parameters: Record<string, string>;
  /** How the message will read, for costing. Never sent anywhere. */
  text: string;
}

/**
 * Turns a device into the parameters its message needs, and the text those
 * parameters would produce.
 *
 * The text comes back alongside rather than being left to the caller, so the
 * thing that is costed and the thing that is sent are built from one set of
 * values. Costing a different string from the one sent is how a wallet ends
 * up disagreeing with the provider's bill.
 */
export function renderDeviceSms(
  kind: DeviceSmsKind,
  input: DeviceSmsInput,
): RenderedSms {
  const parameters: Record<string, string> = {
    NAME: clean(input.customerName, PARAM_CAPS.NAME, FALLBACK.NAME),
    DEVICE: clean(input.deviceName, PARAM_CAPS.DEVICE, FALLBACK.DEVICE),
    NUMBER: clean(String(input.receptionNumber), PARAM_CAPS.NUMBER, "0"),
    SHOP: clean(input.workspaceName, PARAM_CAPS.SHOP, FALLBACK.SHOP),
  };

  const { template, body } = DEVICE_SMS[kind];

  const text = Object.entries(parameters).reduce(
    (rendered, [name, value]) => rendered.split(`#${name}#`).join(value),
    body,
  );

  return { template, parameters, text };
}
