import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { setContextWorkspaceId } from "../lib/workspaceContext";
import { requireWriteAccess } from "./subscription";
import type { AuthUser } from "../types/request";

// No fallback, deliberately. A default here is a signing key published in
// the repository: with JWT_SECRET unset, anyone could mint a token carrying
// any workspaceId, and RLS would faithfully scope every query to whatever
// the forged token claimed — the isolation from phase 2 defeated by an
// empty environment variable, with the app looking entirely healthy.
// Same reasoning as lib/prisma.ts and lib/sms.ts: refuse to start rather
// than run unsafely.
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error(
    "JWT_SECRET is not set. See backend/.env.example — there is no default " +
      "because a default would be a signing key anyone can read.",
  );
}

export const JWT_SECRET = jwtSecret;
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

export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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

  // The subscription check runs from here rather than being mounted in each
  // of the thirteen route files (8.3). It needs the context set above, so it
  // cannot go earlier; and a guard that has to be remembered per file is the
  // guard that was missing from five of them in phase 10.
  //
  // Not awaited into a try/catch: an error here is a database failure, and
  // handing it to next() lets Express answer 500 rather than this middleware
  // inventing a subscription verdict it has no basis for.
  await requireWriteAccess(req, res, next);
}
