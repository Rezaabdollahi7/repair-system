import { NextFunction, Request, Response } from "express";
import { ZodError, ZodType } from "zod";

export interface ValidationSchemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * A request that has been through validate(). Handlers read their input from
 * req.valid rather than req.body/req.params/req.query, because only these
 * values have been checked against a schema — and because Express types
 * params as `string | string[]`, which a schema narrows and coerces.
 *
 * An intersection rather than an interface extending Request: under pnpm's
 * strict layout more than one copy of @types/express-serve-static-core can be
 * present, and inheriting from one of them produces a type the other doesn't
 * recognise as a Request.
 */
export type ValidatedRequest<
  TBody = unknown,
  TParams = unknown,
  TQuery = unknown,
> = Request & {
  valid: {
    body: TBody;
    params: TParams;
    query: TQuery;
  };
};

function formatIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join("، ");
}

/**
 * Validates request input against Zod schemas before the handler runs,
 * rejecting with 400 and a Persian message rather than letting malformed
 * input reach the database layer.
 *
 * Only the parts given a schema are populated — a route that validates params
 * but not body leaves req.valid.body undefined.
 */
export function validate(schemas: ValidationSchemas) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const valid = {
        body: schemas.body ? schemas.body.parse(req.body) : undefined,
        params: schemas.params ? schemas.params.parse(req.params) : undefined,
        query: schemas.query ? schemas.query.parse(req.query) : undefined,
      };

      (req as ValidatedRequest).valid = valid;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({ error: formatIssues(error) });
      }
      // Not a validation problem — hand it to Express's error handling rather
      // than swallowing it as a 400.
      next(error);
    }
  };
}
