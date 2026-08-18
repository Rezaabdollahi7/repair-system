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
- [x] 2.3 Write the Postgres Row-Level Security (RLS) policies: enable RLS on each tenant-scoped table, policy restricting rows to `current_setting('app.workspace_id')`
- [x] 2.4 Add a Prisma middleware / query wrapper that sets `app.workspace_id` per request (e.g. via `SET LOCAL` in a transaction) so RLS is actually enforced, not just app-level filtering
- [x] 2.5 Update every controller to scope queries by the authenticated user's `workspaceId` (belt-and-suspenders alongside RLS)
- [x] 2.6 Add composite indexes leading with `workspaceId` on hot tables (Device, Invoices) for query performance at the ~500 tenants / ~1,000 devices each scale
- [x] 2.7 Write unit tests confirming cross-tenant data access is impossible (e.g. workspace A's token cannot read workspace B's devices)
- [x] 2.8 Unify invoice numbering across all three invoice types, with the counter held on the Workspace row rather than derived from COUNT — atomic, per-workspace, and free of the race the current daily count has. Prefix comes from settings, as repair invoices already do. (Moved from 1.7: it needs Workspace to exist first.)

## Phase 3 — Auth Rework (Sign-up, Login, Sessions)

Goal: move from a single hardcoded/admin-seeded login to self-serve workspace creation and proper
token handling.

