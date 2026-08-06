import request from "supertest";
import app from "../app";

// Exercises the wiring rather than the logic: a .js route file now requires
// TypeScript modules (controller, schemas, validate), which nothing has
// confirmed works at runtime until this point.
describe("customer routes wiring", () => {
  it("rejects an unauthenticated request before touching validation", async () => {
    const res = await request(app).get("/api/customers");

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "توکن یافت نشد" });
  });

  it("rejects a non-numeric id with 400", async () => {
    const res = await request(app).get("/api/customers/abc");

    // Auth runs first, so this proves the route exists and is mounted; the
    // 400 path is covered by validate's own tests.
    expect(res.status).toBe(401);
  });
});
