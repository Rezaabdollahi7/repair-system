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

- [x] 8.1 Schema and migration: Plan, Payment, SubscriptionEvent,
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

- [x] 8.2 Subscription engine in utils/: extendSubscription(), from
      max(now, expiresAt) so a reward isn't spent in the past.
      Every change writes a SubscriptionEvent — trial, payment, referral
      and manual correction all pass through one function, so "why is my
      expiry this date" always has an answer.
      populateWorkspace() gains the 30-day trial and the referral code.
      app_create_workspace stops granting a month of its own: it had done
      so since 3.1, which became 61 days once startTrial existed. The
      integration suite caught it — no mocked test could have, since the
      second grant was inside a SQL function

- [x] 8.3 Read-only guard, 402 rather than 403: expired is not forbidden.
      Computed from expiresAt and the clock, never from Workspace.status —
      a stored column is only as fresh as the last cron run, and
      authorization must not depend on a job having succeeded.
      Grace: writes allowed for 3 days past expiry.
      Open regardless: auth, payment, password and profile, and
      GET /exports plus its download. POST /exports is closed —
      a past export can be taken away, a new one cannot be built.
      A `neverExpires` column for our own and demo workspaces, settable
      only from the database: no route means no way to reach it

- [x] 8.4 Server-side pricing: plan price, discount code, referral
      discount, larger of the two rather than both, rounded to 10,000
      rials. The client sends a plan and a code, never an amount

- [x] 8.5 Zibal: request, verify, and settlement of orphaned payments.
      The standard method, not lazy — lazy auto-refunds after 20 minutes,
      which a daily cron can never beat, and its callback is a POST that
      no frontend page can receive.
      Result 201 ("already verified") is success, not an error, and must
      not extend a second time. The amount that comes back is checked
      against what was expected.
      ⚠️ Depends on Referrer-Policy in the Caddyfile staying
      strict-origin-when-cross-origin: no-referrer makes Zibal refuse to
      open the gateway at all

- [x] 8.6 Referral: code at sign-up, reward after the invited workshop's
      payment verifies, first purchase only.
      The reward writes to another workspace, so it goes through
      runWithWorkspace() — the id comes from our own row, never from the
      client

- [x] 8.7 ops/subscription-cron.sh on the host, following
      backup-database.sh. Reminders, SMS, read-only transitions, deletion
      after 30 days, and settlement of unverified payments.
      Idempotent: SubscriptionNotification records what was sent, so a
      second run in one day sends nothing twice.
      Deletion removes Arvan objects under workspaces/{id}/ as well —
      rows alone would leave the photographs paid for forever

- [x] 8.8 Frontend: subscription page, plan selection, discount code
      field, countdown banner, and the callback page that asks the
      backend to verify rather than trusting the query string

- [x] 8.9 Frontend: referral page, payment history, printable receipt
      following the InvoicePreview pattern — no new dependency, and the
      browser's own "save as PDF" does the rest

- [ ] 8.10 Payment confirmation SMS. settlePayment extends the subscription
      and rewards the referrer but never sends SMS_TEMPLATE_PAYMENT_OK —
      the template is declared in lib/sms.ts, present in every env file and
      approved in the sms.ir panel, so every signal said it was done. A
      real payment on production verified, extended and issued a receipt
      with a ref number, and no message was sent.

      Send it after the transaction, not inside: the call takes up to 20s
      and holding a row lock that long for a message is wrong. Swallow the
      error like rewardReferrer does — a customer who has paid must not see
      a failure because an SMS did not go — but log it, which is what made
      this invisible.

      ownerPhone() in utils/subscriptionJob.ts already resolves the super
      admin's number and is the only place that knows the message goes to
      them and not to an admin. Lift it into utils/subscription.ts rather
      than copying it.

      ⚠️ The #DATE# parameter is Jalali with dashes, never slashes.
      sendTemplate refuses a slash, but as an SmsError at send time.

      ⚠️ Check utils/referral.ts in the same task: the referral reward SMS
      did not arrive either, and rewardReferrer swallows its errors. If it
      swallows without logging, that is the RULES §6 violation that made
      both of these silent.

      A test asserting sendTemplate is called with PAYMENT_OK after a
      successful settlePayment is the point of the task — nothing else
      would have caught this.

