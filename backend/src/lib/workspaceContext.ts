import { AsyncLocalStorage } from "node:async_hooks";
import type { NextFunction, Request, Response } from "express";

/**
 * Per-request state that has to reach code with no access to `req` — the
 * Prisma client extension in lib/prisma.ts being the only consumer today.
 */
export interface RequestContext {
  /** Filled in by authenticate() once the token is verified, not before. */
  workspaceId?: number;
}

// AsyncLocalStorage rather than a module-level variable: Node serves many
// requests concurrently on one thread, and a shared variable would let one
// request read another's workspace — the exact leak this phase exists to
// prevent. The store follows the await chain automatically and is discarded
// when the request's call stack unwinds.
const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Opens an empty context for the duration of `fn`, once per request.
 *
 * The stored object is mutable on purpose: the context has to exist before
 * the token is read, so authenticate() fills the workspace in later rather
 * than opening a second store.
 */
export function runWithRequestContext<T>(fn: () => T): T {
  return storage.run({}, fn);
}

export function setContextWorkspaceId(workspaceId: number): void {
  const store = storage.getStore();

  // Throws rather than no-opping: without a store the value would go
  // nowhere, every later query would fail for a reason pointing at the wrong
  // place, and the middleware order that caused it would stay invisible.
  if (!store) {
    throw new Error(
      "No request context. requestContext() must run before authenticate().",
    );
  }

  store.workspaceId = workspaceId;
}

/** undefined outside a request, or inside one that hasn't authenticated yet. */
export function currentWorkspaceId(): number | undefined {
  return storage.getStore()?.workspaceId;
}

/**
 * Re-opens the request context after middleware that severs it.
 *
 * AsyncLocalStorage propagates through promises but not through stream
 * events, and multer reads a multipart body through busboy — so everything
 * after it runs with no store at all, not merely an empty one. req.user
 * survives, because that lives on the request object rather than in the
 * context.
 *
 * Opening a fresh store rather than writing into the old one is therefore
 * the only option: there is nothing left to write into. Safe because the
 * workspace comes from the same verified token authenticate() already read.
 *
 * Placed after the multer middleware on any route that accepts a file.
 */
export function restoreWorkspaceContext(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const workspaceId = (req as { user?: { workspaceId?: number } }).user
    ?.workspaceId;

  storage.run({ workspaceId }, () => next());
}

/**
 * Opens a context for work that happens outside a request.
 *
 * The export builder runs after its response has been sent, so the store the
 * request opened is gone by then — the same shape of problem multer causes,
 * arriving from the other direction. Without this every query in the build
 * would reach the extension with no workspace and throw.
 *
 * The workspace comes from the row the request already wrote under its own
 * verified token, never from anything the caller supplied.
 */
export function runWithWorkspace<T>(workspaceId: number, fn: () => T): T {
  return storage.run({ workspaceId }, fn);
}
