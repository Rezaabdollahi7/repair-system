import request from "supertest";
import app from "../app";

describe("smoke: app bootstrap", () => {
  it("GET /api/health reports OK with a connected database", async () => {
    const res = await request(app).get("/api/health");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      status: "OK",
      message: "Server is running",
      db: "connected",
    });
  });

  it("GET /api/health responds as JSON", async () => {
    const res = await request(app).get("/api/health");

    expect(res.headers["content-type"]).toMatch(/application\/json/);
  });

  // Proves the /api router is actually mounted and its auth middleware runs —
  // a bare 404 assertion would pass even if routes/index.js were never wired.
  it("rejects a protected route when no token is supplied", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "توکن یافت نشد" });
  });
});
