import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client";
import { currentWorkspaceId } from "./workspaceContext";

// The API connects as dofixo_app, a role that owns nothing and is therefore
// subject to the RLS policies from task 2.3 — a table's owner ignores them.
// DATABASE_URL stays pointed at the owner for migrations and seeding, which
// have to see every workspace.
//
// No fallback to DATABASE_URL on purpose: falling back would silently return
// the app to a superuser connection that bypasses every policy, and nothing
// would look wrong until one tenant read another's rows.
const connectionString = process.env.DATABASE_URL_APP;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL_APP is not set — the API cannot start without it. It must " +
      "point at the unprivileged application role, not the database owner.",
  );
}

// Prisma 7 no longer connects on its own: the client delegates to a driver
// adapter, which owns the actual pg connection pool.
const adapter = new PrismaPg({ connectionString });

// Deliberately not exported. Everything below is built on this client;
// reaching for it elsewhere would issue a query with no workspace context,
// which RLS answers with zero rows and no error.
const basePrisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});

// set_config rather than SET LOCAL: SET LOCAL takes a literal, not a bound
// parameter, so the id would have to be interpolated into SQL text. The
// third argument is is_local — the value dies with the transaction and never
// reaches the next request that borrows this pooled connection.
function setWorkspace(workspaceId: number) {
  return basePrisma.$executeRaw`
    SELECT set_config('app.workspace_id', ${String(workspaceId)}, TRUE)
  `;
}

/**
 * The client every controller imports.
 *
 * Each model operation runs as a two-statement transaction so the workspace
 * is set on the same connection the query uses. Issued separately they would
 * land on different connections from the pool and the policy would see
 * nothing.
 */
const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const workspaceId = currentWorkspaceId();

        // Fails loudly rather than letting RLS answer with an empty result.
        // A query issued outside a request context is a bug in the auth
        // chain, and a silent empty list would be found weeks later by a
        // customer instead of now by whoever wrote it.
        if (workspaceId === undefined) {
          throw new Error(
            "No workspace context for this query. Handlers must run behind " +
              "authenticate(); interactive transactions must go through " +
              "runInWorkspaceTransaction().",
          );
        }

        const [, result] = await basePrisma.$transaction([
          setWorkspace(workspaceId),
          query(args) as Prisma.PrismaPromise<unknown>,
        ]);

        return result;
      },
    },
  },
});

/**
 * Interactive transactions, which the extension above cannot serve.
 *
 * An operation issued on a transaction client would re-enter the extension
 * and open a second transaction on a second connection: the set_config would
 * land there while the real work carried on, uncontexted, on the first. That
 * is a silent empty read in the middle of a write — an invoice that saves
 * while its stock adjustment quietly does nothing.
 *
 * So the transaction opens on the unextended client and sets its own context
 * as its first statement, with the workspace passed in from the caller's
 * token rather than inferred.
 */
export function runInWorkspaceTransaction<T>(
  workspaceId: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return basePrisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT set_config('app.workspace_id', ${String(workspaceId)}, TRUE)
    `;
    return fn(tx);
  });
}

export default prisma;
