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

- [x] 4.1 Provision ArvanCloud Object Storage — private, Simin region
      (`s3.ir-thr-at1`). `reza-app-test-1` for development; production got
      `dofixo-prod` in 7.6
- [x] 4.2 Add an S3-compatible client (`@aws-sdk/client-s3` + `s3-request-presigner`), wrapped in `src/lib/storage.ts`
- [x] 4.3 Replace multer disk storage with direct-to-object-storage upload for device images and settings images. Both convert to webp in memory now; nothing touches disk at any point. The conversion profile itself was left until 7.0
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
- [x] 5.3 Per-workspace data export: customers, devices, items and invoices as an Excel workbook plus a zip of that workspace's device images. Generated on demand, scoped by workspaceId, never a SQL dump — a dump is unreadable to a workshop owner and risks leaking schema or other tenants' rows.
      Built in the background and recorded in the `backups` table, which gains `status`, `filepath` and `error`. `/api/exports` replaces the 501 stubs at `/api/backups`, which stay until 5.4 retires the page that calls them
- [x] 5.4 Rework `BackupList.jsx` into an export page: request an export, see past exports, download. No restore button.
      Now `ExportList.tsx` at `/exports`; the 501 stubs at `/api/backups` and their controller are removed
- [x] 5.5 Write an operator runbook for restoring a single workspace from a platform dump. A manual, support-mediated procedure rather than a feature — selectively replacing one tenant's rows in a shared schema while others are live is too dangerous to expose.
- [~] 5.6 Fineti import: give `importFromExcel` and `importDeviceImages` a `--workspace-id` parameter so they can onboard a customer migrating from Fineti. Stays an operator-run script; wrap it in an admin UI only if it turns out to be frequent.
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

## Phone Verification (before phase 7)

Pulled out of 8.6 and ahead of deployment. Sign-up today is an open endpoint
with nothing but a rate limiter between it and unlimited tenants, and every
"I forgot my password" is a phone call to an operator. Both stop being
acceptable the day `app.dofixo.ir` is public.

**Provider is sms.ir**, with an approved verify template. Kavenegar was the
plan before that decision.

- [x] OTP.1 `otp_codes` table: phone, hashed code, expiry, attempt count.
      Deliberately not tenant-scoped — a code is sent before any workspace
      exists. Carries a `USING (true)` policy so `rls-check.sql` reads it as
      intentional rather than missed
- [x] OTP.2 An sms.ir client in `lib/sms.ts`, the only module that knows the
      provider exists. No driver interface and no console driver: the tests
      mock the module, as they already do for `lib/storage`, and a second
      implementation would be a code path nobody runs in production.
      ⚠️ sms.ir has an IP allowlist in its panel, and a request from an
      address not on it comes back `HTTP 401` — indistinguishable from a bad
      key in the logs. The production server's address must be added before
      7.6, or sign-up fails for everyone with a misleading error
- [x] OTP.3 `POST /auth/send-otp`, three per hour on the phone number and
      three on the IP. Both are needed: an IP limit alone lets a botnet spend
      the account, a phone limit alone lets one host walk a list of numbers.
      Failed sends count against neither — the row is deleted and the limiter
      carries `skipFailedRequests` — because a provider outage must not lock
      a caller out for an hour over messages that never left.
      `OtpCode` is exempt from the Prisma extension's workspace guard
      (`UNSCOPED_MODELS`), which is safe only because its policy is
      `USING (true)`
- [x] OTP.4 Sign-up requires a verified code before a workspace is created
- [x] OTP.5 Password reset through OTP. The code is spent before the password
      is written, and every session for that user is deleted — an intruder's
      cannot be told from the owner's. No session is issued afterwards, which
      would undo half of that. `ops/reset-password.md` stays, now marked as
      the exception rather than the route: it covers the case OTP.5 cannot,
      where the number itself is gone
      `ops/reset-password.md`. The script stays for the case where someone
      has lost the number itself
- [x] OTP.6 Frontend: the code step on sign-up, and a "forgot password" flow

## Phase 7 — Dockerization & Deployment

- [x] 7.0 Image processing profile. `sharp` converted the format and nothing
      else — no resize, no rotate, quality 92 — storing a 48MP phone photo at
      3.9MB. Storage is the one cost that scales per tenant and never comes
      down, so the profile was measured rather than guessed: fifteen real
      repair photographs across five widths and five quality settings.
      3400px at q85 was chosen by looking at the output, not the table —
      below it the markings on small ICs stop being readable, which is the
      whole reason these photographs exist. 6.5x smaller.
      `.rotate()` was the real find: sharp neither applies the EXIF
      orientation tag nor carries it across, so eleven of the fifteen were
      being stored sideways. Each upload now also stores a 480px copy, since
      the device modal renders every photo at once in a grid at most 128px
      tall — several megabytes on every open, repeatedly, because a presigned
      URL is unique per request and nothing the browser caches ever matches
