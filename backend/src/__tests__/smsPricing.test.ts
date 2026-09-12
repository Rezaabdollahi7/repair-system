import { countSegments, priceFor } from "../utils/smsPricing";

// The boundaries matter more than the middle: 70 and 71 are the difference
// between one part and two, and therefore between 350 toman and 700.
describe("countSegments", () => {
  const persian = (n: number) => "ا".repeat(n);

  it("fits 70 characters in one part and 71 in two", () => {
    expect(countSegments(persian(70))).toBe(1);
    expect(countSegments(persian(71))).toBe(2);
  });

  it("charges 67 per part once the message is split", () => {
    // Not 70 per part. A concatenated SMS spends six bytes of each part on
    // the header that says how to reassemble it, so the second part holds
    // less than the first one did on its own.
    expect(countSegments(persian(134))).toBe(2);
    expect(countSegments(persian(135))).toBe(3);
  });

  it("counts an emoji as the two units it occupies", () => {
    // One visible glyph, one surrogate pair, two UCS-2 units. A template
    // sitting one character under the limit goes to two parts when somebody
    // adds a 🌱 to it — which is most of why the approved templates have
    // none.
    expect("🌱".length).toBe(2);
    expect(countSegments(persian(69) + "🌱")).toBe(2);
    expect(countSegments(persian(68) + "🌱")).toBe(1);
  });

  it("costs an empty message as one part rather than nothing", () => {
    // A template that rendered to nothing is a bug. Costing it as zero would
    // hide it; costing it as a message makes it show up in the ledger.
    expect(countSegments("")).toBe(1);
  });

  it("puts the approved templates at two parts", () => {
    // The figures 12.2 was written around. Worst case at the truncation caps
    // — NAME 18, DEVICE 16, NUMBER 7, SHOP 22 — is 124 to 131 characters,
    // which is two parts and never three.
    for (const length of [124, 128, 131]) {
      expect(countSegments(persian(length))).toBe(2);
    }
  });
});

describe("priceFor", () => {
  it("multiplies the unit price by the parts", () => {
    // 1,750 rials a part is 175 toman, so a two-part message is the 350
    // toman the brief quotes.
    expect(priceFor("ا".repeat(100), 1_750)).toEqual({
      segments: 2,
      unitPriceRials: 1_750,
      costRials: 3_500,
    });
  });

  it("charges a one-part message half as much", () => {
    // The reason segments is stored rather than assumed: a shorter template
    // added later is automatically cheaper, with no second price row.
    expect(priceFor("ا".repeat(40), 1_750).costRials).toBe(1_750);
  });

  it("keeps the unit price it was given, whatever it is today", () => {
    // What makes a historical row readable: the price is an argument, not a
    // lookup, so re-pricing last month is impossible by construction.
    expect(priceFor("ا".repeat(100), 2_500).costRials).toBe(5_000);
  });
});