- [ ] 8.11 The nightly job sees no workspaces. `runSubscriptionJob` reads its
      worklist with a raw query — `SELECT id, never_expires, expires_at FROM
      workspaces WHERE deleted_at IS NULL` — and the comment above it says a
      raw query is how a job legitimately sees every tenant. That is the half
      that is wrong: raw SQL escapes the Prisma *extension*, which is what
      sets the context, but not RLS, which is enforced by Postgres on every
      statement. `workspaces` carries `workspace_self`
      (`id = app_current_workspace_id()`), and with no context set that
      function returns NULL and the policy denies everything.

      Verified against a scratch Postgres with all sixteen migrations
      applied: as `dofixo_app` with no context, both of the job's raw
      queries return **zero rows** while the owner connection sees the data.

      So 8.7 has been a silent no-op wherever it runs: no expiry reminders,
      no SMS, no read-only transitions, no deletion after 30 days, and no
      settlement of orphaned payments. It fails in the worst possible
      direction — zero rows is not an error, so the job finishes, reports
      success, and every counter is zero.

      ⚠️ The fix already exists and was never committed. `dofixo_dev` carries
      a fifth SECURITY DEFINER function, `app_all_workspaces`, with a
      COMMENT that reads exactly like the answer to this problem — "the job
      legitimately belongs to no workspace ... a raw query returns zero rows
      without error". Neither the migration that created it nor the code that
      would call it is in git, on any branch or in any commit. It exists only
      in one developer's database.

      The task is therefore to recover it rather than design it: dump the
      function, commit it as a real migration, point both raw queries at it
      (the payments one needs the same treatment), and raise the counts in
      `ops/restore-database.md` and `smoke.test.ts` from four `app_*`
      functions to five. RULES §7 wants a COMMENT saying why no ordinary
      query could do the job; this one already has a good one.

      An integration test is the point of the task, as it was for 8.10:
      seed two workspaces, run the job with no context, and assert it saw
      both. Every existing test of this job mocks Prisma, which is why a
      query that cannot return a row has been green all along.

## Phase 9 — UI Consolidation (after the migration settles)

Product changes deliberately held until the data model and auth stop moving,
so a screen that breaks has one obvious cause rather than three.

- [ ] 9.1 Fold the stock report into the items page as a filter and retire the separate page — it is the item list with one condition applied
- [ ] 9.2 Move the profit summary onto the dashboard and retire the profit report page, where it currently goes unseen
- [ ] 9.3 Let the purchase invoice form create a complete item inline. It creates a reduced one today, so the same catalogue has two entry points with different results
- [x] 9.4 Decided and done: a moving average _can_ be reversed from the invoice alone, as long as each line leaves at the price **it** came in at rather than at the blended average. That is the exact inverse, needs no history replay, and now runs on both delete and edit. `utils/avgPurchasePrice.ts` holds the two halves (`averageAfterAdding` / `averageAfterRemoving`) that the purchase-invoice lines and quick purchase had each been reimplementing. Two edge cases are deliberate: at zero remaining stock the previous figure is kept rather than zeroed (the valuation is zero either way, and the number still has to suggest a price on the next purchase form), and the remaining value is clamped at zero because the reversal cannot see sales that happened in between.
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
- [x] 10.11 `ProtectedRoute` uses a raw `text-gray-500` where every other
      component uses `text-text-secondary`, so it ignores the theme —
      swept up with the rest of the raw palette classes in the redesign

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

- [x] 10.15 `errorText` is defined identically in five components before
      `utils/errors.ts` existed; fold them into the shared one
- [ ] 10.16 Add type-aware linting (`parserOptions.project`) now that the
      whole frontend is TypeScript. It was left off during the migration
      because it type-checks the entire program on every run

## Phase 11 — Frontend redesign and invoice consistency

Not planned in this roadmap — it started as "redesign the dashboard" and ran
through every page, then into the modals, then into what the redesign
exposed. Recorded here after the fact so the next session knows it happened.

- [x] 11.1 A token layer in `src/index.css` bridged into Tailwind with
      `@theme inline`, and every page moved onto it. Raw hex and Tailwind
      palette classes are gone from `src/` — they were why a few components
      stayed light in dark mode
- [x] 11.2 The brand colour moved from yellow to blue, and the app is called
      دوفیکسو wherever a name is shown
- [x] 11.3 A validated categorical chart palette (`utils/chartSeries.ts`) —
      lightness band, chroma floor, adjacent-pair CVD ΔE, 3:1 contrast
- [x] 11.4 `utils/tableClasses.ts`: one vocabulary for every table, an
      Excel-style cell grid, zebra rows, and coloured row actions
- [x] 11.5 The layout shell — Jalali date centred in the header, the
      per-page `<h1>` and count line dropped, settings moved from the
      sidebar to a header icon, the role moved into the user menu
- [x] 11.6 The dashboard regrouped by module, with technician workload
      beside the device-status ring
