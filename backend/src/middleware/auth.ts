import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { setContextWorkspaceId } from "../lib/workspaceContext";
import type { AuthUser } from "../types/request";

export const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

/**
 * Narrows a verified JWT payload to the shape the app relies on.
 *
 * jwt.verify proves the token was signed by us, not that it carries the
 * fields we expect: a token issued by an older build is signed just as
 * validly. Checked field by field rather than cast, because a cast here would
 * push the failure into a handler that has no idea why its workspace is
 * undefined.
 */
function toAuthUser(payload: unknown): AuthUser | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const claims = payload as Record<string, unknown>;

  if (
    typeof claims.id !== "number" ||
    // Every tenant-scoped query is filtered by this, so a token without it
    // is unusable. Tokens predating it are treated as expired rather than
    // reaching a handler that throws for a missing workspace — that would
    // surface as a 500 instead of a prompt to sign in again.
    typeof claims.workspaceId !== "number" ||
    typeof claims.username !== "string" ||
    typeof claims.role !== "string" ||
    typeof claims.isActive !== "boolean"
  ) {
    return null;
  }

  return {
    id: claims.id,
    workspaceId: claims.workspaceId,
    username: claims.username,
    role: claims.role,
    isActive: claims.isActive,
  };
}

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length)
    : undefined;

  if (!token) {
    res.status(401).json({ error: "توکن یافت نشد" });
    return;
  }

  const invalid = { error: "توکن نامعتبر یا منقضی شده" };

  let payload: unknown;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    // Expiry, a bad signature and malformed input all land here and all mean
    // the same thing to the caller: sign in again.
    res.status(401).json(invalid);
    return;
  }

  const user = toAuthUser(payload);
  if (!user) {
    res.status(401).json(invalid);
    return;
  }

  req.user = user;

  // Also published to the async context, which is where the Prisma extension
  // reads it — req isn't reachable from inside the client. Without this every
  // tenant-scoped query throws.
  setContextWorkspaceId(user.workspaceId);

  next();
}
