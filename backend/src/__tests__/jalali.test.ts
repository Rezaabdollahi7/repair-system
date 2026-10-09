import {
  jalaliMonthLabel,
  lastJalaliMonths,
  toJalaliSms,
} from "../utils/jalali";

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

describe("lastJalaliMonths", () => {
  it("ends with the month the date falls in", () => {
    // 2026-08-15 is ۲۴ مرداد ۱۴۰۵.
    const months = lastJalaliMonths(3, new Date("2026-08-15T00:00:00.000Z"));

    expect(months).toEqual([
      { jy: 1405, jm: 3 },
      { jy: 1405, jm: 4 },
      { jy: 1405, jm: 5 },
    ]);
  });

  it("walks back across a year boundary", () => {
    // 2026-04-10 is ۲۱ فروردین ۱۴۰۵, so two months back is اسفند ۱۴۰۴.
    const months = lastJalaliMonths(3, new Date("2026-04-10T00:00:00.000Z"));

    expect(months).toEqual([
      { jy: 1404, jm: 11 },
      { jy: 1404, jm: 12 },
      { jy: 1405, jm: 1 },
    ]);
  });

  it("returns as many months as asked for", () => {
    expect(
      lastJalaliMonths(12, new Date("2026-08-15T00:00:00.000Z")),
    ).toHaveLength(12);
  });
});

describe("jalaliMonthLabel", () => {
  it("names the month and puts the year in Persian digits", () => {
    expect(jalaliMonthLabel({ jy: 1405, jm: 5 })).toBe("مرداد ۱۴۰۵");
  });
});