- [x] 11.7 The subscription page and its plan cards rebuilt
- [x] 11.8 The modal layer brought onto the same system
- [x] 11.9 The three invoice form modals put on one skeleton — identity band
      on top, lines at 9/12, summary sticky at 3/12, actions full width
- [x] 11.10 Purchase invoices became editable (`PUT /api/purchase-invoices/:id`),
      the last of the three that could only be deleted and re-entered
- [x] 11.11 `avg_purchase_price` reversal — closes 9.4; see that entry
- [x] 11.12 The customer detail modal became a page, `/customers/:id`,
      with six sections and a breadcrumb back to the list. Reached from
      four different lists, which is what made a modal wrong: «back» has
      to mean the list. Brings `Customer.notes`, one aggregate endpoint
      (`GET /customers/:id/overview`) and `BreadcrumbContext`, through
      which a detail page names itself to the shell

Real defects found and fixed along the way, none of them styling: a cancelled
repair invoice left its outstanding balance standing; the purchase form
printed Latin digits through its own `toLocaleString`; the required asterisk
was rendered twice on two fields; the repair form's line row overflowed its
grid on a phone; a selected table row was invisible because `--primary-soft`
equalled `--surface`; eight hover states repeated their resting colour.

## Phase 12 — SMS Wallet (customer notifications the shop pays for)

Today every SMS the platform sends is ours: the OTP at sign-up, the expiry
reminders, the payment confirmation. This phase adds the other kind — a
message a workshop sends to its own customer — and the only sane way to pay
for it, which is that the workshop does.

The split is the whole point and has to hold everywhere in the code:

    Dofixo pays    OTP · subscription reminders · payment confirmation
    The shop pays  device accepted · ready for pickup · delivered

Nothing in `utils/subscriptionJob.ts`, `utils/otp.ts` or `utils/referral.ts`
may ever touch a wallet, and the wallet path may never send one of the five
templates those own.

Deliberately out of scope: bulk or marketing SMS, a message composer, arrears
(a shop can never go below zero), and delivery reports. All four are how an
SMS feature turns into an SMS product.

### Money and units

Rials in the database, tomans on screen — the rule `plans` and `payments`
already follow. 350 toman is 3,500 rials, and no column anywhere holds
tomans.

- [x] 12.1 Schema and migration. Five new models plus one column:

      `SmsWallet` — one row per workspace, `balanceRials`, created by
      `populateWorkspace()` so a seeded workspace and a registered one are
      furnished identically (the rule 3.1 established). Not a column on
      `Workspace`: the balance is written on a hot path with a row lock held,
      and locking the workspace row would serialise invoice numbering behind
      it.

      `SmsWalletTransaction` — the ledger. `type` (topup · send · refund ·
      adjustment), signed `amountRials`, `balanceBeforeRials`,
      `balanceAfterRials`, `description`, `createdBy`, and a reference to
      what caused it. Append-only, and like `payments` the application role
      gets no DELETE: a balance that can be reached two ways — a column and
      a sum of rows — is only trustworthy if the rows cannot be edited.

      `SmsMessage` — every attempt, sent or not. workspace, customer, device,
      phone, `kind`, `segments`, `unitPriceRials`, `costRials`, `status`,
      provider, `providerMessageId`, `errorCode`, `errorMessage`, `sentAt`,
      plus the debit and refund transaction ids. `segments` is there because
      a Persian SMS is 70 characters and every one of these templates needs
      two — see 12.2, which is now a costing question rather than a
      formatting one. Statuses: `pending`, `sent`,
      `failed`, `insufficient_balance`, `invalid_phone`, `disabled`,
      `refunded`. The four non-failure refusals are recorded as rows rather
      than dropped — "why did my customer not get a text" is the support
      question this table exists to answer.

      `SmsTopup` — the top-up ledger. See 12.4 for why this is not `Payment`.

      ⚠️ Platform credit is watched from sms.ir's own panel, not from our
      code: پروفایل › تنظیمات حساب کاربری › آگاه‌سازی از کمبود اعتبار, which
      texts us below a threshold (default 500 messages). There is nothing to
      build, but the number it alerts has to belong to somebody who acts on
      it — our account running dry stops every workshop at once.

      `SmsPrice` — reference data, following `plans` and `discount_codes`: no
      RLS, SELECT only for the app role, priced with psql. §5 of the brief
      says not to hardcode 350; a table is what "not hardcoded" means here,
      because an env var cannot be changed without a deploy and leaves no
      record of what the price was last month. The price is **per part**,
      not per message — see 12.2.

      `Settings.smsCustomerNotificationsEnabled`, default **false**. Off
      until a shop turns it on: a workspace that upgrades and discovers it
      has been texting customers is a worse first impression than one that
      has to find a switch.

      ⚠️ Every table above carrying `workspace_id` needs RLS and its
      `workspace_isolation` policy **in the same migration** (RULES §10), and
      `ops/restore-database.md` needs its policy count raised from 21.

