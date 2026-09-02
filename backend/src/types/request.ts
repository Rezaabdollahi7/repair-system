import { Request } from "express";

/**
 * The JWT payload authenticate() puts on the request, after checking field by
 * field that the verified token actually carries it.
 */
export interface AuthUser {
  id: number;
  workspaceId: number;
  username: string;
  role: string;
  isActive: boolean;
}

// Declared on Express's own Request rather than only through the alias below,
// so middleware in this folder can read req.user without casting. Optional
// because a request that hasn't passed authenticate() genuinely has no user —
// which is why workspaceIdOf throws rather than returning a default.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

/**
 * Kept for the controllers that already use it. Now equivalent to Request,
 * since the declaration above covers the same ground — the alias survives
 * only so fourteen controllers don't need touching in this task.
 */
export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};
