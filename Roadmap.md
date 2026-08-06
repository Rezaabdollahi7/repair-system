# Dofixo — SaaS Migration Roadmap (0 → 100)

Purpose: this is the working checklist for turning Dofixo from a single-tenant app into a
multi-tenant SaaS. Each phase is broken into concrete tasks. Point Claude Code at a specific
numbered task (e.g. "do task 2.3 from ROADMAP.md") and it will have full context from CLAUDE.md.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Phase 0 — Foundations & Tooling

Groundwork that everything else depends on. No business logic changes yet.

- [x] 0.1 Set up local PostgreSQL (via Docker Compose) for development
- [x] 0.2 Add TypeScript to the backend (`tsconfig.json`, build/dev scripts, convert `server.js` entrypoint first)
- [x] 0.3 Add ESLint/Prettier config consistent across backend + frontend (if not already present)
- [x] 0.4 Add `helmet` and `express-rate-limit` to the Express app (basic config, not tuned yet)
- [x] 0.5 Set up Jest test runner for the backend with a first smoke test (e.g. health check endpoint)
- [x] 0.6 Set up Docker Compose for local dev: backend, frontend, Postgres, (optional) local S3-compatible mock (e.g. MinIO) for object storage testing
- [x] 0.7 Remove the unused `knex` dependency
- [x] 0.8 Add `zod` and a reusable request-validation middleware (body/params/query), so every controller rewritten in phase 1 validates input from the start rather than being revisited later

## Phase 1 — Database Migration: SQLite → PostgreSQL (single-tenant, no SaaS yet)

Goal: get onto Prisma + Postgres while the app is still functionally single-tenant. This isolates
the DB migration risk from the multi-tenancy risk.

- [x] 1.1 Design the initial Prisma schema, modeled on the current SQLite schema's entities (Device, Customer, Personnel, Item, Category, PurchaseInvoice, SaleInvoice, RepairInvoice, InvoiceItem, Settings, Backup, etc.)
- [x] 1.2 Run `prisma migrate dev` to generate the initial migration against local Postgres
- [ ] 1.3 Rewrite each controller's data-access calls to use Prisma Client instead of sql.js queries (one resource at a time: devices → customers → personnel → items → invoices → reports → settings)
- [ ] 1.4 Rewrite `backupHelper.js` / `backupScheduler.js` for Postgres (e.g. `pg_dump`-based backups instead of SQLite file copy)
- [ ] 1.5 Update `importFromExcel.js` / `importDeviceImages.js` / `resetAdmin.js` scripts for the new DB layer
- [ ] 1.6 Confirm the full app (frontend included) works end-to-end against Postgres locally, single-tenant, before moving to Phase 2

## Phase 2 — Multi-Tenancy

Goal: introduce `Workspace` as a first-class concept and isolate all tenant data by `workspaceId`.

- [ ] 2.1 Add `Workspace` model to Prisma schema (id, unique name/slug, createdAt, subscription-related fields stubbed for later)
- [ ] 2.2 Add `workspaceId` foreign key to every tenant-scoped table (Device, Customer, Personnel, Item, Category, all Invoice types, Settings, Backup)
- [ ] 2.3 Write the Postgres Row-Level Security (RLS) policies: enable RLS on each tenant-scoped table, policy restricting rows to `current_setting('app.workspace_id')`
- [ ] 2.4 Add a Prisma middleware / query wrapper that sets `app.workspace_id` per request (e.g. via `SET LOCAL` in a transaction) so RLS is actually enforced, not just app-level filtering
- [ ] 2.5 Update every controller to scope queries by the authenticated user's `workspaceId` (belt-and-suspenders alongside RLS)
- [ ] 2.6 Add composite indexes leading with `workspaceId` on hot tables (Device, Invoices) for query performance at the ~500 tenants / ~1,000 devices each scale
- [ ] 2.7 Write unit tests confirming cross-tenant data access is impossible (e.g. workspace A's token cannot read workspace B's devices)

## Phase 3 — Auth Rework (Sign-up, Login, Sessions)

Goal: move from a single hardcoded/admin-seeded login to self-serve workspace creation and proper
token handling.

