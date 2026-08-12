import crypto from "node:crypto";

/** Thirty days, per CLAUDE.md's token strategy. */
export const REFRESH_TOKEN_DAYS = 30;

/** Fifteen minutes: short enough that a leaked access token ages out fast. */
export const ACCESS_TOKEN_TTL = "15m";

export const REFRESH_COOKIE_NAME = "dofixo_refresh";

/**
 * A 32-byte random secret, not a JWT.
 *
 * A JWT here would invite verifying it without touching the database, which
 * is precisely the property this token must not have: the whole reason it
 * exists is that a session can be taken back.
 *
 * base64url rather than base64: the value travels in a cookie, and `+` and
 * `/` would need escaping.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * What goes in the database — never the token itself, so a leaked dump
 * contains nothing replayable.
 *
 * SHA-256 rather than bcrypt: this is a 32-byte random secret, not a human
 * password, so there is no dictionary to slow an attacker down against. A
 * deliberately slow hash would only tax every legitimate refresh.
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function refreshTokenExpiry(from = new Date()): Date {
  const expires = new Date(from);
  expires.setDate(expires.getDate() + REFRESH_TOKEN_DAYS);
  return expires;
}

/**
 * Cookie options for the refresh token.
 *
 * httpOnly so script cannot read it, which is the point of not keeping it in
 * localStorage. sameSite strict because nothing legitimately posts to these
 * endpoints from another site. secure only in production, since a secure
 * cookie is silently dropped over plain http and local dev has no TLS.
 *
 * The path is narrowed to the two endpoints that use it, so the token isn't
 * attached to every ordinary API call it has no business being on.
 */
export function refreshCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth",
    expires,
  };
}
