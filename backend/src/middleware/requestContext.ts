import { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "../lib/workspaceContext";

/**
 * Opens the per-request context that every downstream handler runs inside.
 *
 * Mounted ahead of the routers rather than beside authenticate(), because the
 * context has to exist before the token is read: authenticate() writes the
 * workspace into a store that is already open.
 */
export function requestContext(
  _req: Request,
  _res: Response,
  next: NextFunction,
) {
  runWithRequestContext(() => next());
}
