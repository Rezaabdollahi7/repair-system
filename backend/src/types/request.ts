import { Request } from "express";

/**
 * The JWT payload auth.js puts on the request. Declared here rather than in
 * the middleware because auth.js is still CommonJS and moves to TypeScript in
 * phase 3, when the token shape changes anyway.
 */
export interface AuthUser {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
}

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};
