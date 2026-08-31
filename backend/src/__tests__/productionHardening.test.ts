/**
 * Three environment-driven branches that decide whether a production boot is
 * safe or merely looks it. Each rebuilds the module graph, because all three
 * are read once at import time — which is why these use dynamic import
 * rather than the usual import at the top of the file.
 */

/**
 * Assigning undefined to process.env stores the string "undefined" instead
 * of removing the variable, and leaves it there for whatever runs next. That
 * malformed value is exactly what one of these blocks checks for.
 */
function restoreEnv(key: string, original: string | undefined) {
  if (original === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = original;
  }
}

describe("JWT_SECRET has no fallback", () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    restoreEnv("JWT_SECRET", original);
    jest.resetModules();
  });

  it("refuses to load when unset", async () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();

    // A default here would be a signing key committed to this repository:
    // anyone could mint a token carrying any workspaceId, and RLS would
    // scope every query to exactly what the forged token claimed.
    await expect(import("../middleware/auth")).rejects.toThrow(/JWT_SECRET/);
  });

  it("uses the value it is given", async () => {
    process.env.JWT_SECRET = "a-real-secret";
    jest.resetModules();

    const { JWT_SECRET } = await import("../middleware/auth");
    expect(JWT_SECRET).toBe("a-real-secret");
  });
});

describe("trust proxy", () => {
  const original = process.env.TRUST_PROXY;

  afterEach(() => {
    restoreEnv("TRUST_PROXY", original);
    jest.resetModules();
  });

  it("is a hop count, never a boolean", async () => {
    process.env.TRUST_PROXY = "1";
    jest.resetModules();

    // `true` would trust the whole client-written X-Forwarded-For chain,
    // letting a caller pick a new address per request and never land in the
    // same rate-limit bucket twice — which voids the per-IP half of the OTP
    // limit, the half that guards an SMS balance.
    const app = (await import("../app")).default;
    expect(app.get("trust proxy")).toBe(1);
  });

  it("defaults to trusting nothing", async () => {
    delete process.env.TRUST_PROXY;
    jest.resetModules();

    const app = (await import("../app")).default;
    expect(app.get("trust proxy")).toBe(0);
  });

  it("rejects a value that is not a hop count", async () => {
    process.env.TRUST_PROXY = "true";
    jest.resetModules();

    await expect(import("../app")).rejects.toThrow(/TRUST_PROXY/);
  });

  it("rejects the string a careless env restore leaves behind", async () => {
    process.env.TRUST_PROXY = "undefined";
    jest.resetModules();

    await expect(import("../app")).rejects.toThrow(/TRUST_PROXY/);
  });
});

describe("CORS", () => {
  const original = process.env.NODE_ENV;
  const originalMerchant = process.env.ZIBAL_MERCHANT;

  afterEach(() => {
    restoreEnv("NODE_ENV", original);
    restoreEnv("ZIBAL_MERCHANT", originalMerchant);
    jest.resetModules();
  });

  it("sends no cross-origin headers in production", async () => {
    process.env.NODE_ENV = "production";
    // A real-looking merchant, because lib/zibal refuses to load in
    // production with Zibal's shared test one — and app.ts reaches it
    // through the subscription routes. That guard has its own tests below;
    // this block is about CORS.
    process.env.ZIBAL_MERCHANT = "not-the-test-merchant";
    jest.resetModules();

    const request = (await import("supertest")).default;
    const app = (await import("../app")).default;

    const response = await request(app)
      .get("/api/health")
      .set("Origin", "https://not-ours.example");

    // Since 7.2 the frontend calls a relative /api, so in production the SPA
    // and the API are one origin and CORS has nothing left to do.
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("reflects the dev server's origin outside production", async () => {
    process.env.NODE_ENV = "test";
    jest.resetModules();

    const request = (await import("supertest")).default;
    const app = (await import("../app")).default;

    const response = await request(app)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});

describe("the Zibal test merchant cannot reach production", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalMerchant = process.env.ZIBAL_MERCHANT;

  afterEach(() => {
    restoreEnv("NODE_ENV", originalEnv);
    restoreEnv("ZIBAL_MERCHANT", originalMerchant);
    jest.resetModules();
  });

  it("stops the whole app from loading, not just the payment module", async () => {
    process.env.NODE_ENV = "production";
    process.env.ZIBAL_MERCHANT = "zibal";
    jest.resetModules();

    // Every capability works against Zibal's shared test account and no
    // money moves, which is what makes it dangerous in production: the app
    // would look entirely healthy while activating subscriptions nobody
    // paid for. The difference is one string in one file.
    //
    // Asserted through app.ts rather than lib/zibal directly, because what
    // matters is that the container refuses to boot — a process in a restart
    // loop is a problem someone notices within the hour.
    await expect(import("../app")).rejects.toThrow(/shared test merchant/);
  });

  it("allows it outside production, where it is the right value", async () => {
    process.env.NODE_ENV = "test";
    process.env.ZIBAL_MERCHANT = "zibal";
    jest.resetModules();

    await expect(import("../app")).resolves.toBeDefined();
  });

  it("is case-insensitive about it", async () => {
    // The docs write it lowercase and support wrote it uppercase, so both
    // are values someone will genuinely paste into an env file.
    process.env.NODE_ENV = "production";
    process.env.ZIBAL_MERCHANT = "ZIBAL";
    jest.resetModules();

    await expect(import("../app")).rejects.toThrow(/shared test merchant/);
  });
});
