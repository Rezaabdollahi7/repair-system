/**
 * Settles roadmap open questions 2 and 3 by measurement rather than by
 * ticket: does sms.ir bill per SMS *part* or per message, and what does one
 * part actually cost?
 *
 * Support's answer («هر ۷۰ کاراکتر فارسی شامل یک پیامک میشود ... باتوجه به
 * تعداد آن هزینه هر تعداد پیامک از شما کسر خواهد شد») says per part, but it
 * quotes 70 for every part, where a concatenated SMS only carries 67 — six
 * bytes of each part go on the header that says how to reassemble it. That
 * difference decides whether our 134-character ceiling is two parts or
 * three, so it is worth one paid experiment.
 *
 * ⚠️ THIS SENDS REAL MESSAGES AND SPENDS REAL CREDIT. Two of them, to a
 * number you give it. Run it against your own phone.
 *
 *   pnpm exec tsx scripts/sms-cost-probe.ts 09121234567 --yes
 *
 * Run it from `backend/` with the normal `.env` in place. It needs
 * SMS_API_KEY and the template ids, and also DATABASE_URL_APP — not because
 * it touches the database, but because `smsPricing.ts` imports the Prisma
 * client for `currentUnitPriceRials`, and that module refuses to load
 * without it. Prisma connects lazily, so Postgres need not be running.
 *
 * ⚠️ sms.ir allowlists by IP. From anywhere but the server this returns
 * HTTP 401 or 403, which is indistinguishable from a bad key.
 *
 * It uses `device_accepted`, which is already approved, because that
 * template is the only one of the three that can be driven to either side of
 * the boundary: one character per parameter renders 65 characters (one
 * part), the caps render 127 (two). No new template to submit and nothing to
 * wait for.
 *
 * Read the result like this:
 *
 *   cost(long) ≈ 2 × cost(short)   → billed per part. Our costing is right,
 *                                    and `unitPriceRials` is a price per
 *                                    part as `smsPricing.ts` assumes.
 *   cost(long) = cost(short)       → billed per message. Then `priceFor`
 *                                    should return `unitPriceRials` rather
 *                                    than multiplying by segments — one
 *                                    line, and every stored row stays
 *                                    readable because `segments` and
 *                                    `unit_price_rials` are separate columns.
 *
 * Also write down the panel's credit before and after. `cost` is sms.ir's
 * own number and this is the run that establishes what unit it is in.
 */
import "dotenv/config";

/*
 * ⚠️ The three imports below are dynamic, inside main(), and that is not
 * style. `lib/sms.ts` checks SMS_API_KEY and every template id at import
 * time and throws if one is missing — deliberately, so the API cannot boot
 * with no way to send. A static import here would make that check run before
 * argv is even looked at, and the usage message would be unreachable to
 * anyone without a production key in their .env. A script whose --help needs
 * credentials is a script nobody can read.
 */

/** Renders a body the way sms.ir will, so the local prediction is honest. */
function render(body: string, values: Record<string, string>): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`#${name}#`, value),
    body,
  );
}

async function main() {
  const [phone, ...flags] = process.argv.slice(2);

  if (!phone || !flags.includes("--yes")) {
    console.error(
      "Usage: pnpm exec tsx scripts/sms-cost-probe.ts <09xxxxxxxxx> --yes\n\n" +
        "Sends TWO real messages and spends real credit. --yes is the\n" +
        "acknowledgement; there is no dry run, because a dry run would\n" +
        "answer nothing.",
    );
    process.exitCode = 1;
    return;
  }

  const { sendTemplate, SMS_TEMPLATES } = await import("../src/lib/sms");
  const { DEVICE_SMS, PARAM_CAPS } = await import("../src/utils/smsTemplates");
  const { countSegments } = await import("../src/utils/smsPricing");

  const SHORT = { NAME: "ع", DEVICE: "و", NUMBER: "1", SHOP: "ش" };

  const LONG = {
    NAME: "ا".repeat(PARAM_CAPS.NAME),
    DEVICE: "ب".repeat(PARAM_CAPS.DEVICE),
    NUMBER: "9".repeat(PARAM_CAPS.NUMBER),
    SHOP: "پ".repeat(PARAM_CAPS.SHOP),
  };

  const body = DEVICE_SMS.device_accepted.body;

  for (const [label, values] of [
    ["short", SHORT],
    ["long ", LONG],
  ] as const) {
    const text = render(body, values);
    const predicted = countSegments(text);

    console.log(
      `\n${label}  ${text.length} chars  →  we predict ${predicted} part(s)`,
    );

    try {
      const result = await sendTemplate(
        phone,
        SMS_TEMPLATES.DEVICE_ACCEPTED,
        values,
      );
      console.log(
        `       sms.ir: messageId=${result.messageId} cost=${result.cost}`,
      );
    } catch (error) {
      // Printed rather than thrown: if the first send fails, the second is
      // still worth attempting — one of the two answering is better than
      // neither, and a failure here is information too.
      console.error(`       FAILED: ${(error as Error).message}`);
    }
  }

  console.log(
    "\nNow compare the two costs, and check the panel's credit before and\n" +
      "after. Record the answer on roadmap open questions 2 and 3.",
  );
}

void main();
