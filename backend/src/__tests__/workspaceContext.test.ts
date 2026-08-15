import type { NextFunction, Request, Response } from "express";
import {
  currentWorkspaceId,
  restoreWorkspaceContext,
  runWithRequestContext,
  setContextWorkspaceId,
} from "../lib/workspaceContext";

describe("workspaceContext", () => {
  it("has no workspace outside a request", () => {
    expect(currentWorkspaceId()).toBeUndefined();
  });

  it("refuses to record a workspace with no context open", () => {
    // Silently dropping it would send the value nowhere and surface later as
    // a query failure pointing at the wrong place.
    expect(() => setContextWorkspaceId(1)).toThrow(/requestContext/);
  });

  it("has no workspace until one is recorded", () => {
    runWithRequestContext(() => {
      // The context opens before the token is read, so this is the state
      // every unauthenticated request stays in.
      expect(currentWorkspaceId()).toBeUndefined();
    });
  });

  it("carries the workspace across await boundaries", async () => {
    await runWithRequestContext(async () => {
      setContextWorkspaceId(7);
      await new Promise((resolve) => setTimeout(resolve, 5));
      expect(currentWorkspaceId()).toBe(7);
    });
  });

  it("keeps concurrent requests from seeing each other's workspace", async () => {
    // The reason this is AsyncLocalStorage and not a module-level variable:
    // Node interleaves requests on one thread, and a shared variable would
    // let one workshop's request run under another's workspace.
    const observed: Record<number, number | undefined> = {};

    async function handleRequest(workspaceId: number, delayMs: number) {
      return runWithRequestContext(async () => {
        setContextWorkspaceId(workspaceId);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        observed[workspaceId] = currentWorkspaceId();
      });
    }

    // The slower one is started first, so its continuation resumes after the
    // faster one has already set its own value.
    await Promise.all([handleRequest(1, 20), handleRequest(2, 0)]);

    expect(observed).toEqual({ 1: 1, 2: 2 });
  });

  it("closes the context when the request ends", async () => {
    await runWithRequestContext(async () => {
      setContextWorkspaceId(3);
    });

    expect(currentWorkspaceId()).toBeUndefined();
  });
});

describe("restoreWorkspaceContext", () => {
  function requestWith(workspaceId?: number) {
    return { user: workspaceId ? { workspaceId } : undefined } as Request;
  }

  /**
   * Stands in for multer: busboy hands control back from a stream event,
   * which AsyncLocalStorage does not follow. Everything after it runs with no
   * store at all — not an empty one, none.
   */
  function afterAStreamEvent(fn: () => void) {
    return new Promise<void>((resolve) => {
      setImmediate(() => {
        fn();
        resolve();
      });
    });
  }

  it("gives back a workspace where multer took the context away", async () => {
    let seen: number | undefined = -1;

    await runWithRequestContext(async () => {
      setContextWorkspaceId(5);

      await afterAStreamEvent(() => {
        const next = (() => {
          seen = currentWorkspaceId();
        }) as NextFunction;

        restoreWorkspaceContext(requestWith(5), {} as Response, next);
      });
    });

    expect(seen).toBe(5);
  });

  it("leaves the workspace unset when the request has no user", async () => {
    let seen: number | undefined = -1;

    const next = (() => {
      seen = currentWorkspaceId();
    }) as NextFunction;

    restoreWorkspaceContext(requestWith(), {} as Response, next);

    // Not a silent pass: the first query then throws, which is the right
    // outcome for a request that never authenticated.
    expect(seen).toBeUndefined();
  });

  it("closes its context when the handler returns", () => {
    restoreWorkspaceContext(
      requestWith(5),
      {} as Response,
      (() => {}) as NextFunction,
    );

    expect(currentWorkspaceId()).toBeUndefined();
  });
});
