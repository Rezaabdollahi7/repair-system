import { NextFunction, Response } from "express";
import { z } from "zod";
import { validate, ValidatedRequest } from "../middleware/validate";

function mockResponse() {
  const res = {} as Response & { status: jest.Mock; json: jest.Mock };
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockRequest(overrides: Record<string, unknown> = {}) {
  // Double cast: a bare object literal doesn't overlap enough with Request
  // for a direct assertion, and building a full Express request here would
  // add nothing — validate() only touches body, params and query.
  return {
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as unknown as ValidatedRequest;
}

describe("validate", () => {
  it("passes a valid body through and populates req.valid", () => {
    const schema = z.object({ name: z.string().min(1) });
    const req = mockRequest({ body: { name: "رضا" } });
    const next = jest.fn() as NextFunction;

    validate({ body: schema })(req, mockResponse(), next);

    expect(next).toHaveBeenCalledWith();
    expect(req.valid.body).toEqual({ name: "رضا" });
  });

  it("rejects an invalid body with 400 and a message naming the field", () => {
    const schema = z.object({ name: z.string().min(1, "نام الزامی است") });
    const res = mockResponse();
    const next = jest.fn() as NextFunction;

    validate({ body: schema })(mockRequest({ body: { name: "" } }), res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "name: نام الزامی است" });
    expect(next).not.toHaveBeenCalled();
  });

  it("coerces string params into the schema's type", () => {
    // Route params always arrive as strings; the schema is what turns "42"
    // into a number the handler can use directly.
    const schema = z.object({ id: z.coerce.number().int().positive() });
    const req = mockRequest({ params: { id: "42" } });

    validate({ params: schema })(req, mockResponse(), jest.fn());

    expect(req.valid.params).toEqual({ id: 42 });
  });

  it("rejects a non-numeric id param", () => {
    const schema = z.object({ id: z.coerce.number().int().positive() });
    const res = mockResponse();

    validate({ params: schema })(
      mockRequest({ params: { id: "abc" } }),
      res,
      jest.fn(),
    );

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("applies schema defaults to missing query values", () => {
    const schema = z.object({
      page: z.coerce.number().int().positive().default(1),
      limit: z.coerce.number().int().positive().max(100).default(10),
    });
    const req = mockRequest({ query: {} });

    validate({ query: schema })(req, mockResponse(), jest.fn());

    expect(req.valid.query).toEqual({ page: 1, limit: 10 });
  });

  it("leaves unvalidated parts undefined", () => {
    const req = mockRequest({ body: { anything: true } });

    validate({ params: z.object({}) })(req, mockResponse(), jest.fn());

    expect(req.valid.body).toBeUndefined();
  });

  it("reports every failing field, not just the first", () => {
    const schema = z.object({
      name: z.string().min(1, "نام الزامی است"),
      phone: z.string().min(1, "تلفن الزامی است"),
    });
    const res = mockResponse();

    validate({ body: schema })(
      mockRequest({ body: { name: "", phone: "" } }),
      res,
      jest.fn(),
    );

    expect(res.json).toHaveBeenCalledWith({
      error: "name: نام الزامی است، phone: تلفن الزامی است",
    });
  });

  it("forwards non-validation errors to next()", () => {
    const exploding = z.object({}).transform(() => {
      throw new TypeError("boom");
    });
    const next = jest.fn() as NextFunction;

    validate({ body: exploding })(mockRequest(), mockResponse(), next);

    expect(next).toHaveBeenCalledWith(expect.any(TypeError));
  });
});
