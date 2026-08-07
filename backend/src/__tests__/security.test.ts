// The login rate-limit test below fires ten real requests through the
// controller, and the app's health check queries the database. Mocked so a
// unit test doesn't depend on a live database.
jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: {
    user: { findUnique: jest.fn().mockResolvedValue(null) },
    $queryRaw: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
  },
}));

import request from "supertest";
import app from "../app";

describe("security middleware", () => {
  it("sets baseline helmet security headers", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-dns-prefetch-control"]).toBe("off");
  });

  it("allows cross-origin loading of uploaded images", async () => {
    // Overridden away from helmet's "same-origin" default — see app.ts.
    const res = await request(app).get("/api/health");

    expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
  });

  it("blocks login attempts after exceeding the login rate limit", async () => {
    const credentials = { username: "nonexistent", password: "wrong" };

    for (let i = 0; i < 10; i++) {
      await request(app).post("/api/auth/login").send(credentials);
    }

    const res = await request(app).post("/api/auth/login").send(credentials);

    expect(res.status).toBe(429);
    expect(res.body).toEqual({
      error: "تلاش‌های ورود بیش از حد مجاز است. بعداً دوباره تلاش کنید",
    });
  });
});
