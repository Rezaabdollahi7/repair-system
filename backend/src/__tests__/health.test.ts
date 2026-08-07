import request from "supertest";
import app from "../app";
import prisma from "../lib/prisma";

jest.mock("../lib/prisma", () => ({
  __esModule: true,
  default: { $queryRaw: jest.fn() },
}));

const db = prisma as unknown as { $queryRaw: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  db.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
});

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

  it("reports 503 when the database can't be reached", async () => {
    db.$queryRaw.mockRejectedValue(new Error("ECONNREFUSED"));

    const res = await request(app).get("/api/health");

    expect(res.status).toBe(503);
    expect(res.body.db).toBe("disconnected");
  });

  // Proves the /api router is actually mounted and its auth middleware runs —
  // a bare 404 assertion would pass even if routes/index.js were never wired.
  it("rejects a protected route when no token is supplied", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "توکن یافت نشد" });
  });
});
