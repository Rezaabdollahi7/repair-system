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

  afterEach(() => {
    restoreEnv("NODE_ENV", original);
    jest.resetModules();
  });

  it("sends no cross-origin headers in production", async () => {
    process.env.NODE_ENV = "production";
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
