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
- [x] 1.3 Rewrite each controller's data-access calls to use Prisma Client instead of sql.js queries (one resource at a time: devices → customers → personnel → items → invoices → reports → settings)
- [x] 1.4 Disable the sql.js-based backup feature: the controller copies a SQLite file that is no longer the source of truth, so its endpoints return 501 with a Persian explanation rather than producing a worthless file. Removes `backupScheduler` (weekly cron) — durability becomes a platform guarantee, not something each workshop arranges. Real backups are rebuilt in phase 5, once workspaceId (phase 2) and object storage (phase 4) exist.
- [x] 1.5 Remove the sql.js-based one-off scripts. `importFromExcel` returns in 5.6 and `importDeviceImages` in phase 4, from git history; `resetAdmin` does not return — it only knew one hardcoded username, which stops existing once each workspace has its own super admin
- [x] 1.6 Confirm the full app (frontend included) works end-to-end against Postgres locally, single-tenant, before moving to Phase 2
- [x] 1.7 Unify invoice numbering: have all three invoice types (purchase, sale, repair) take their prefix from `settings.invoice_prefix` instead of the current mix of hardcoded prefixes (`PUR-`, `SAL-`) and settings-driven ones (repair only), so each workspace controls its own numbering in phase 2

## Phase 2 — Multi-Tenancy

Goal: introduce `Workspace` as a first-class concept and isolate all tenant data by `workspaceId`.

- [x] 2.1 Add `Workspace` model to Prisma schema (id, unique name/slug, createdAt, subscription-related fields stubbed for later)
- [x] 2.2 Add `workspaceId` foreign key to every tenant-scoped table (Device, Customer, Personnel, Item, Category, all Invoice types, Settings, Backup)
- [ ] 2.3 Write the Postgres Row-Level Security (RLS) policies: enable RLS on each tenant-scoped table, policy restricting rows to `current_setting('app.workspace_id')`
- [ ] 2.4 Add a Prisma middleware / query wrapper that sets `app.workspace_id` per request (e.g. via `SET LOCAL` in a transaction) so RLS is actually enforced, not just app-level filtering
- [x] 2.5 Update every controller to scope queries by the authenticated user's `workspaceId` (belt-and-suspenders alongside RLS)
- [x] 2.6 Add composite indexes leading with `workspaceId` on hot tables (Device, Invoices) for query performance at the ~500 tenants / ~1,000 devices each scale
- [ ] 2.7 Write unit tests confirming cross-tenant data access is impossible (e.g. workspace A's token cannot read workspace B's devices)
- [ ] 2.8 Unify invoice numbering across all three invoice types, with the counter held on the Workspace row rather than derived from COUNT — atomic, per-workspace, and free of the race the current daily count has. Prefix comes from settings, as repair invoices already do. (Moved from 1.7: it needs Workspace to exist first.)

## Phase 3 — Auth Rework (Sign-up, Login, Sessions)

Goal: move from a single hardcoded/admin-seeded login to self-serve workspace creation and proper
token handling.

- [ ] 3.1 Build the "create workspace" sign-up flow: user submits phone number + password + workspace name → creates `Workspace` + `Personnel` record (role = super admin) in one transaction
- [ ] 3.2 Enforce phone number uniqueness globally, since phone is the username. Workspace names are deliberately not unique — two shops in different cities may share one
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

## Phase 5 — Backups & Data Export

Split deliberately: platform durability is the operator's concern and lives
outside the app; data export is a customer-facing feature scoped to one
workspace.

- [ ] 5.1 Check whether ParsPack's managed Postgres offers automated backups. If it does, configure and document it rather than building our own.
- [ ] 5.2 (only if 5.1 says no) Scheduled `pg_dump` on the database server, compressed and encrypted, shipped to ArvanCloud. Runs as a cron on the host — deliberately not an app feature, so a broken app can't take the backups with it. Retention: 7 daily, 4 weekly, 3 monthly.
- [ ] 5.3 Per-workspace data export: customers, devices, items and invoices as an Excel workbook plus a zip of that workspace's device images. Generated on demand, scoped by workspaceId, never a SQL dump — a dump is unreadable to a workshop owner and risks leaking schema or other tenants' rows.
- [ ] 5.4 Rework `BackupList.jsx` into an export page: request an export, see past exports, download. No restore button.
- [ ] 5.5 Write an operator runbook for restoring a single workspace from a platform dump. A manual, support-mediated procedure rather than a feature — selectively replacing one tenant's rows in a shared schema while others are live is too dangerous to expose.
- [ ] 5.6 Fineti import: give `importFromExcel` and `importDeviceImages` a `--workspace-id` parameter so they can onboard a customer migrating from Fineti. Stays an operator-run script; wrap it in an admin UI only if it turns out to be frequent.
- [ ] 5.7 Operator recovery: a documented procedure for restoring access to a workspace whose owner is locked out — a runbook plus, if it proves frequent, a script keyed on workspaceId. The old resetAdmin script is not the basis for this: it only ever knew one hardcoded username, which stops existing once each workspace has its own super admin. Password self-service for customers is task 8.6 (SMS OTP).

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
- [ ] 8.2 Implement 1 month free trial assignment on workspace creation
- [ ] 8.3 Implement read-only enforcement once a subscription/trial lapses (middleware that blocks writes but allows reads)
- [ ] 8.4 Zibal payment gateway integration (checkout, callback/webhook, plan activation)
- [ ] 8.5 Plan selection UI (monthly / 3-month / 6-month / annual — same features, different price/duration)
- [ ] 8.6 Kavenegar SMS integration for phone verification (sign-up OTP, and/or password reset)

## Phase 9 — UI Consolidation (after the migration settles)

Product changes deliberately held until the data model and auth stop moving,
so a screen that breaks has one obvious cause rather than three.

- [ ] 9.1 Fold the stock report into the items page as a filter and retire the separate page — it is the item list with one condition applied
- [ ] 9.2 Move the profit summary onto the dashboard and retire the profit report page, where it currently goes unseen
- [ ] 9.3 Let the purchase invoice form create a complete item inline. It creates a reduced one today, so the same catalogue has two entry points with different results
- [ ] 9.4 Decide how deleting a purchase invoice should affect avg_purchase_price. It currently returns the stock but leaves the average untouched, so it drifts — a weighted average can't be reversed from the invoice alone. Either recompute from that item's full purchase history, or stop allowing deletion and record a return invoice instead, which is what accounting practice would do.

---

## How to use this with Claude Code

- Point Claude Code at one task at a time (e.g. "Read CLAUDE.md and ROADMAP.md, then do task 1.3").
- Phases are meant to be done roughly in order — Phase 2 (multi-tenancy) depends on Phase 1
  (Postgres/Prisma) being done; Phase 3 (auth) depends on Phase 2 (`workspaceId` existing).
  Phases 4–6 can be interleaved once Phase 3 is stable. Phase 7 can start in parallel once there's
  something worth deploying. Phase 8 stays last.
- After finishing a task, update this file: flip `[ ]` to `[x]` (or `[~]` if partially done) so the
  roadmap always reflects real progress.
