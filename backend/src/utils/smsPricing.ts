import prisma from "../lib/prisma";

/**
 * What one message costs, and why.
 *
 * Two numbers go onto every `sms_messages` row: the unit price in force at
 * the time, and how many SMS parts the text came to. Both are stored rather
 * than recomputed, for the reason `payments.base_price_rials` is — a history
 * that re-renders at today's price is not a history.
 */

/**
 * A Persian message is UCS-2, always. Persian has no GSM-7 encoding, so
 * there is no 160-character case to detect: 70 characters in a single part,
 * 67 per part once the message is split, because a concatenated SMS spends
 * six bytes of each part on the header that says how to reassemble it.
 *
 * ⚠️ An ASCII-only template would be GSM-7 and get 160 per part, so this
 * would over-count it roughly two-to-one. Every template this application
 * sends is Persian and approved in Persian at sms.ir, so that case is not
 * handled — but it is the assumption to check first if a cost ever looks
 * twice what it should.
 */
const SINGLE_PART_CHARS = 70;
const CONCATENATED_PART_CHARS = 67;

/**
 * How many parts a rendered message will be billed as.
 *
 * Counts UTF-16 code units rather than characters, which is what an SMS
 * actually carries — and matters for emoji, where one visible glyph is a
 * surrogate pair and costs two. JavaScript's `String.length` is already
 * that count, which is the one place its awkwardness is the right answer.
 *
 * Pure, and tested on its own: this is the multiplier on every message the
 * platform sends, and getting it wrong is a margin that quietly inverts.
 */
export function countSegments(text: string): number {
  const units = text.length;

  // A message with nothing in it still costs one part if it is sent at all.
  // Reaching here with an empty string means a template rendered to nothing,
  // which is a bug worth costing rather than hiding behind a zero.
  if (units <= SINGLE_PART_CHARS) {
    return 1;
  }

  return Math.ceil(units / CONCATENATED_PART_CHARS);
}

/**
 * The price in force right now, in rials per part.
 *
 * The greatest `effective_from` that is not in the future. No `is_active`
 * flag to contradict it, and no fallback constant: a missing price would
 * otherwise become a free message, and free messages are the failure nobody
 * notices until the provider's bill arrives.
 */
export async function currentUnitPriceRials(): Promise<number> {
  const row = await prisma.smsPrice.findFirst({
    where: { effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: { unitPriceRials: true },
  });

  if (!row) {
    throw new Error(
      "No SMS price is in force. sms_prices is reference data set with " +
        "psql; the 12.1 migration seeds an opening row, and a database " +
        "without one cannot cost a message.",
    );
  }

  return row.unitPriceRials.toNumber();
}

export interface MessagePrice {
  segments: number;
  unitPriceRials: number;
  costRials: number;
}

/**
 * Price × parts.
 *
 * This one line is where "per part or per message" lives, and it is the only
 * place that has to change if sms.ir turns out to bill the other way — which
 * is exactly why the schema stores `segments` and `unit_price_rials`
 * separately rather than a single figure. Billing per message would make
 * this return `unitPriceRials` and leave every stored row still readable.
 */
export function priceFor(text: string, unitPriceRials: number): MessagePrice {
  const segments = countSegments(text);

  return {
    segments,
    unitPriceRials,
    costRials: unitPriceRials * segments,
  };
}

/** The common case: read the current price and cost a rendered message. */
export async function priceMessage(text: string): Promise<MessagePrice> {
  return priceFor(text, await currentUnitPriceRials());
}
