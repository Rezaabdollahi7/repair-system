# CLAUDE.md

## Project Overview

**Dofixo**  is a repair-shop management SaaS application, aimed at small repair
workshops (home appliances, mobile phones, laptops, etc.) in Iran. It lets a shop register devices
brought in for repair, manage customers, staff, inventory, and purchase/sale/repair invoices, and
track profitability.

The product currently works as a **single-tenant** app and is being migrated to a **multi-tenant
SaaS**. The existing feature set and business logic are considered correct and should be preserved —
this migration is about infrastructure/architecture, not a feature rewrite.

- Landing page (marketing site): `dofixo.ir`, built separately with Astro (not in this repo).
- App domain: `app.dofixo.ir` (single shared domain — no per-tenant subdomains).

## Repository Structure

Monorepo-style, two top-level apps:

```
backend/    Node.js/Express API
frontend/   React SPA (Vite)
```

### Backend (`backend/`)

- `src/controllers/` — one controller per resource (devices, customers, personnel, invoices, etc.)
- `src/routes/` — Express route definitions, one file per resource
- `src/middleware/` — `auth.js` (JWT verification), `authorize.js` (role-based access)
- `src/config/database.js` — DB connection setup
- `src/jobs/backupScheduler.js` — scheduled backups (node-cron)
- `src/scripts/` — one-off scripts (Excel import, admin reset, device image import)
- `src/utils/` — helpers, including `persianToEnglish.js` for digit/text conversion

### Frontend (`frontend/`)

- `src/pages/` — one component per top-level page/route (Dashboard, DeviceList, CustomerList, etc.)
- `src/components/` — shared/reusable components, including per-entity modals
  (`*FormModal.jsx`, `*DetailModal.jsx`) following a consistent CRUD-modal pattern
- `src/context/` — `AuthContext`, `ModalContext`, `ThemeContext`
- `src/api/index.js` — centralized Axios API client
- `src/utils/` — formatters and helpers (Jalali date handling included)

## Domain Model (current feature set)

Pages: Dashboard, Devices, Customers, Personnel, Inventory/Items, Purchase Invoices,
Sale Invoices, Repair Invoices, Stock Report, Profit & Loss Report, Backups, Settings.

Key entities:

- **Device** — a repair job/item brought in by a customer; has status, assigned technician,
  intake/exit dates, and is linked to a customer.
- **Customer** — has a history of devices; searchable by name or phone.
- **Personnel (staff user)** — three roles: **super admin**, **admin**, **technician**.
  Technicians currently only have access to Devices and Customers pages.
- **Item** — inventory good with SKU, name, category, unit, minimum stock threshold, opening stock.
- **Invoices** — three kinds (purchase, sale, repair), each with date, description, line items,
  and payment status.
- **Reports** — low-stock report (items below minimum threshold), profit & loss report
  (sales, purchases, net, margin).
- **Backups** — full DB + device photo backups.

All Persian/Jalali date handling uses `jalaali-js`; dates are stored in Gregorian in the DB and
converted at the application layer for display.

## Current Tech Stack

**Backend:** Node.js, Express 5, JWT auth, bcryptjs, multer (uploads), sharp (image processing),
node-cron, jalaali-js, pnpm. Current DB is SQLite (`repair_system.db`) via `sql.js`.

**Frontend:** React 19, Vite, React Router 7, Tailwind CSS 4, Axios, react-hot-toast,
react-to-print, jalaali-js, pnpm.

## SaaS Migration (in progress — branch `feature/multi-tenant-migration`)

This is the primary focus of current work. Read this section carefully before making changes
related to auth, tenancy, or the database layer.

### Goals

Turn the existing single-tenant app into a multi-tenant SaaS where independent repair shops can
sign up, get a free trial, and later pay for a subscription — **without changing the existing
business features**. Payment integration is the last phase and is explicitly out of scope for now.

### Tenancy model

- **Shared database, shared schema.** No per-tenant schemas or separate databases.
- Isolation is done via a `workspaceId` column on every tenant-scoped table.
- **Postgres Row-Level Security (RLS)** enforces isolation at the database level, in addition to
  application-level filtering — defense in depth. Every query must set/scope by `workspaceId`.
  - Application-level filtering is implemented via a **Prisma Client Extension** (not Prisma
    Middleware — `prisma.$use()` is deprecated as of Prisma 6 and must not be used). The extension
    and RLS are two independent layers: forgetting one still leaves the other as a safety net, but
    neither should be skipped.