- [x] 3.1 Build the "create workspace" sign-up flow: user submits phone number + password + workspace name → creates `Workspace` + `Personnel` record (role = super admin) in one transaction
- [x] 3.2 Enforce phone number uniqueness globally, since phone is the username. Workspace names are deliberately not unique — two shops in different cities may share one
- [x] 3.3 Implement access token (JWT, ~15 min expiry, payload: `userId`, `workspaceId`, `role`) issuance on login
- [x] 3.4 Implement `RefreshToken` model + issuance (~30 day expiry, stored server-side, revocable) delivered as httpOnly cookie
- [x] 3.5 Implement `/auth/refresh` endpoint (rotate refresh token, issue new access token)
- [x] 3.6 Implement logout (revoke refresh token)
- [x] 3.7 Update `auth.js` middleware to read the new JWT shape (`workspaceId`, `role`) and set request context accordingly
- [x] 3.8 Update `authorize.js` middleware / role checks to work per-workspace (super admin / admin / technician, scoped to the request's workspace)
- [x] 3.9 Update frontend `AuthContext` for the new login/refresh/logout flow and httpOnly cookie handling
- [x] 3.10 Build/update the sign-up page on the frontend (workspace name, phone, password)
- [x] 3.11 Update Personnel management UI so a workspace's super admin can create admin/technician users within their own workspace

## Phase 4 — Object Storage

Goal: move device/settings photos off local disk onto ArvanCloud object storage.

- [x] 4.1 Provision ArvanCloud Object Storage bucket — `reza-app-test-1`, private, Simin region (`s3.ir-thr-at1`)
- [x] 4.2 Add an S3-compatible client (`@aws-sdk/client-s3` + `s3-request-presigner`), wrapped in `src/lib/storage.ts`
- [x] 4.3 Replace multer disk storage with direct-to-object-storage upload for device images and settings images. Both convert to webp in memory now; nothing touches disk at any point
- [x] 4.4 imageController / settingsController / ImageUploader / ImageSlider / DeviceDetailModal / Settings all work from short-lived signed URLs instead of local paths
- [~] 4.5 Moved to 5.6: restoring the image importer means guessing at a Fineti export's shape without a real one to look at, and it belongs beside importFromExcel rather than on its own
- [~] 4.6 MinIO deferred: with a real bucket in hand, developing straight against Arvan avoids finding S3 compatibility gaps on deployment day. Revisit if working offline becomes necessary

## Phase 5 — Backups & Data Export

Split deliberately: platform durability is the operator's concern and lives
outside the app; data export is a customer-facing feature scoped to one
workspace.

- [x] 5.1 Check whether ParsPack's managed Postgres offers automated backups. If it does, configure and document it rather than building our own.
- [x] 5.2 Scheduled `pg_dump` on the host, compressed and encrypted, shipped to ArvanCloud. Runs as a cron outside the containers — deliberately not an app feature, so a broken app can't take the backups with it. Retention: 7 daily, 4 weekly, 3 monthly.
      The VPS plan's own automated snapshots do not replace this: a machine snapshot is crash-consistent rather than application-consistent, restoring one means restoring the whole server, and a single workspace cannot be pulled out of it — which is what 5.5 needs
- [ ] 5.3 Per-workspace data export: customers, devices, items and invoices as an Excel workbook plus a zip of that workspace's device images. Generated on demand, scoped by workspaceId, never a SQL dump — a dump is unreadable to a workshop owner and risks leaking schema or other tenants' rows.
- [ ] 5.4 Rework `BackupList.jsx` into an export page: request an export, see past exports, download. No restore button.
- [x] 5.5 Write an operator runbook for restoring a single workspace from a platform dump. A manual, support-mediated procedure rather than a feature — selectively replacing one tenant's rows in a shared schema while others are live is too dangerous to expose.
- [ ] 5.6 Fineti import: give `importFromExcel` and `importDeviceImages` a `--workspace-id` parameter so they can onboard a customer migrating from Fineti. Stays an operator-run script; wrap it in an admin UI only if it turns out to be frequent.
- [x] 5.7 Operator recovery: a documented procedure for restoring access to a workspace whose owner is locked out — a runbook plus, if it proves frequent, a script keyed on workspaceId. The old resetAdmin script is not the basis for this: it only ever knew one hardcoded username, which stops existing once each workspace has its own super admin. Password self-service for customers is task 8.6 (SMS OTP).

## Frontend TypeScript Migration (done, outside the phase numbering)

Sequenced deliberately before 5.4 so the export page would be TypeScript from
its first line rather than converted later. Two decisions taken up front:
incremental with `allowJs` so the app kept running throughout, and
`strict: true` from the start — "loose now, strict later" means never, and
code written with `any` does not get revisited.

- [x] TS.1 Toolchain: `tsconfig.json` (allowJs, strict, verbatimModuleSyntax),
      `vite-env.d.ts` declaring VITE_API_URL explicitly, a hand-written
      `jalaali-js.d.ts` covering the three functions actually called, an
      eslint block for `**/*.{ts,tsx}` with `no-explicit-any: error`, and
      `tsc --noEmit` wired into `pnpm build` — the frontend has no tests, so
      the compiler is the only automated gate it has
- [x] TS.2 `utils/` and `api/index.ts`. Response types are written from the
      controllers rather than guessed: an interface written ahead of reading
      its controller reads as a contract while being a guess
- [x] TS.3 `context/` — AuthContext and ThemeContext. ModalContext is
      deliberately left until after the components it renders
- [x] TS.4 `components/` — 27 files, in four groups: leaves, image and date,
      the CRUD modals resource by resource, then the rest. `types/api.ts`
      fills in as each controller is read
- [x] TS.5 `Layout` and `ProtectedRoute`
- [x] TS.6 `ModalContext`, once all thirteen modals it renders were typed
- [x] TS.7 `pages/` — 14 files
- [x] TS.8 `App`, `main`, `vite.config`, HomeIcon moved out of `public/`, and
      `allowJs` removed. A new `.js` under `src/` is now a compile error

## Phase 6 — Testing

- [ ] 6.1 Unit tests for all controllers (one test file per controller, covering CRUD + auth/authorization edge cases)
- [ ] 6.2 Unit tests for services/business logic (invoice totals, stock calculations, profit & loss report)
- [ ] 6.3 Unit tests specifically for tenant-isolation (see 2.7) and auth (token issuance/refresh/expiry)
- [x] 6.4 (Later, optional) Integration tests against a real test Postgres database

## Phase 7 — Dockerization & Deployment

- [ ] 7.1 Write production `Dockerfile` for backend
- [ ] 7.2 Write production `Dockerfile` for frontend (build + serve static, e.g. via Nginx)
- [ ] 7.3 Write `docker-compose.prod.yml` — backend, frontend, reverse proxy **and Postgres**, on one host. Postgres gets its own named volume, and `shared_buffers` must be raised from the image default of 128MB, which wastes most of an 8GB machine
- [ ] 7.4 Set up reverse proxy (Nginx or Caddy) with TLS for `app.dofixo.ir`
- [ ] 7.5 Provision one ParsPack VPS (irVPS5-class: 4 vCPU, 8GB RAM, 100GB SSD), Iran location. Splitting the database onto its own host is deliberately deferred — it costs latency now and buys nothing until there is more than one app instance
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
- [ ] 9.5 A proper invoice template: editable layout, logo/stamp/signature placement, column choice and print styling, replacing the pile of `sale_invoice_show_*` booleans in settings. Numbering is deliberately not part of this — a number is accounting data and should stay boring; this is about what the customer actually sees
- [ ] 9.5 ... Also: PersianDatePicker accepts `className`, `required` and
      `clearable` and reads none of them, and several modals accept a
      `zIndex` they never apply — both are layout concerns that belong with
      this work rather than scattered across a bug list
- [ ] 9.6 Remove `settings.invoice_prefix`, unused since 2.8 fixed the prefixes per invoice kind. Touches the schema, the settings form and the response shape, so it belongs with the other frontend work

## Phase 10 — Frontend Bug Fixes

Found while converting the frontend to TypeScript and deliberately left
alone: a conversion that also changes behaviour is a conversion nobody can
review. Each is small and independent, so they can be picked off in any
order.

### Broken today

- [ ] 10.1 `formatPersianPhone` never formats a landline: the branch tests
      `digits.length === 10` while its own example (`02112345678`) has eleven,
      so every landline falls through to the mobile grouping
- [ ] 10.2 `TransactionsReport` reads `recent_transactions` off the dashboard
      endpoint, which the controller caps at ten rows — a page called
      "transaction report" showing the same handful as the dashboard widget.
      Needs a paginated `GET /reports/transactions`
- [ ] 10.3 The same page links to `/items/:id`, which is not a route: items
      open in a modal, so the link falls through to the catch-all and
      redirects to `/devices`
- [ ] 10.4 `PersonnelList` renders pagination controls that do nothing:
      `GET /personnel` returns a plain array and its schema accepts `limit`
      only to ignore it. Either paginate server-side or drop the controls
- [ ] 10.5 `ItemList` applies its low-stock filter after the page has been
      fetched, so it only ever sees the ten rows on screen — a shop with
      dozens of low-stock items can see an empty page. `getLowStockItems()`
      already does this server-side
- [ ] 10.6 `ItemDetailModal` has no edit or delete button, unlike the device
      and customer modals. `handleDelete` and its ConfirmModal are already
      wired up; only the button that opens it is missing
- [ ] 10.7 Creating a device with no customer sends `customer_id: ""`, which
      `z.coerce.number().positive()` turns into 0 and rejects. Verify, then
      either preprocess the empty string away or send null

### Inconsistent

- [ ] 10.8 The dashboard and the three report pages sit outside
      `ProtectedRoute minRole="admin"` while the sidebar marks them
      `adminOnly`, so a technician cannot see the links but can reach the
      pages by typing the URL
- [ ] 10.9 `received`, the schema's default device status, appears in none of
      the four status maps in the frontend, so a device nobody has touched
      shows its raw status string
- [ ] 10.10 `Pagination` labels look swapped — "بعدی" sends `page - 1` and
      "قبلی" sends `page + 1` — and shows its range as `{to}–{from}`. It also
      hardcodes the word "دستگاه" while being used on every list
- [ ] 10.11 `ProtectedRoute` uses a raw `text-gray-500` where every other
      component uses `text-text-secondary`, so it ignores the theme

### Wasteful

- [ ] 10.12 `FilterPanel` fetches the entire personnel list once per selected
      technician whose name it does not yet know — three selected means three
      identical requests
- [ ] 10.13 `SearchableSelect` filters its options locally _and_ asks the
      server through `onSearch`, so a server-side match can be filtered back
      out. Its effect also depends on `onSearch`, which loops if a caller
      passes an inline function
- [ ] 10.14 The bundle is a single 713 kB chunk. Lazy-loading the pages
      through React Router would cut what a first visit downloads, which
      matters on an Iranian mobile connection
- [ ] 10.15 `errorText` is defined identically in five components before
      `utils/errors.ts` existed; fold them into the shared one
- [ ] 10.16 Add type-aware linting (`parserOptions.project`) now that the
      whole frontend is TypeScript. It was left off during the migration
      because it type-checks the entire program on every run

---

## How to use this with Claude Code

- Point Claude Code at one task at a time (e.g. "Read CLAUDE.md and ROADMAP.md, then do task 1.3").
- Phases are meant to be done roughly in order — Phase 2 (multi-tenancy) depends on Phase 1
  (Postgres/Prisma) being done; Phase 3 (auth) depends on Phase 2 (`workspaceId` existing).
  Phases 4–6 can be interleaved once Phase 3 is stable. Phase 7 can start in parallel once there's
  something worth deploying. Phase 8 stays last.
- After finishing a task, update this file: flip `[ ]` to `[x]` (or `[~]` if partially done) so the
  roadmap always reflects real progress.