- [x] 12.2 `utils/smsPricing.ts` — resolve the current unit price, count the
      message's parts, and copy both onto the `SmsMessage` row and the wallet
      transaction. Same reasoning as `payments.base_price_rials`: a history
      that re-renders at today's price is not a history. When the price moves,
      last month's messages must still read what they cost.

      ⚠️ **A Persian SMS is 70 characters, not 160.** Persian has no GSM-7
      encoding, so every message is UCS-2: 70 characters in one part, 67 per
      part once it is concatenated. All three texts in the brief run 102–130
      characters in a typical case and up to 170 with long names, which is
      **two parts, sometimes three**. Providers bill per part.

      That is the whole margin. sms.ir quotes **130–250 toman per پیامک on
      the silver plan, the rate improving with the size of the top-up**. At
      two parts that is 260 at the best tier and 500 at the worst, against
      the 350 the brief charges — profitable only if we buy in volume, and a
      loss otherwise. Two things follow, and both belong in this task:

      - The texts are tightened so the worst case is exactly two parts and
        never three, with the truncation caps in 12.5 chosen to guarantee it
        rather than left at `sendTemplate`'s 40. The proposed texts are in
        the note under the open questions.
      - `costRials = unitPriceRials × segments`, so the ledger explains
        itself and a future one-part template is automatically cheaper.

      The 350 on screen then has to become 700, or the price per part has to
      be what the shop is quoted. That is a pricing decision, not a technical
      one — see the open questions.

- [x] 12.3 Wallet engine, `utils/smsWallet.ts`. Three operations — credit,
      debit, refund — and nothing else may write `sms_wallets`.

      The debit is one statement, not a read followed by a write:

          UPDATE sms_wallets SET balance_rials = balance_rials - $cost
          WHERE workspace_id = $ws AND balance_rials >= $cost
          RETURNING balance_rials

      Zero rows means insufficient funds, and the balance never goes
      negative because the condition and the subtraction are the same
      statement. Checking in JavaScript first is exactly the race §15 of the
      brief describes: two users, 500 toman, two messages, −200.

      Raw SQL, so it runs inside `runInWorkspaceTransaction()` (RULES §7).
      The returned balance is `balanceAfter` on the ledger row — read back
      separately it would be somebody else's.

      Refund is idempotent by a unique index on
      `(smsMessageId, type = refund)`, not by a flag the caller checks: a
      second refund must be impossible, not merely unlikely.

      Per RULES §3 the arithmetic is a pure function with its own unit test,
      separate from the controller test that mocks Prisma — the same lesson
      `utils/avgPurchasePrice.ts` came out of in 11.11.

