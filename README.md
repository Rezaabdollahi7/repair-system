<div align="center">

# 🔧 Dofixo

### Multi-tenant repair shop management, built for Iranian workshops

[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-26-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-06B6D4)](https://tailwindcss.com/)

[English](./README.md) | [فارسی](./README.fa.md)

**Live:** [app.dofixo.ir](https://app.dofixo.ir) · **Marketing site:** [dofixo.ir](https://dofixo.ir)

</div>

---

## 📋 About

**Dofixo** is a hosted, multi-tenant SaaS platform for small repair workshops — mobile
phones, laptops, home appliances. Each workshop signs up, gets its own isolated
workspace, and runs its entire operation from device intake through to invoicing and
financial reporting.

The interface is Persian throughout: RTL layout, Jalali dates, Persian numerals, and
Rial amounts.

This repository began life as a single-tenant application running on SQLite and a local
network. It is now a multi-tenant platform on PostgreSQL with row-level security,
SMS-verified sign-up, object storage, subscription billing, and encrypted nightly
backups.

---

## 🏢 Multi-tenancy

Isolation is the central design constraint of this codebase. It is enforced in two
independent layers, and neither is redundant:

**1. Application filtering.** Every tenant-scoped table carries a `workspaceId`. A
Prisma client extension injects it into every query, so a controller cannot forget it.

**2. PostgreSQL Row-Level Security.** Every tenant-scoped table has a
`workspace_isolation` policy reading `app.workspace_id` from the session. Even a query
that escaped the extension returns nothing.

The workspace id travels from the verified JWT — never from a request body or query
parameter — through `AsyncLocalStorage` into a `set_config()` on the connection:

```
requestContext (middleware) → opens AsyncLocalStorage
authenticate                → setContextWorkspaceId(payload.workspaceId)
Prisma extension            → set_config('app.workspace_id', id, TRUE)
```

If the context is missing, the extension throws rather than letting RLS silently return
zero rows — a wrong answer is worse than an error.

**Two database roles, deliberately.** The application connects as `dofixo_app`, which
owns no tables. In PostgreSQL a table's owner *bypasses* RLS, so the owner credential
exists only in the migration container and never in the environment of a process that
serves requests.

**Three `SECURITY DEFINER` functions** are named, deliberate holes in RLS —
`app_login_lookup`, `app_create_workspace` and `app_refresh_lookup` — each existing
because the caller has no workspace context yet.

---

## ✨ Features

### 🏪 Workspace & Onboarding

- Self-service sign-up with SMS verification (OTP)
- Username is the mobile number — one identity, verified at the door
- 30-day free trial, no feature restrictions, no card required
- Per-workspace settings, branding and invoice counters

### 💳 Subscription & Billing

- Three plans: 90 days, 180 days, 425 days
- Zibal payment gateway with server-side price calculation
- Discount codes (percentage or fixed), largest discount wins — they never stack
- Referral programme: the invited workshop gets a discount, the referrer gets extra days
- Printable payment receipts with gateway reference numbers
- Read-only guard after expiry: 3-day grace period, then reads work and writes return
  `402` — expired is not forbidden
- Nightly job for reminders, status transitions, data deletion and payment settlement

### 📋 Device Management

- Fast device registration with an atomic acceptance number
- Search by acceptance number, customer, brand or model
- Filtering by status, date range and assigned technician
- Status workflow: Pending → Diagnosing → Repairing → Repaired → Delivered
- Technician assignment with history
- Image upload with EXIF-aware rotation, resizing and thumbnails
- Fullscreen image slider

### 👥 Customer Management

- Customer profiles with full repair history
- Per-customer statistics: device count, successful repairs, average repair time
- Quick search by name or phone number

### 👨‍🔧 Personnel & Roles

- Three roles: Super Admin, Admin, Technician
- Activation and deactivation without deletion
- Route-level and UI-level role enforcement

### 📦 Inventory

- Parts catalogue with code, name, category and unit
- Real-time stock tracking with low-stock alerts
- Weighted average purchase price
- Quick purchase and quick sale from the item detail view
- Full transaction history per item

### 🧾 Invoicing

Three invoice types, each with its own atomic counter (`PUR-0001`, `SAL-0001`,
`REP-0001`):

- **Purchase invoices** — supplier purchases, automatic stock increase, payment tracking
- **Sale invoices** — direct parts sales, stock validation, suggested pricing, printable
  template (A4 / A5 / thermal)
- **Repair invoices** — linked to a device, three line-item types (inventory, service,
  custom), discount and tax, warranty period, payment history, printable with logo,
  stamp and signature

### 📊 Dashboard & Reports

- Real-time KPIs: devices, revenue, profit
- Device status distribution and stock overview
- Monthly and daily financial summaries
- Profit/loss report by item with date filtering
- Stock report with category filter
- Transactions report

### 📤 Data Export

- Full workspace export: seven-sheet Excel workbook plus a ZIP of every device image
- Built in the background — a workshop with a thousand devices takes minutes, longer
  than any reverse proxy holds a connection open
- Downloaded through a time-limited presigned URL

### 🎨 Interface

- Persian (RTL) throughout, Jalali calendar, Persian numerals
- Light and dark themes
- Collapsible sidebar, floating action button, confirmation modals
- Responsive from phone to desktop

---

## 🔐 Security

| Area | Approach |
| --- | --- |
| **Tenant isolation** | `workspaceId` filtering *and* PostgreSQL RLS, independently |
| **Database role** | Application runs as a non-owner role that cannot bypass RLS |
| **Access tokens** | JWT, 15 minutes, held in page memory — never `localStorage` |
| **Refresh tokens** | 30 days, 32-byte random secret (not a JWT), stored as a SHA-256 hash |
| **Token rotation** | Replaying a revoked token invalidates every session for that user |
| **Cookies** | `httpOnly`, `SameSite=Strict`, `Path=/api/auth`, `Secure` in production |
| **Passwords** | bcrypt |
| **Input validation** | Zod schema on every route; handlers read `req.valid`, never `req.body` |
| **Rate limiting** | Independent ceilings for login, OTP and general API traffic |
| **Object storage** | Private buckets, presigned URLs signed per request after the row is scoped |
| **Headers** | `helmet`, with `Referrer-Policy` at `strict-origin-when-cross-origin` |
| **Secrets** | `JWT_SECRET`, `DATABASE_URL_APP` and API keys throw at import — no fallbacks |
| **Backups** | Nightly `pg_dump`, encrypted with `age`, uploaded to object storage |

**No fallback values, anywhere.** A missing secret stops the process at boot. The
alternative is an application that starts, accepts sign-ups, and fails on the one
request that matters.

---

## ⚙️ Tech Stack

### Backend

```
Node 26 · TypeScript 5.9 · Express 5 · pnpm 10

Prisma 7 + @prisma/adapter-pg + pg 8 · PostgreSQL 17
Zod 4 · helmet 8 · express-rate-limit 8 · cookie-parser
@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
bcryptjs · jsonwebtoken · multer · sharp · jalaali-js · archiver 7
Jest 30 + ts-jest + supertest
```

### Frontend

```
React 19 · Vite 8 · React Router 7 · Tailwind 4 · TypeScript 5.9
Axios · react-hot-toast · react-to-print · jalaali-js · @heroicons/react
```

### Infrastructure

```
Docker Compose · Caddy (the only service publishing ports)
S3-compatible object storage (private buckets)
sms.ir (OTP and notifications) · Zibal (payments)
age (backup encryption) · s3cmd
```

---

## 🏗️ Project Structure

```
Dofixo/
├── backend/
│   ├── prisma/
│   │   ├── migrations/        14 migrations
│   │   ├── schema.prisma      30 models
│   │   ├── rls-check.sql      finds tables missing an RLS policy
│   │   └── seed.ts            development only
│   ├── src/
│   │   ├── lib/               prisma · storage · workspaceContext
│   │   │                      sms · zibal · imageProfile
│   │   ├── controllers/       16 controllers
│   │   ├── routes/            REST routes
│   │   ├── middleware/        auth · authorize · requestContext
│   │   │                      validate · subscription
│   │   ├── schemas/           Zod schema per resource
│   │   ├── scripts/           subscriptionCron.ts
│   │   ├── utils/             subscription · pricing · referral
│   │   │                      workspaceDeletion · jalali · export/
│   │   └── __tests__/         unit suites + integration/
│   ├── Dockerfile             multi-stage: runtime + tooling targets
│   └── Dockerfile.dev
│
├── frontend/
│   ├── src/
│   │   ├── api/               Axios client with refresh interception
│   │   ├── components/        29 components
│   │   ├── context/           Auth · Modal · Subscription · Theme
│   │   ├── pages/             19 pages
│   │   ├── types/             api.ts describes every endpoint's shape
│   │   └── utils/
│   ├── Dockerfile             nginx-unprivileged
│   └── nginx.conf
│
├── ops/
│   ├── backup-database.sh     nightly encrypted backup
│   ├── subscription-cron.sh   nightly subscription job
│   ├── extract-workspace.sh   pull one workspace out of a backup
│   ├── reset-password.sh      operator account recovery
│   └── *.md                   runbooks
│
├── docker-compose.yml         development
├── docker-compose.prod.yml    production
└── Caddyfile
```

**The frontend is fully TypeScript.** `allowJs` is closed — a new `.js` file under
`src/` is a compile error. `tsc --noEmit` runs inside `pnpm build`, which is the only
automated gate the frontend has.

---

## 🚀 Development Setup

### Prerequisites

- Docker and Docker Compose v2
- Node.js 20+ and pnpm (for running commands outside the container)

### Getting started

```bash
git clone <repository-url>
cd Dofixo

# Environment
cp backend/.env.example backend/.env
# Fill in: DATABASE_URL, DATABASE_URL_APP, JWT_SECRET,
#          S3_*, SMS_*, ZIBAL_MERCHANT, APP_URL

# Bring up Postgres, backend and frontend
docker compose up -d --build

# Apply migrations and seed a development workspace
docker compose exec backend pnpm prisma migrate deploy
docker compose exec backend pnpm prisma db seed
```

The frontend runs at `http://localhost:5173`, the API at `http://localhost:5001`.

The seed creates one workspace and a super admin from `SEED_ADMIN_USERNAME` and
`SEED_ADMIN_PASSWORD`. It never runs in production, where `migrate deploy` is enough —
the three roles ship as reference data inside a migration.

### Useful commands

```bash
# Tests
cd backend
pnpm test              # unit suites, mocked
pnpm test:integration  # needs Postgres and the dofixo_test database
pnpm test:all          # both

# Quality gates
pnpm lint && pnpm build

# After adding a dependency, rebuild — a plain restart keeps the old
# node_modules, because an anonymous volume shadows /app/node_modules
docker compose up -d --build --renew-anon-volumes backend

# After a migration
docker compose exec backend pnpm prisma generate
```

⚠️ `DATABASE_URL` must use `127.0.0.1`, not `localhost`. Prisma 7 requires a driver
adapter, and the two resolve differently.

---

## 🧪 Testing

**Backend unit tests** mock the database and cover controllers, schemas, pricing,
subscription scheduling, the SMS and Zibal clients, and the authorization middleware.

**Integration tests** run against real PostgreSQL and prove the things a mock cannot:
tenant isolation across every REST resource, invoice numbering under concurrency, token
rotation, sign-up, referral rewards and the full payment cycle.

A new REST resource needs one line in the `resources` table in
`isolation.test.ts` — not four new tests. Anything that does not fit that shape
(singletons, aggregates) goes in `isolationSpecialCases.test.ts` with a comment saying
why.

⚠️ The frontend has no automated test infrastructure yet. TypeScript is its only gate.

---

## 📡 API Overview

All routes are prefixed `/api` and require a bearer token except where noted.

| Group | Routes |
| --- | --- |
| **Auth** | `login` · `register` · `send-otp` · `reset-password` · `refresh` · `logout` · `me` · `change-password` |
| **Devices** | CRUD · images · assignments |
| **Customers** | CRUD · devices · stats |
| **Personnel** | CRUD · toggle active |
| **Items** | CRUD · search · low-stock · transactions · quick purchase/sale |
| **Categories · Services** | CRUD |
| **Invoices** | `purchase-invoices` · `sale-invoices` · `repair-invoices` (+ payments, status) |
| **Reports** | dashboard · stock · purchases · sales · profit |
| **Settings** | read · update · image upload |
| **Exports** | request · list · download |
| **Subscription** | status · quote · checkout · verify · payments · referral |

Every handler validates its input with a Zod schema through the `validate()` middleware
and reads from `req.valid`. `workspaceId` and `role` always come from the verified JWT.

---

## 🚢 Deployment

Production runs as four containers on a single host — Postgres, backend, frontend and
Caddy — with Caddy the only service publishing ports. A fifth service, `migrate`, sits
behind a Compose profile and never runs alongside the API: it is the one place the
database owner credential exists.

Images are built on a workstation and transferred with `docker save`, because the
production host has no route to Docker Hub or npm.

The operational runbook lives in `DEPLOY.md`, which is kept outside version control.
`HANDOFF.md` is the authoritative record of project state, architectural decisions and
the reasoning behind them.

---

## 📊 Project Status

| Phase | Status |
| --- | --- |
| 0 — Infrastructure and tooling | ✅ |
| 1 — SQLite → PostgreSQL | ✅ |
| 2 — Multi-tenancy | ✅ |
| 3 — Authentication rewrite | ✅ |
| 4 — Object storage | ✅ |
| 5 — Backup and data export | ✅ |
| OTP — SMS verification | ✅ |
| 7 — Deployment | ✅ |
| 8 — Subscription and payments | ✅ |
| 9 — UI consistency | ⬜ |
| 10 — Frontend bug sweep | ⬜ |

---

## 👨‍💻 Credits

**Developer:** Reza Abdollahi
**Email:** srezaabdollahi7@gmail.com
**GitHub:** [@Rezaabdollahi7](https://github.com/Rezaabdollahi7)

---

<div align="center">

**Status:** Live in production

</div>
