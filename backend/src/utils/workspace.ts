import { Request } from "express";
import { AuthenticatedRequest } from "../types/request";

/**
 * The workspace the caller belongs to, taken from the verified token.
 *
 * Throws rather than returning undefined: every tenant-scoped query needs
 * this, and a missing value means a bug in the auth chain, not a request to
 * serve with unscoped data. Never read it from the request body or query —
 * that would let a caller reach another workspace's rows (RULES.md §6).
 */
export function workspaceIdOf(req: Request): number {
  const workspaceId = (req as AuthenticatedRequest).user?.workspaceId;

  if (typeof workspaceId !== "number") {
    throw new Error(
      "No workspace on the request. authenticate() must run before any " +
        "tenant-scoped handler.",
    );
  }

  return workspaceId;
}