- [x] 12.4 Top-up through Zibal — same gateway, separate ledger.

      **Decided: a separate `SmsTopup` table, not a widened `payments`.**
      The obvious objection to a second table is duplication — the same
      Zibal dance twice. The reason it wins anyway is not taste, it is four
      existing call sites:

          subscriptionController.ts:56,155,221   paidBefore = payments where verified
          utils/referral.ts:69                   verifiedPayments > 1 → no reward

      Every one of them asks "has this workspace ever paid?" by counting
      verified rows in `payments`, and each takes the answer to mean the shop
      has bought a subscription before. Put a wallet top-up in that table and
      a shop that buys 20,000 toman of SMS credit **silently loses the 10%
      referral discount on its first subscription**, and the workshop that
      invited it silently loses its 30 days. No error, no log line, and the
      customer's complaint would arrive as "the discount didn't work".

      A `kind` column would fix it only by editing all four — and the fifth
      one, written next year by someone who does not know this rule, breaks
      it again. A separate table cannot be counted by accident.

      The rest follows from the same reading: `payments.plan_id` is NOT NULL,
      the row means "these many days were bought", and `settlePayment()`
      extends an expiry from it. `SmsTopup` gets the same shape and the same
      rules:
      row written before Zibal is called, amount checked against what verify
      returns, `orderId` prefixed `DFXS-` so the two are distinguishable in
      Zibal's panel by eye.

      Minimum 20,000 toman (§2), enforced server-side. The client sends an
      amount and nothing else — no plan, no price — which is the one place
      this differs from checkout, so the amount needs its own floor, ceiling
      and integer check in the Zod schema.

      Credit happens once: inside the same transaction as the status change
      to `verified`, and only when the payment was not already verified.
      Verify twice, refresh the return page, let the cron reach it after the
      browser did — the balance moves once.

      ⚠️ `lib/zibal.ts` has a single `CALLBACK_URL` constant, baked in at
      import as `${APP_URL}/subscription/callback` and passed by
      `requestPayment` itself. It needs an optional callback so a top-up
      returns to its own page; the domain stays the same, which is all Zibal
      checks (result 106).

      ⚠️ Orphaned top-ups need settling like orphaned payments do, and that
      half is **blocked on 8.11** rather than done. `settleAbandonedPayments`
      enumerates with a raw query that RLS answers with zero rows, so a
      top-up sweep written to match it would be inert from the first line —
      and written any other way would leave two patterns where the fix has
      to land once. `settleTopup()` itself is built and is what that sweep
      will call; only the enumeration is waiting.

      **Decided: a lapsed workspace may top up.** The 8.3 guard blocks POST
      for them, so `/api/sms/wallet/topup` and `/api/sms/wallet/verify` join
      `OPEN_PATHS` — and only those two. The toggle and everything else stay
      closed, matching the list's own rule that what is open is either a way
      to pay or a way to stay signed in long enough to.

      Credit bought while lapsed simply sits there: sending rides on a device
      write, which the guard blocks anyway, so nothing can be spent until the
      subscription is renewed. That falls out of the design rather than
      needing a check of its own, which is why it is safe to open.

- [x] 12.5 Three templates in `lib/sms.ts`, ids from the environment,
      alongside the five that exist. `.env.example` and `.env.prod.example`
      both gain them (RULES §7).

      ⚠️ **The message text does not live in this repository.** sms.ir
      approves each template in its panel and the body is stored there; we
      hold an id and a parameter list. §25 of the brief asks for central
      templates with `{{variables}}` — what we can actually centralise is the
      parameter mapping, and that is what this task builds. The three texts
      must be submitted and **approved in the sms.ir panel before this phase
      can be tested at all**, which makes it the long pole: start it first.

      ⚠️ **The 40-character ceiling in `sendTemplate` is wrong — sms.ir's
      real limit on a parameter value is 25**, confirmed by support, and
      extendable on request. The comment beside it says the number was never
      established; it has been now, and it is a third lower than the guess.
      Anything longer comes back as status 114, a rejected message. Change
      the constant to 25 and set the truncation caps under it
      (`NAME` 18 · `DEVICE` 16 · `NUMBER` 7 · `SHOP` 22), which is also what
      holds the two-part ceiling in 12.2. The slash rule stays: support did
      not address it and a guess that costs nothing is worth keeping.

      Also confirmed: a template's text can be edited later **under the same
      id**, so tightening wording is not a re-plumb of env vars; emoji are
      allowed; and there is no limit on the number of parameters.

      The reception number is the device id — the number the device list
      already shows and a customer can quote on the phone.

- [ ] 12.6 `utils/customerNotification.ts` — the layer the brief's §26 asks
      for, sitting between the device controller and `lib/sms.ts`:

          deviceController → customerNotification → smsWallet + lib/sms

      One function, `notifyCustomer(event, device, actor)`, and it is the only
      caller of the wallet's debit. In order: is the workspace's toggle on
      (else `disabled`) · does the customer have a valid mobile (else
      `invalid_phone`) · debit (else `insufficient_balance`) · send · on a
      provider failure, refund and mark `failed`. Every branch writes an
      `SmsMessage` row; three of the five write no transaction at all,
      because nothing was ever taken.

      No driver interface and no console driver, following OTP.2 — the tests
      mock the module.

      ⚠️ `Customer.phone` is a free-form string today (`max(20)`, no
      validation), while `phoneSchema` normalises to `09XXXXXXXXX`. Do not
      widen `customerBodySchema` to reject what shops have already typed —
      normalise at send time and record `invalid_phone` when it does not come
      out as a mobile. A landline customer is a real customer.