- [x] 7.1 Write production `Dockerfile` for backend
- [x] 7.2 Write production `Dockerfile` for frontend (build + serve static, e.g. via Nginx)
- [x] 7.3 Write `docker-compose.prod.yml` — backend, frontend, reverse proxy **and Postgres**, on one host. Postgres gets its own named volume, and `shared_buffers` must be raised from the image default of 128MB, which wastes most of an 8GB machine
- [x] 7.3a Production hardening of the app itself, found while writing the
      compose file. JWT_SECRET fell back to a string committed to this
      repository: unset in production, anyone could mint a token carrying any
      workspaceId, and RLS would scope every query to exactly what the forged
      token claimed. `trust proxy` was a boolean, which trusts the whole
      client-written X-Forwarded-For chain — a caller could present a new
      address per request and never reuse a rate-limit bucket, voiding the
      per-IP half of the OTP limit. It is a hop count now. CORS is registered
      only outside production, where 7.2 made the frontend call a relative /api
- [x] 7.4 Reverse proxy with TLS for `app.dofixo.ir`. Caddy, with the
      certificate loaded from disk rather than obtained through ACME: the
      server has no international connectivity and cannot reach Let's
      Encrypt. The certificate was issued through ParsPack using DNS-01
      validation, which works precisely because the server takes no part in
      it — the CA reads a TXT record and never contacts the host.
      ⚠️ Nothing renews it. Expires 25 Nov 2026. If international access is
      enabled, deleting the two `tls` lines hands it back to Caddy
- [x] 7.5 Provision one VPS. ParsVDS IR\*VPS_05 (4 cores, 9.7GB, 79GB NVMe,
      Ubuntu 24.04) rather than ParsPack — same class, roughly half the
      price. Splitting the database onto its own host is deliberately
      deferred: it costs latency now and buys nothing until there is more
      than one app instance
- [x] 7.6 First manual deployment. Images are built on the workstation and
      moved with `docker save`: the server reaches neither Docker Hub nor
      npm, so nothing is ever built there. All three services carry an
      explicit `:prod` tag — without one the production build overwrites the
      development image, and what ships is tsx watch running as root with
      NODE_ENV unset.
      Verified end to end: sign-up over real SMS, a photo uploaded with
      rotation and a thumbnail, a data export, and a backup whose restore was
      actually tested — 21 policies and all four app\*\* functions present in a
      dump decrypted on the workstation. Only 80 and 443 answer from outside.
- [x] 7.6a Roles into a migration and export keys out of the workspace prefix.
      Production setup is `migrate deploy` alone, and the lifecycle rule in
      7.8 has a prefix it can target without expiring every shop's photographs
- [ ] 7.7 (Later) Introduce a simple GitHub Actions workflow that runs the test suite on push — a first, minimal step into CI/CD, before considering automated deploys
- [x] 7.8 Lifecycle rule on `exports/` in the production bucket: 30 days on
      current versions, 7 on incomplete multipart uploads. Needed 7.6a first —
      Arvan matches a plain prefix, and the old key layout had none that meant
      "exports"

## Phase 8 — Subscriptions & Billing

- [ ] 8.1 Schema and migration: Plan, Payment, SubscriptionEvent,
      DiscountCode, DiscountCodeUse, ReferralCode, Referral,
      SubscriptionNotification.
      Plan and DiscountCode follow the `roles` pattern — reference data,
      no RLS, SELECT only for the app role. The rest carry workspace_id
      and their policy in the same migration.
      Referral needs a two-sided policy (either party sees the row) and
      ReferralCode a read-open/write-scoped pair, which keeps it out of
      UNSCOPED_MODELS. No DELETE grant on payments: a ledger that can be
      erased is not a ledger.
      Also: seed the three plans, and update the policy count in
      ops/restore-database.md from 21

- [ ] 8.2 Subscription engine in utils/: extendSubscription(),
      from max(now, expiresAt) so a reward isn't spent in the past.
      Every change writes a SubscriptionEvent — trial, payment, referral
      and manual correction all pass through one function, so "why is my
      expiry this date" always has an answer.
      populateWorkspace() gains the 30-day trial and the referral code

- [ ] 8.3 Read-only guard, 402 rather than 403: expired is not forbidden.
      Computed from expiresAt and the clock, never from Workspace.status —
      a stored column is only as fresh as the last cron run, and
      authorization must not depend on a job having succeeded.
      Grace: writes allowed for 3 days past expiry.
      Open regardless: auth, payment, password and profile, and
      GET /exports plus its download. POST /exports is closed —
      a past export can be taken away, a new one cannot be built.
      A `neverExpires` column for our own and demo workspaces, settable
      only from the database: no route means no way to reach it

- [ ] 8.4 Server-side pricing: plan price, discount code, referral
      discount, larger of the two rather than both, rounded to 10,000
      rials. The client sends a plan and a code, never an amount

