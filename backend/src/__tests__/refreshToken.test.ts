import {
  REFRESH_TOKEN_DAYS,
  generateRefreshToken,
  hashRefreshToken,
  refreshCookieOptions,
  refreshTokenExpiry,
} from "../utils/refreshToken";

describe("generateRefreshToken", () => {
  it("produces a URL-safe value", () => {
    // The token travels in a cookie, where + and / would need escaping.
    expect(generateRefreshToken()).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("never repeats", () => {
    const tokens = new Set(
      Array.from({ length: 100 }, () => generateRefreshToken()),
    );
    expect(tokens.size).toBe(100);
  });
});

describe("hashRefreshToken", () => {
  it("is deterministic, so a presented token finds its row", () => {
    const token = generateRefreshToken();
    expect(hashRefreshToken(token)).toBe(hashRefreshToken(token));
  });

  it("does not reveal the token it came from", () => {
    // What the database holds must be useless to whoever reads a dump.
    const token = generateRefreshToken();
    const hash = hashRefreshToken(token);

    expect(hash).not.toBe(token);
    expect(hash).not.toContain(token);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("separates tokens that differ by one character", () => {
    const a = hashRefreshToken("aaaaaaaa");
    const b = hashRefreshToken("aaaaaaab");
    expect(a).not.toBe(b);
  });
});

describe("refreshTokenExpiry", () => {
  it("lands thirty days out", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    const expires = refreshTokenExpiry(from);

    const days = (expires.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    expect(days).toBe(REFRESH_TOKEN_DAYS);
  });

  it("leaves the date it was given alone", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    refreshTokenExpiry(from);
    expect(from.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});

describe("refreshCookieOptions", () => {
  const expires = new Date("2026-02-01T00:00:00.000Z");

  it("keeps the cookie away from script and from other sites", () => {
    const options = refreshCookieOptions(expires);

    // httpOnly is the entire reason this isn't in localStorage; strict
    // because nothing legitimately posts to these endpoints cross-site.
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe("strict");
  });

  it("scopes the cookie to the endpoints that use it", () => {
    // Otherwise it rides along on every ordinary API call for no reason.
    expect(refreshCookieOptions(expires).path).toBe("/api/auth");
  });

  it("marks the cookie secure only in production", () => {
    const original = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "production";
      expect(refreshCookieOptions(expires).secure).toBe(true);

      // A secure cookie is silently dropped over plain http, and local dev
      // has no TLS — so a blanket true would break development with no
      // visible error.
      process.env.NODE_ENV = "development";
      expect(refreshCookieOptions(expires).secure).toBe(false);
    } finally {
      process.env.NODE_ENV = original;
    }
  });
});