- Expected scale: ~500 tenants (workspaces), up to ~1,000 devices each. Design with this scale in
  mind (e.g., composite indexes that lead with `workspaceId`), but don't over-engineer beyond it.

### Workspace & roles

- On sign-up, a user creates a new **workspace** (repair shop) with a unique name/identifier and
  becomes that workspace's **super admin**.
- Within a workspace, the super admin can create additional users with roles: **admin** and
  **technician** (same 3-role model as today, just now scoped per-workspace).
- There is currently **no separate system-wide super-admin panel**. Platform-level administration
  (tenants, plans, subscriptions) is done directly against the database for now. Don't build a
  system admin UI unless explicitly asked.

### Auth

- Sign-up/login uses **username + password** for now. Username = the user's phone number
  (unique). SMS-based verification (via Kavenegar) is planned but **not implemented yet** — no
  Kavenegar account exists yet.
- **Token strategy (decided):**
  - **Access token (JWT)**, short-lived (~15 min), payload includes `userId`, `workspaceId`, `role`
    so middleware can authorize without an extra DB round-trip.
  - **Refresh token**, long-lived (~30 days), stored server-side in a `RefreshToken` table
    (revocable), delivered to the client as an **httpOnly cookie** (not localStorage) to reduce
    XSS risk.
- Keep using bcryptjs for password hashing.

### Subscriptions (plan, not yet implemented)

- Free trial: **7 days, no feature restrictions**.
- Paid plans: monthly / 3-month / 6-month / annual — **identical features across all plans**,
  price/duration only differs.
- When a subscription lapses, the workspace becomes **read-only** (no writes, data still visible).
- **Payment gateway is Zibal** — this integration is explicitly the **last phase** of the
  migration. Do not build payment flows unless asked.
- Trial-expiry enforcement (locking to read-only after 7 days) is **not being implemented yet**
  either — it will be tackled together in a later session. Don't add expiry-checking middleware
  proactively.

### Database migration

- Moving from SQLite/sql.js to **PostgreSQL via Prisma** 
- Existing data does **not** need to be preserved — the DB can be wiped and recreated.
- New Prisma schema should be **modeled after the current SQLite schema's shape/entities**, not
  redesigned from scratch — add `workspaceId` and related SaaS fields on top of the existing model.
- Existing uploaded device photos will also be discarded; new uploads go straight to object
  storage (see below), no local-to-object-storage migration needed.

### Object storage

- Photos (device images, settings/logo images) move from local disk (`backend/uploads/`) to an
  **S3-compatible object storage** — **ArvanCloud Object Storage** (not yet provisioned).

### Infrastructure

- **App server**: hosts backend + frontend (both from ParsPack, not yet provisioned).
- **Database server**: separate host running PostgreSQL (ParsPack, not yet provisioned).
- **Object storage**: ArvanCloud (not yet provisioned).
- **Docker**: used for both development and production. Prefer docker-compose for local dev;
  production should also run containerized (a reverse proxy such as Nginx/Caddy is expected but
  not yet decided in detail).
- **CI/CD**: not set up yet, and the team is new to CI/CD concepts. When this becomes relevant,
  start simple (e.g., a GitHub Actions workflow that just runs tests on push) before considering
  automated deploys.

### Planned additions to the stack

- **TypeScript** (backend, likely frontend later too)
- **Zod** — request validation
- **react-hook-form** — frontend forms
- **helmet** — HTTP security headers
- **express-rate-limit** — rate limiting
- **Docker** — containerization for dev and prod
- **Testing** — Jest is **not installed yet**; roadmap task 0.5 adds it. For phase one, focus on
  **unit tests for controllers/services**. Integration tests can come later.
- **Prisma + PostgreSQL** — replacing sql.js/SQLite (and the unused knex dependency)

## Working Conventions

- Preserve existing business logic and UI/UX patterns; this migration is about the underlying
  architecture (multi-tenancy, DB, auth, infra), not a feature or design rewrite.
- Every new or modified query/table that stores tenant data must include `workspaceId` and respect
  RLS — never write a query that could leak data across workspaces.
- Keep Persian-language UI text and Jalali date formatting conventions consistent with the
  existing frontend.
- The developer (Reza) is a frontend/React Native developer by background — explain backend/infra
  concepts (e.g., CI/CD, token strategies) clearly and don't assume prior DevOps experience, but
  don't over-explain concepts he's already demonstrated familiarity with.
- Favor readable, complete code over terse snippets — write out full files/functions rather than
  partial diffs described in prose, unless explicitly asked for a smaller patch.