- [ ] 12.7 Wire it into the device controller — the part with the most ways
      to be subtly wrong.

      `devices.status` is a free-form string column (`@default("received")`),
      not an enum. The workflow's real vocabulary lives on the frontend in
      `utils/deviceStatus.ts`, which 11.1 consolidated out of six drifting
      copies, and it is nine states, not the five the pre-redesign screens
      showed:

          pending · diagnosing · unrepairable · waiting_for_parts ·
          repairing · repaired · ready_for_pickup · delivered · not_repaired

      Two of them matter here and the rest send nothing. «آماده تحویل» is
      `ready_for_pickup`, **not** `repaired` — a repaired device is one the
      bench is done with, and a shop that texts a customer at that point is
      texting them before the job is checked and priced. `delivered` is the
      third message. `unrepairable` and `not_repaired` are outcomes with no
      message in this phase.

      ⚠️ The trigger set therefore has to be named server-side, and the
      server has no list to name it from — the nine live in a frontend
      module the backend cannot import. Define the two triggering keys in
      the notification service as constants with this reasoning written
      down, and accept that a tenth status added to `deviceStatus.ts` will
      not send anything until someone decides whether it should. Turning
      the column into an enum shared by both ends is the real fix and
      belongs in phase 9, not here.

      **Acceptance fires on create only.** Not on an update that happens to
      set a status, ever (§11).

      **Ready and delivered fire on a transition, not on a value.** The
      update handler already reads the row before writing it
      (`deviceController.ts:264`), so the previous status is one added
      `select` away: `repairing → ready_for_pickup` sends,
      `ready_for_pickup → ready_for_pickup` does not (§10). A device the shop
      moves back and forth sends once per real move, which is what a customer
      would expect.

      **After the write, never inside it** (§29). The device transaction
      commits first; the SMS follows. A provider call can take twenty
      seconds, and holding a row lock that long for a text message is the
      mistake 8.10 already caught once. Failure to send never fails the
      device write — the response carries the outcome so the UI can say so.

      The request carries one boolean per event (`send_sms`). Everything
      else — whether the transition is real, whether there is credit,
      whether the toggle is on — is the server's decision. RULES §6: the
      client is not trusted for anything it could lie about.

- [ ] 12.8 Routes and schemas. `src/routes/sms.ts`, mounted at `/api/sms`:

          GET   /api/sms/wallet              balance, unit price, ~messages left
          POST  /api/sms/wallet/topup        amount → Zibal redirect
          POST  /api/sms/wallet/verify       track id → credit
          GET   /api/sms/wallet/transactions the wallet ledger
          GET   /api/sms/messages            the send log, paginated
          GET   /api/sms/settings            the toggle
          PATCH /api/sms/settings            flip it

      `atLeast("admin")` on all of the above (§23): a technician has no
      business seeing what the shop spends, exactly as with `/subscription`.
      Sending is **not** a route of its own — it rides on the device write,
      so a technician who may change a status may send the message that goes
      with it, and no new permission concept is introduced.

      One exception, and it exists because of that rule rather than despite
      it:

          GET /api/sms/capability   { can_send, reason }

      Open to any authenticated user. A technician's device modal has to know
      whether the checkbox works, and the wallet endpoint is the wrong way to
      tell them: it would put a balance in a response their role is not meant
      to see, and hiding it in the component would leave it in the network
      tab. So the server answers the question the modal actually asks — may
      this device send — as two booleans and a reason string, with **no
      amount in the payload at all**. Admins get the figure from the wallet
      endpoint they already have.

      Every handler validates through `validate()` and reads `req.valid`
      (RULES §6). `workspaceId` comes from the token, never the body.

- [ ] 12.9 Frontend: `pages/SmsWallet.tsx` at `/sms-wallet`, admin-only in
      both `App.tsx` and `Layout.tsx` — 10.8 is what happens when those two
      disagree. Balance, unit price, approximate messages remaining, the
      top-up amounts from §2 as presets plus a free-form field, top-up
      history and send history.

      `Subscription.tsx` as rebuilt in 11.7 is the model to follow, not the
      pre-redesign one: its `toToman`/`toTomanRounded` helpers, the table
      vocabulary from `utils/tableClasses.ts` (RULES §6a — no hand-rolled
      cells), the semantic colour tokens, and `PaymentReceipt` for a top-up
      receipt.

      A callback page for the top-up return, following `PaymentCallback.tsx`:
      it asks the backend to verify rather than trusting the query string.

- [ ] 12.10 `DeviceFormModal`: one checkbox per event, shown only when that
      event can actually fire — on create, the acceptance box; on edit, the
      box for the transition the form is about to make, decided against the
      status the form loaded with rather than the one in the select. The
      modal already imports `DEVICE_STATUSES`, so it knows both.

      Three states beside it, from `GET /api/sms/capability`: enough credit
      (checkbox live), not enough ("اعتبار کافی نیست"), notifications off
      ("ارسال پیامک غیرفعال است"). Existing design system, no new components
      (§24), and the modal layer 11.8 rebuilt is the shape to match.

      **The figure is never rendered here, for any role.** The endpoint does
      not carry it. The "شارژ کیف پول" and "فعال‌سازی" links show only to
      admins — a technician sent to a page their role cannot open is worse
      than a technician told to ask their manager, which is what the text
      says for them.

