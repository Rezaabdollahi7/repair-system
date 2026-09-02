import { toJalaliSms } from "../utils/jalali";

describe("toJalaliSms", () => {
  it("formats with dashes and Persian digits", () => {
    // ⚠️ Dashes, not slashes: whether sms.ir accepts a slash in a parameter
    // was never established, and the failure would be an HTTP 400 that reads
    // like a wrong template id.
    expect(toJalaliSms(new Date("2026-12-03T09:00:00.000Z"))).toBe(
      "۱۴۰۵-۰۹-۱۲",
    );
  });

  it("pads single-digit months and days", () => {
    expect(toJalaliSms(new Date("2026-03-25T09:00:00.000Z"))).toMatch(
      /^۱۴۰[۴۵]-۰۱-۰[۴۵]$/,
    );
  });

  it("never emits a character sms.ir might reject", () => {
    for (let i = 0; i < 400; i += 1) {
      const value = toJalaliSms(new Date(Date.now() + i * 86_400_000));
      expect(value).toMatch(/^[۰-۹]{4}-[۰-۹]{2}-[۰-۹]{2}$/);
      expect(value.length).toBeLessThanOrEqual(40);
    }
  });
});
