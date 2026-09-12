import request from "supertest";
import app from "../../app";
import prisma from "../../lib/prisma";
import {
  disconnectOwner,
  seedTechnician,
  seedTwoWorkspaces,
  truncateAll,
  type SeededUser,
  type TwoWorkspaces,
} from "./helpers";

import itemRoutes from "../../routes/items";
import purchaseInvoiceRoutes from "../../routes/purchaseInvoices";
import saleInvoiceRoutes from "../../routes/saleInvoices";
import repairInvoiceRoutes from "../../routes/repairInvoices";
import reportRoutes from "../../routes/reports";

// The point of this suite is not that atLeast("admin") works — authorize.test.ts
// covers that, and it always did. What failed was nobody wiring it up. So the
// endpoints are not listed here: they are read off the routers themselves, and
// a path added tomorrow is tested tomorrow without anyone remembering to come
// back. A route file that loses its guard has to turn this suite red.

/**
 * Mirrors routes/index.js. Duplicated deliberately — deriving the mounts from
 * the app would mean reading Express's own layer internals, which changed
 * shape in 5 and are not public. The duplication is pinned by the "prefixes
 * are real" test below: get one wrong and every request 404s.
 */
const GUARDED_ROUTERS: { prefix: string; router: unknown }[] = [
  { prefix: "/api/items", router: itemRoutes },
  { prefix: "/api/purchase-invoices", router: purchaseInvoiceRoutes },
  { prefix: "/api/sale-invoices", router: saleInvoiceRoutes },
  { prefix: "/api/repair-invoices", router: repairInvoiceRoutes },
  { prefix: "/api/reports", router: reportRoutes },
];

interface RouteLayer {
  route?: {
    path: string | string[];
    methods?: Record<string, boolean>;
    stack?: { method?: string }[];
  };
}

interface Endpoint {
  method: string;
  path: string;
}

/** `/:id/transactions` → `/1/transactions`. The id never gets looked up. */
function fillParams(path: string): string {
  return path.replace(/:[^/]+/g, "1");
}

function methodsOf(route: NonNullable<RouteLayer["route"]>): string[] {
  // Both shapes exist across Express versions; neither is documented, so read
  // whichever is there rather than betting on one.
  const fromMethods = Object.keys(route.methods ?? {});
  if (fromMethods.length > 0) return fromMethods;

  return (route.stack ?? [])
    .map((layer) => layer.method)
    .filter((m): m is string => Boolean(m));
}

function endpointsOf(prefix: string, router: unknown): Endpoint[] {
  const stack = (router as { stack?: RouteLayer[] }).stack;
  if (!stack) {
    throw new Error(
      `${prefix}: the router has no stack — Express changed shape and this ` +
        `suite is no longer reading anything. Fix the traversal, do not ` +
        `delete the assertion.`,
    );
  }

  const endpoints: Endpoint[] = [];

  for (const layer of stack) {
    if (!layer.route) continue;

    const paths = Array.isArray(layer.route.path)
      ? layer.route.path
      : [layer.route.path];

    for (const path of paths) {
      for (const method of methodsOf(layer.route)) {
        if (method.toLowerCase() === "head") continue;
        endpoints.push({
          method: method.toUpperCase(),
          path: prefix + fillParams(path === "/" ? "" : path),
        });
      }
    }
  }

  // Zero discovered endpoints would make every test below pass by having
  // nothing to run — the exact silence this suite exists to break.
  if (endpoints.length < 4) {
    throw new Error(
      `${prefix}: found only ${endpoints.length} endpoints, which cannot be ` +
        `right. Traversal is broken.`,
    );
  }

  return endpoints;
}

const ENDPOINTS = GUARDED_ROUTERS.flatMap(({ prefix, router }) =>
  endpointsOf(prefix, router),
);

let workspaces: TwoWorkspaces;
let technician: SeededUser;

// beforeAll rather than beforeEach: a 403 writes nothing, so there is no state
// for one case to leave behind for the next — and this suite runs ~34 of them.
beforeAll(async () => {
  await truncateAll();
  workspaces = await seedTwoWorkspaces();
  technician = await seedTechnician(workspaces.a.workspaceId, "09120000003");
});

afterAll(async () => {
  await disconnectOwner();
  await prisma.$disconnect();
});

function call(method: string, path: string, token: string) {
  const agent = request(app) as unknown as Record<
    string,
    (p: string) => request.Test
  >;

  return agent[method.toLowerCase()](path)
    .set("Authorization", `Bearer ${token}`)
    .send({});
}

describe("every path under the five admin-only routers", () => {
  for (const { method, path } of ENDPOINTS) {
    it(`refuses a technician: ${method} ${path}`, async () => {
      const res = await call(method, path, technician.token);

      expect(res.status).toBe(403);
      // The message, not just the status: an inactive account and a missing
      // role both answer 403, and only one of them is what is being tested.
      expect(res.body.error).toBe("دسترسی ندارید");
    });
  }

  for (const { method, path } of ENDPOINTS) {
    it(`admits a super admin: ${method} ${path}`, async () => {
      // atLeast, not authorize: a guard that turned away the shop's owner
      // would satisfy every test above and break the product.
      const res = await call(method, path, workspaces.a.token);

      expect(res.status).not.toBe(403);
    });
  }
});

describe("the mount prefixes", () => {
  // Without this, a wrong prefix would 404 — and 404 is neither 403 nor 403,
  // so both loops above would pass while testing nothing at all.
  const LIST_PATHS = [
    "/api/items",
    "/api/purchase-invoices",
    "/api/sale-invoices",
    "/api/repair-invoices",
    "/api/reports/dashboard",
  ];

  for (const path of LIST_PATHS) {
    it(`is real: GET ${path}`, async () => {
      const res = await call("GET", path, workspaces.a.token);

      expect(res.status).toBe(200);
    });
  }
});