- [ ] 12.11 Low-balance notice, modelled on `SubscriptionBanner` and
      deliberately quiet: below 10,000 toman a warning, at zero a stronger
      one, each with a link to the wallet page and each dismissible for the
      session. Only where it is relevant — the device pages and the wallet
      page — not on every screen.

- [ ] 12.12 The toggle on the settings page, with a sentence saying plainly
      that these messages are charged to the shop's own wallet and are not
      part of the subscription (§21). Somebody will otherwise assume the
      subscription covers it, and find out from an empty wallet.

      ⚠️ 11.5 moved settings from the sidebar to a header icon — the entry
      point is not where a pre-redesign screenshot would put it.

- [ ] 12.13 Tests. The mocked suites cover the twenty scenarios in §30 of the
      brief; the ones that cannot be mocked go to `src/__tests__/integration/`:

      - The concurrency case is integration-only and is the reason 12.3 is
        raw SQL. Two simultaneous debits against a balance that covers one:
        exactly one succeeds and the balance never goes below zero. A mocked
        test cannot fail this — it never reaches Postgres, where the
        guarantee lives.
      - `sms_wallets`, `sms_wallet_transactions`, `sms_messages` and
        `sms_topups` each need a line in the `resources` table in
        `isolation.test.ts`; the wallet is a singleton per workspace, so it
        goes to `isolationSpecialCases.test.ts` with the reason written down
        (RULES §3).
      - Idempotency: verify twice, credit once. Refund twice, credit once.
      - Transitions: `repairing → ready_for_pickup` sends,
        `ready_for_pickup → ready_for_pickup` does not, `repaired` sends
        nothing, and editing a device never re-sends acceptance.
      - Price history: change `SmsPrice`, and yesterday's rows still read
        yesterday's price.
      - A provider failure refunds, and the refund leaves the balance where
        it started.

      The frontend still has no test runner, so 12.9–12.12 are verified by
      looking at them, through the throwaway Vite harness RULES §6b
      describes — "it compiles" is not verification of a UI change.

- [ ] 12.14 Documentation, in the same commit as the task that makes it true
      (RULES §8): a CLAUDE.md section on the wallet and the Dofixo/shop
      split, the new environment variables in both `.env.example` files, the
      policy count in `ops/restore-database.md`, and the expected table list
      in `prisma/rls-check.sql`.

### ✅ Resolved: the templates were approved

Second submission went through on 1405/06/19, with «دوفیکسو» as the fixed
organisation name and the workshop's name as an ordinary parameter — option
1 below. The ids, which 12.5 puts in the environment:

| قالب        | متغیر محیطی                     | شناسه    |
| ----------- | ------------------------------- | -------- |
| پذیرش دستگاه | `SMS_TEMPLATE_DEVICE_ACCEPTED`  | `351476` |
| آماده تحویل  | `SMS_TEMPLATE_DEVICE_READY`     | `153383` |
| تحویل دستگاه | `SMS_TEMPLATE_DEVICE_DELIVERED` | `986773` |

⚠️ 12.5 must read the approved bodies out of the sms.ir panel before writing
the parameter map. `sendTemplate` sends parameters by name, and a template
approved with `#CUSTOMER#` where the code sends `#NAME#` fails at send time
as a rejected message — not at boot, and not in any test that mocks the
provider.

The history below is kept because the rule it ran into still shapes the
design, and because option 2 is what a second provider would need.

### The rule it ran into: whose name is on the message

The first submission was rejected, and one of the two reasons is not a
wording problem:

> نام مجموعه باید ثابت باشد

The sending organisation's name has to be **fixed text in the template**,
not a parameter. That is a rule written for one company texting its own
customers, and this feature is the other shape: one platform account, 500
workshops, each needing its own name on a message to a stranger. `#SHOP#`
as a variable is exactly what the reviewer refused.

Three ways out, in the order they should be tried:

1. **Fixed «دوفیکسو» plus the shop as an ordinary data field.** The
   organisation is us — we hold the account — and the workshop's name is
   then just another value in the body, like the device or the reception
   number. The templates below are written this way. This is a question for
   support before resubmitting, not something to infer from a rejection
   notice.
2. **A dedicated line per workshop.** Support says خط اختصاصی is available.
   It solves the naming question completely and is unthinkable at 500
   tenants — one line, one approval, one invoice each.