- [ ] 8.5 Zibal: request, verify, and settlement of orphaned payments.
      The standard method, not lazy — lazy auto-refunds after 20 minutes,
      which a daily cron can never beat, and its callback is a POST that
      no frontend page can receive.
      Result 201 ("already verified") is success, not an error, and must
      not extend a second time. The amount that comes back is checked
      against what was expected.
      ⚠️ Depends on Referrer-Policy in the Caddyfile staying
      strict-origin-when-cross-origin: no-referrer makes Zibal refuse to
      open the gateway at all

- [ ] 8.6 Referral: code at sign-up, reward after the invited workshop's
      payment verifies, first purchase only.
      The reward writes to another workspace, so it goes through
      runWithWorkspace() — the id comes from our own row, never from the
      client

- [ ] 8.7 ops/subscription-cron.sh on the host, following
      backup-database.sh. Reminders, SMS, read-only transitions, deletion
      after 30 days, and settlement of unverified payments.
      Idempotent: SubscriptionNotification records what was sent, so a
      second run in one day sends nothing twice.
      Deletion removes Arvan objects under workspaces/{id}/ as well —
      rows alone would leave the photographs paid for forever

- [ ] 8.8 Frontend: subscription page, plan selection, discount code
      field, countdown banner, and the callback page that asks the
      backend to verify rather than trusting the query string

- [ ] 8.9 Frontend: referral page, payment history, printable receipt
      following the InvoicePreview pattern — no new dependency, and the
      browser's own "save as PDF" does the rest

## Phase 9 — UI Consolidation (after the migration settles)

Product changes deliberately held until the data model and auth stop moving,
so a screen that breaks has one obvious cause rather than three.

- [ ] 9.1 Fold the stock report into the items page as a filter and retire the separate page — it is the item list with one condition applied
- [ ] 9.2 Move the profit summary onto the dashboard and retire the profit report page, where it currently goes unseen
- [ ] 9.3 Let the purchase invoice form create a complete item inline. It creates a reduced one today, so the same catalogue has two entry points with different results
- [ ] 9.4 Decide how deleting a purchase invoice should affect avg_purchase_price. It currently returns the stock but leaves the average untouched, so it drifts — a weighted average can't be reversed from the invoice alone. Either recompute from that item's full purchase history, or stop allowing deletion and record a return invoice instead, which is what accounting practice would do.
- [ ] 9.5 A proper invoice template: editable layout, logo/stamp/signature placement, column choice and print styling, replacing the pile of `sale_invoice_show_*` booleans in settings. Numbering is deliberately not part of this — a number is accounting data and should stay boring; this is about what the customer actually sees.
      Also: PersianDatePicker accepts `className`, `required` and `clearable` and reads none of them, and several modals accept a `zIndex` they never apply — layout concerns that belong here rather than scattered across a bug list
- [ ] 9.6 Remove `settings.invoice_prefix`, unused since 2.8 fixed the prefixes per invoice kind. Touches the schema, the settings form and the response shape, so it belongs with the other frontend work

## Authorization Gap (before phase 10)

Found while looking at 10.8, which the roadmap had recorded as a routing bug
in the frontend. It is not: the guard is missing on the server too, so a
technician does not merely reach the page by typing a URL — a `curl` with
their own token reads purchase prices, profit margins, sale invoices and the
whole catalogue. RLS does not help, because the data belongs to their own
workspace; the question is role, not tenant.

Five route files the sidebar marks `adminOnly` carry no `atLeast("admin")`:
`items` · `purchaseInvoices` · `saleInvoices` · `repairInvoices` · `reports`.
`exports` and `personnel` already have it. `categories`, `services` and
`images` are deliberately open — a technician needs them.

- [ ] AUTH.1 Add `atLeast("admin")` to the five route files. Backend first
      and on its own: closing only the frontend would hide the gap rather
      than shut it
- [ ] AUTH.2 Integration tests that hit each of the five with a technician's
      token and expect 403. Not a unit test of the middleware — the middleware
      already works, and what failed was nobody wiring it up. A route file
      without a guard has to fail the suite
- [ ] AUTH.3 Move `dashboard` and the three report pages inside
      `ProtectedRoute minRole="admin"` in App.tsx, matching what the sidebar
      already claims. The dashboard stays admin-only rather than being
      served a reduced payload — that is a product decision for phase 9, and
      if it is ever taken, the filtering belongs in the controller
      ⚠️ `/reports/transactions` has no sidebar link but does have a route,
      and it calls the dashboard endpoint. It has to move too, or a
      technician lands on an error page instead of a redirect
- [ ] AUTH.4 `settings` in Layout.tsx is `adminOnly: false` while App.tsx
      guards it with `minRole="admin"`, so a technician sees a link that
      redirects them away. One or the other is wrong; the route is right

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

- [x] 10.8 Turned out to be a server-side authorization gap rather than a
      routing bug — see "Authorization Gap" above
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
- [ ] 10.14 The bundle is a single 722 kB chunk — 172 kB after gzip, which
      the production nginx does apply. Lazy-loading the pages through React
      Router would still cut what a first visit downloads, but the real
      figure is the compressed one

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
