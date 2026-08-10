import { AsyncLocalStorage } from "node:async_hooks";

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