3. **Drop the shop name.** One part instead of two, so half the cost, and a
   customer who cannot tell which of the two repair shops in town is texting
   them. The feature still works; it is just worth less.

Option 1 was accepted, so the wording below is what was approved rather than
a proposal. Option 2 stays on record: it is what a workshop wanting its own
sender line would need, and what a second provider would have to offer.

### The three templates, for the sms.ir panel

Submitted as-is; the ids come back into `.env` as `SMS_TEMPLATE_DEVICE_*`.
Parameter names are what `sendTemplate` passes, so they must match exactly.

**پذیرش دستگاه** — `SMS_TEMPLATE_DEVICE_ACCEPTED`

    #NAME# عزیز، دستگاه #DEVICE# با شماره پذیرش #NUMBER# در تعمیرگاه #SHOP# پذیرش شد.
    دوفیکسو

**آماده تحویل** — `SMS_TEMPLATE_DEVICE_READY`

    #NAME# عزیز، دستگاه #DEVICE# با شماره پذیرش #NUMBER# در تعمیرگاه #SHOP# آماده تحویل است.
    دوفیکسو

**تحویل دستگاه** — `SMS_TEMPLATE_DEVICE_DELIVERED`

    #NAME# عزیز، دستگاه #DEVICE# با شماره پذیرش #NUMBER# تحویل داده شد.
    تعمیرگاه #SHOP# | دوفیکسو

124, 131 and 128 characters at the truncation caps — two parts in every
case the caps allow, never three. The caps are `NAME` 18 · `DEVICE` 16 ·
`NUMBER` 7 · `SHOP` 22, each inside sms.ir's 25-character limit on a
parameter value.

The reviewer's second objection is a submission-form matter rather than a
wording one — each parameter needs a description saying what goes in it:

| پارامتر   | توضیح                        | نمونه        |
| --------- | ---------------------------- | ------------ |
| `#NAME#`  | نام و نام خانوادگی مشتری     | علی رضایی    |
| `#DEVICE#`| نام دستگاه تعمیری            | یخچال سامسونگ |
| `#NUMBER#`| شماره پذیرش دستگاه (عددی)    | 1042         |
| `#SHOP#`  | نام تعمیرگاه پذیرنده         | تعمیرگاه مرکزی |

What was cut from the brief's wording, and why: the 🌱 and the closing
thanks (about 25 characters, which is a third part on its own — a greeting
worth 200 toman a message is a greeting worth losing, and emoji are allowed
but not free), and «لطفاً برای دریافت دستگاه ... مراجعه فرمایید», since a
customer told their device is ready knows to come and get it.

### Open questions — answer before 12.1

1. **May the workshop's name be a parameter if «دوفیکسو» is the fixed
   organisation name?** The blocker above. Everything in 12.5 waits on it,
   and the answer decides whether these messages carry a shop's identity at
   all.
2. **Is the 130–250 toman quoted per part or per message?** Support answered
   the tariff but not this, and it is the difference between 260 and 130 a
   message. Cheaper to settle empirically than by ticket: send one short
   (one-part) and one long (two-part) template to a test number and compare
   the `cost` in each response against the credit the panel actually
   deducts. That also settles what `cost` means and in what unit — which we
   want anyway, because recording the provider's real figure on each
   `SmsMessage` beats charging a number we assumed.
3. **What does the shop pay?** At the best tier two parts cost 260, so 350
   leaves 90 — real but thin, and negative at the worst tier. 500 is the
   comfortable number and still reads as a round price. Depends on 2.
4. **`repaired` versus `ready_for_pickup`.** 12.7 sends «آماده تحویل» on
   `ready_for_pickup` only, on the reasoning that a `repaired` device is one
   the bench has finished with but nobody has checked or priced yet. If
   shops in practice treat `repaired` as the moment to call the customer,
   the trigger moves — but it cannot be both without texting twice for one
   job.

## How to use this with Claude Code

- Point Claude Code at one task at a time (e.g. "Read CLAUDE.md and ROADMAP.md, then do task 1.3").
- Phases are meant to be done roughly in order — Phase 2 (multi-tenancy) depends on Phase 1
  (Postgres/Prisma) being done; Phase 3 (auth) depends on Phase 2 (`workspaceId` existing).
  Phases 4–6 can be interleaved once Phase 3 is stable. Phase 7 can start in parallel once there's
  something worth deploying. Phase 8 stays last.
- After finishing a task, update this file: flip `[ ]` to `[x]` (or `[~]` if partially done) so the
  roadmap always reflects real progress.
