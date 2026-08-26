import request from "supertest";

/**
 * Three environment-driven branches that decide whether a production boot is
 * safe or merely looks it. Each rebuilds the module graph, because all three
 * are read once at import time.
 */

describe("JWT_SECRET has no fallback", () => {
  const original = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = original;
    jest.resetModules();
  });

  it("refuses to load when unset", () => {
    delete process.env.JWT_SECRET;
    jest.resetModules();
    expect(() => require("../middleware/auth")).toThrow(/JWT_SECRET/);
  });

  it("uses the value it is given", () => {
    process.env.JWT_SECRET = "a-real-secret";
    jest.resetModules();
    expect(require("../middleware/auth").JWT_SECRET).toBe("a-real-secret");
  });
});

describe("trust proxy", () => {
  const original = process.env.TRUST_PROXY;

  afterEach(() => {
    // Assigning undefined to process.env yields the string "undefined", not
    // an absent variable — which is exactly the malformed input this block
    // is checking for, left behind for whatever runs next.
    if (original === undefined) {
      delete process.env.TRUST_PROXY;
    } else {
      process.env.TRUST_PROXY = original;
    }
    jest.resetModules();
  });

  it("is a hop count, never a boolean", () => {
    process.env.TRUST_PROXY = "1";
    jest.resetModules();
    // `true` would trust the whole client-written X-Forwarded-For chain,
    // letting a caller pick a new IP per request and dodge the OTP limit.
    expect(require("../app").default.get("trust proxy")).toBe(1);
  });

  it("defaults to trusting nothing", () => {
    delete process.env.TRUST_PROXY;
    jest.resetModules();
    expect(require("../app").default.get("trust proxy")).toBe(0);
  });

  it("rejects a value that is not a hop count", () => {
    process.env.TRUST_PROXY = "true";
    jest.resetModules();
    expect(() => require("../app")).toThrow(/TRUST_PROXY/);
  });

  it("rejects a non-numeric value", () => {
    process.env.TRUST_PROXY = "undefined";
    jest.resetModules();
    expect(() => require("../app")).toThrow(/TRUST_PROXY/);
  });
  
});

describe("CORS", () => {
  const original = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = original;
    jest.resetModules();
  });

  it("sends no cross-origin headers in production", async () => {
    process.env.NODE_ENV = "production";
    jest.resetModules();
    const response = await request(require("../app").default)
      .get("/api/health")
      .set("Origin", "https://not-ours.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("reflects the dev server's origin outside production", async () => {
    process.env.NODE_ENV = "test";
    jest.resetModules();
    const response = await request(require("../app").default)
      .get("/api/health")
      .set("Origin", "http://localhost:5173");

    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
  });
});