- [ ] 3.1 Build the "create workspace" sign-up flow: user submits phone number + password + workspace name → creates `Workspace` + `Personnel` record (role = super admin) in one transaction
- [ ] 3.2 Enforce workspace name/slug uniqueness and phone number uniqueness (globally, since phone is the username)
- [ ] 3.3 Implement access token (JWT, ~15 min expiry, payload: `userId`, `workspaceId`, `role`) issuance on login
- [ ] 3.4 Implement `RefreshToken` model + issuance (~30 day expiry, stored server-side, revocable) delivered as httpOnly cookie
- [ ] 3.5 Implement `/auth/refresh` endpoint (rotate refresh token, issue new access token)
- [ ] 3.6 Implement logout (revoke refresh token)
- [ ] 3.7 Update `auth.js` middleware to read the new JWT shape (`workspaceId`, `role`) and set request context accordingly
- [ ] 3.8 Update `authorize.js` middleware / role checks to work per-workspace (super admin / admin / technician, scoped to the request's workspace)
- [ ] 3.9 Update frontend `AuthContext` for the new login/refresh/logout flow and httpOnly cookie handling
- [ ] 3.10 Build/update the sign-up page on the frontend (workspace name, phone, password)
- [ ] 3.11 Update Personnel management UI so a workspace's super admin can create admin/technician users within their own workspace

## Phase 4 — Object Storage

Goal: move device/settings photos off local disk onto ArvanCloud object storage.

- [ ] 4.1 Provision ArvanCloud Object Storage bucket (manual step, not code)
- [ ] 4.2 Add an S3-compatible client (e.g. `@aws-sdk/client-s3`, since Arvan is S3-compatible) to the backend
- [ ] 4.3 Replace `multer` disk storage with direct-to-object-storage upload (or upload-then-forward) for device images and settings/logo images
- [ ] 4.4 Update `imageController.js` / `ImageUploader.jsx` / `ImageSlider.jsx` to work with object storage URLs instead of local paths
- [ ] 4.5 Update backup logic: workspace-level backups should include a way to reference/export the tenant's own images from object storage

## Phase 5 — Backups (Platform-level + Per-Tenant)

- [ ] 5.1 Full-database backup job (Postgres, all tenants) — scheduled, managed by platform owner only
- [ ] 5.2 Per-tenant "export my data" feature: customers, devices, items, invoices for the requesting workspace only (respecting RLS/workspaceId scoping)
- [ ] 5.3 Update `BackupList.jsx` page to reflect the new backup model (platform backups vs. tenant self-service export, depending on the logged-in user's role)

## Phase 6 — Testing

- [ ] 6.1 Unit tests for all controllers (one test file per controller, covering CRUD + auth/authorization edge cases)
- [ ] 6.2 Unit tests for services/business logic (invoice totals, stock calculations, profit & loss report)
- [ ] 6.3 Unit tests specifically for tenant-isolation (see 2.7) and auth (token issuance/refresh/expiry)
- [ ] 6.4 (Later, optional) Integration tests against a real test Postgres database

## Phase 7 — Dockerization & Deployment

- [ ] 7.1 Write production `Dockerfile` for backend
- [ ] 7.2 Write production `Dockerfile` for frontend (build + serve static, e.g. via Nginx)
- [ ] 7.3 Write `docker-compose.prod.yml` (backend, frontend/reverse proxy, does NOT include Postgres — that's on the separate DB server)
- [ ] 7.4 Set up reverse proxy (Nginx or Caddy) with TLS for `app.dofixo.ir`
- [ ] 7.5 Provision ParsPack app server and database server (manual step)
- [ ] 7.6 First manual deployment to production infrastructure
- [ ] 7.7 (Later) Introduce a simple GitHub Actions workflow that runs the test suite on push — a first, minimal step into CI/CD, before considering automated deploys

## Phase 8 — Subscriptions & Billing (last phase, on hold)

Not being built yet — sequenced last on purpose. Revisit together when ready.

- [ ] 8.1 Add `Subscription` model (workspace, plan, status, startedAt, expiresAt)
- [ ] 8.2 Implement 7-day free trial assignment on workspace creation
- [ ] 8.3 Implement read-only enforcement once a subscription/trial lapses (middleware that blocks writes but allows reads)
- [ ] 8.4 Zibal payment gateway integration (checkout, callback/webhook, plan activation)
- [ ] 8.5 Plan selection UI (monthly / 3-month / 6-month / annual — same features, different price/duration)
- [ ] 8.6 Kavenegar SMS integration for phone verification (sign-up OTP, and/or password reset)

---

## How to use this with Claude Code

- Point Claude Code at one task at a time (e.g. "Read CLAUDE.md and ROADMAP.md, then do task 1.3").
- Phases are meant to be done roughly in order — Phase 2 (multi-tenancy) depends on Phase 1
  (Postgres/Prisma) being done; Phase 3 (auth) depends on Phase 2 (`workspaceId` existing).
  Phases 4–6 can be interleaved once Phase 3 is stable. Phase 7 can start in parallel once there's
  something worth deploying. Phase 8 stays last.
- After finishing a task, update this file: flip `[ ]` to `[x]` (or `[~]` if partially done) so the
  roadmap always reflects real progress.
