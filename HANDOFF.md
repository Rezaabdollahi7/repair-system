# Dofixo — سند انتقال پروژه

> این سند برای ادامه‌ی کار مهاجرت Dofixo از تک‌مستأجری به SaaS در یک نشست جدید نوشته
> شده است. همه‌چیزی که برای ادامه لازم است اینجاست: وضعیت فعلی، تصمیمات گرفته‌شده و
> دلیلشان، تسک‌های باقی‌مانده، بدهی‌های فنی، و دام‌هایی که در مسیر به آن‌ها خوردیم.
>
> **تاریخ آخرین به‌روزرسانی:** پایان تسک ۲.۵ (scope کردن کنترلرها به `workspaceId`)

---

## ۱. پروژه در یک نگاه

**Dofixo** یک نرم‌افزار مدیریت تعمیرگاه است برای کارگاه‌های کوچک تعمیر (لوازم خانگی،
موبایل، لپ‌تاپ) در ایران. دستگاه‌های ورودی، مشتریان، پرسنل، انبار و فاکتورهای
خرید/فروش/تعمیر را مدیریت می‌کند و سود و زیان را دنبال می‌کند.

نرم‌افزار قبلاً به‌صورت **تک‌مستأجری** در شرکت خود مالک استفاده می‌شد و حالا در حال
تبدیل به **SaaS چندمستأجری** است.

| مورد       | مقدار                                                             |
| ---------- | ----------------------------------------------------------------- |
| مخزن       | `/Programming/Code/Dofixo` (مونوریپو: `backend/` و `frontend/`)   |
| برنچ فعال  | `feature/multi-tenant-migration`                                  |
| دامنه‌ی اپ | `app.dofixo.ir` — **دامنه‌ی مشترک، بدون زیردامنه برای هر مستأجر** |
| سایت معرفی | `dofixo.ir` (Astro، مخزن جدا، خارج از این کار)                    |
| زبان رابط  | فارسی، تاریخ جلالی                                                |
| واحد پول   | ریال                                                              |

**هدف اصلی:** تبدیل زیرساخت به SaaS **بدون تغییر مجموعه‌ی ویژگی‌های موجود**. این یک
بازنویسی محصول نیست — منطق کسب‌وکار فعلی درست فرض می‌شود.

---

## ۲. وضعیت فعلی — چه چیزی تمام شده

### فاز ۰ — زیرساخت و ابزار ✅ کامل

| تسک                                                   | وضعیت            |
| ----------------------------------------------------- | ---------------- |
| 0.1 Postgres محلی با Docker Compose                   | ✅               |
| 0.2 TypeScript در backend                             | ✅               |
| 0.3 ESLint + Prettier یکدست                           | ✅               |
| 0.4 helmet + express-rate-limit                       | ✅               |
| 0.5 Jest + smoke test                                 | ✅               |
| 0.6 Docker Compose کامل (backend, frontend, postgres) | ✅               |
| 0.7 حذف knex                                          | ✅ (از قبل نبود) |
| 0.8 Zod + middleware اعتبارسنجی                       | ✅               |

### فاز ۱ — مهاجرت SQLite → PostgreSQL ✅ کامل

| تسک                               | وضعیت                 |
| --------------------------------- | --------------------- |
| 1.1 طراحی اسکیمای Prisma          | ✅                    |
| 1.2 migration اولیه               | ✅                    |
| 1.3 بازنویسی ۱۴ کنترلر روی Prisma | ✅                    |
| 1.4 غیرفعال‌سازی بکاپ (تا فاز ۵)  | ✅                    |
| 1.5 حذف اسکریپت‌های sql.js        | ✅                    |
| 1.6 تأیید کارکرد سرتاسری          | ✅                    |
| 1.7 یکدست‌سازی شماره فاکتور       | ↪ منتقل شد به **۲.۸** |

**علاوه بر این:** `sql.js` کاملاً حذف شد، `config/database.js` رفت، و health check حالا
واقعاً وضعیت Postgres را گزارش می‌دهد (قبلاً حتی با دیتابیس خاموش `connected` می‌گفت).

### فاز ۲ — چندمستأجری 🔄 در حال انجام

| تسک                                      | وضعیت                |
| ---------------------------------------- | -------------------- |
| 2.1 مدل `Workspace`                      | ✅                   |
| 2.2 `workspaceId` روی همه‌ی جدول‌ها      | ✅                   |
| 2.3 سیاست‌های RLS در Postgres            | ⬜ **بعدی**          |
| 2.4 تنظیم `app.workspace_id` per request | ⬜                   |
| 2.5 scope کردن همه‌ی کنترلرها            | ✅                   |
| 2.6 ایندکس‌های مرکب                      | ✅ (در ۲.۲ انجام شد) |
| 2.7 تست‌های ایزولاسیون                   | ⬜                   |
| 2.8 یکدست‌سازی شماره فاکتور              | ⬜                   |

**⚠️ ترتیب عمدی:** روادمپ اصلی می‌گفت ۲.۳ (RLS) قبل از ۲.۵ (کنترلرها). آن را عوض
کردیم چون اگر اول RLS روشن شود، هر کوئری بدون context هیچ ردیفی برنمی‌گرداند و اپ
ساکت و بدون پیام خطا از کار می‌افتد. حالا که کنترلرها درست‌اند، اگر بعد از روشن کردن
RLS چیزی خالی برگشت، می‌دانیم مشکل از RLS است نه از کنترلر.

**وضعیت فعلی اپ:** کاملاً کار می‌کند. یک کارگاه پیش‌فرض (`id = 1`) توسط seed ساخته
می‌شود و همه‌ی داده به آن تعلق دارد.

---

## ۳. پشته‌ی فنی فعلی

### Backend

```
Node 26 · TypeScript 5.9 · Express 5 · pnpm 10.10.0

Prisma 7.9.1 + @prisma/adapter-pg + pg 8.22
PostgreSQL 17 (Docker)
Zod 4.4.3
helmet 8.3 · express-rate-limit 8.6
bcryptjs · jsonwebtoken · multer · sharp · jalaali-js
Jest 30 + ts-jest 29.4 + supertest
```

### Frontend

```
React 19 · Vite 8 · React Router 7 · Tailwind 4
Axios · react-hot-toast · react-to-print · jalaali-js · @heroicons/react
```

### ساختار پوشه‌ی backend

```
backend/
├── prisma/
│   ├── schema.prisma          ۱۷ مدل + ۳ enum
│   ├── seed.ts                کارگاه پیش‌فرض + نقش‌ها + سوپرادمین + تنظیمات + ۴ خدمت
│   └── migrations/
├── src/
│   ├── app.ts                 ساخت اپ Express (بدون listen)
│   ├── server.ts              entrypoint (listen)
│   ├── lib/prisma.ts          singleton کلاینت با driver adapter
│   ├── controllers/           ۱۴ کنترلر، همه TypeScript
│   ├── routes/                همه TypeScript جز index.js
│   ├── middleware/
│   │   ├── auth.js            ⚠️ هنوز CommonJS — در فاز ۳ بازنویسی می‌شود
│   │   ├── authorize.js       ⚠️ هنوز CommonJS
│   │   └── validate.ts        middleware اعتبارسنجی Zod
│   ├── schemas/               schemaهای Zod، یکی به‌ازای هر منبع
│   ├── utils/
│   │   ├── workspace.ts       workspaceIdOf(req)
│   │   ├── serialize.ts       تبدیل خروجی Prisma به شکل مورد انتظار فرانت
│   │   ├── errors.ts          errorMessage() + isUniqueConstraintError()
│   │   ├── dateRange.ts       todayRange, monthRange, endOfDay, dateFilter
│   │   ├── invoiceNumber.ts   buildInvoiceNumber, todayStamp
│   │   ├── invoiceTotals.ts   محاسبه‌ی تخفیف و مالیات (خالص، مستقل تست‌شده)
│   │   ├── payment.ts         paymentStatusFor()
│   │   └── persianToEnglish.js ⚠️ هنوز CommonJS
│   ├── types/request.ts       AuthUser, AuthenticatedRequest
│   ├── generated/prisma/      ⚠️ gitignore — با prisma generate ساخته می‌شود
│   └── __tests__/             ۲۲ فایل، ۲۷۶ تست
├── Dockerfile.dev
├── jest.config.js
├── jest.setup.ts              پین کردن مقادیر rate limit برای تست‌ها
├── tsconfig.json
└── tsconfig.build.json        تست‌ها را از dist حذف می‌کند
```

**چهار فایل `.js` باقی‌مانده** (بی‌ضرر، `allowJs` کامپایلشان می‌کند):
`middleware/auth.js`، `middleware/authorize.js`، `routes/index.js`،
`utils/persianToEnglish.js`. دو تای اول در فاز ۳ بازنویسی می‌شوند.

---

## ۴. تصمیمات معماری و دلیلشان

این بخش مهم‌ترین قسمت سند است. هر تصمیم دلیلی دارد که اگر ندانید، ممکن است تصادفاً
برش گردانید.

### تنانسی

**دیتابیس مشترک، اسکیمای مشترک.** بدون schema جدا یا دیتابیس جدا برای هر مستأجر.
ایزولاسیون از طریق ستون `workspaceId` روی هر جدول tenant-scoped.

**دو لایه‌ی دفاعی:** فیلتر در سطح اپلیکیشن (تمام‌شده) + RLS در سطح دیتابیس (تسک
۲.۳). هیچ‌کدام نباید حذف شوند — اگر یکی فراموش شود، دیگری هنوز جلوی نشت را می‌گیرد.

**مقیاس هدف:** حدود ۵۰۰ کارگاه، هر کدام تا ~۱۰۰۰ دستگاه. طراحی برای همین مقیاس، نه
بیشتر.

### مدل `Workspace`

```prisma
model Workspace {
  id        Int
  name      String            // یکتا نیست — دو کارگاه می‌توانند هم‌نام باشند
  status    WorkspaceStatus   // trial | active | expired
  expiresAt DateTime?         // هم پایان دوره‌ی آزمایشی، هم پایان اشتراک
}
```

**چرا slug ندارد:** اپ از یک دامنه‌ی مشترک سرو می‌شود، پس کارگاه همیشه از روی شناسه‌ی
داخل توکن شناسایی می‌شود. یک نام URL-safe هیچ مصرفی نداشت و فقط قید یکتایی و منطق
تولید اضافه می‌کرد — به‌خصوص که نام کارگاه فارسی است.

**چرا یک `expiresAt`:** سؤالی که همیشه از آن پرسیده می‌شود یکی است — «تا کی این
کارگاه می‌تواند بنویسد؟» جزئیات پلن در فاز ۸ روی مدل `Subscription` می‌نشیند.

### چه چیزی `workspaceId` می‌گیرد و چه چیزی نه

| جدول           | `workspaceId`؟ | دلیل                                                               |
| -------------- | -------------- | ------------------------------------------------------------------ |
| `roles`        | ❌             | سه نقش ثابت، داده‌ی مرجع مشترک بین همه‌ی کارگاه‌هاست               |
| بقیه‌ی ۱۷ جدول | ✅             | شامل جدول‌های فرزند مثل `SaleInvoiceItem` و `RepairInvoicePayment` |

**چرا فرزندها هم می‌گیرند:** با اینکه از طریق پدرشان هم محافظت می‌شوند، دادن ستون
مستقیم باعث می‌شود policyهای RLS در تسک ۲.۳ **ساده** بمانند. و policy ساده یعنی
احتمال اشتباه کمتر — و اشتباه اینجا یعنی نشت داده بین کارگاه‌ها.

### یکتایی

| ستون              | دامنه         | دلیل                                                     |
| ----------------- | ------------- | -------------------------------------------------------- |
| `User.username`   | **سراسری**    | نام کاربری = شماره تلفن. یک شماره = یک حساب در کل پلتفرم |
| `Item.code`       | per-workspace | یک کارگاه نباید کد کالا را برای بقیه رزرو کند            |
| `Category.name`   | per-workspace | همان                                                     |
| `*.invoiceNumber` | per-workspace | شماره‌گذاری هر کارگاه مستقل است                          |

### توکن

`workspaceId` **داخل JWT** است، نه از دیتابیس خوانده می‌شود. طبق `CLAUDE.md`:

> payload includes `userId`, `workspaceId`, `role` so middleware can authorize
> without an extra DB round-trip

`authenticate` توکن‌های بدون `workspaceId` را به‌عنوان منقضی رد می‌کند، وگرنه به
هندلری می‌رسیدند که برای workspace غایب خطا پرتاب می‌کند و کاربر ۵۰۰ می‌گیرد نه ۴۰۱.

**⚠️ هرگز `workspaceId` را از body یا query نخوانید.** فقط از توکن امضاشده.

### الگوی scope در کنترلرها

```typescript
import { workspaceIdOf } from "../utils/workspace";

// فهرست
const where = { workspaceId: workspaceIdOf(req), ...filters };

// تک‌رکورد — findUnique کار نمی‌کند چون شرط مرکب است
const row = await prisma.x.findFirst({
  where: { id, workspaceId: workspaceIdOf(req) },
});

// ایجاد
await prisma.x.create({ data: { ...data, workspaceId: workspaceIdOf(req) } });

// به‌روزرسانی — اول scope شده پیدا کن، بعد با id آپدیت کن
const existing = await prisma.x.findFirst({ where: { id, workspaceId } });
if (!existing) return res.status(404)...
await prisma.x.update({ where: { id }, data });

// حذف
await prisma.x.deleteMany({ where: { id, workspaceId } });

// داخل تراکنش — یک بار بیرون بخوان و پاس بده
const workspaceId = workspaceIdOf(req);   // req داخل tx در دسترس نیست
await prisma.$transaction(async (tx) => { ... });
```

`workspaceIdOf` عمداً **خطا پرتاب می‌کند** اگر workspace نباشد — چون غیابش یعنی باگ
در زنجیره‌ی احراز هویت، نه درخواستی که باید با داده‌ی بدون scope پاسخ داده شود.

### شکل پاسخ API

**ناسازگاری موجود که عمداً حفظ شده است:**

| endpoint                                              | شکل کلیدها   |
| ----------------------------------------------------- | ------------ |
| بیشتر API                                             | `snake_case` |
| `items` (اکثر متدها) و `categories`                   | `camelCase`  |
| `items/:id/transactions` و `items/search/for-invoice` | `snake_case` |

`serialize()` در `utils/serialize.ts` هست ولی **در کنترلرهای item و category استفاده
نمی‌شود** چون به snake_case تبدیل می‌کند و فرانت را می‌شکند. یکدست‌سازی کار جدایی است
که فرانت را هم لمس می‌کند.

### پول و اعداد

- مبالغ: `Decimal(18, 0)` — ریال عدد صحیح است و float برای پول خطای گرد کردن دارد
- نرخ‌ها: `Decimal(5, 2)`
- `avgPurchasePrice`: `Decimal(18, 2)` — میانگین اعشار دارد
- Prisma شیء `Decimal` برمی‌گرداند، در کنترلر با `.toNumber()` تبدیل می‌شود
- محاسبات تخفیف و مالیات صریح `Math.round` می‌شوند تا پاسخ با مقدار ذخیره‌شده یکی باشد

### تاریخ

- ذخیره: میلادی در دیتابیس
- API: رشته‌ی ISO کامل (`2026-01-15T10:30:00.000Z`)
- نمایش: تبدیل به جلالی در فرانت
- مرزهای «امروز» و «این ماه» در گزارش‌ها **UTC** هستند (رفتار قبلی `date('now')` در
  SQLite) — یعنی شمارنده‌ی روزانه ساعت ۳:۳۰ بامداد تهران صفر می‌شود
- `dateFilter()` تاریخ پایان بازه را به انتهای همان روز می‌برد، وگرنه فاکتورهای همان
  روز از گزارش حذف می‌شوند

---

## ۵. تسک‌های باقی‌مانده

### فاز ۲ — چندمستأجری (ادامه)

```markdown
- [ ] 2.3 Write the Postgres Row-Level Security policies: enable RLS on each
      tenant-scoped table, with a policy restricting rows to
      current_setting('app.workspace_id')
- [ ] 2.4 Add a Prisma Client Extension that sets app.workspace_id per request
      (SET LOCAL inside a transaction) so RLS is actually enforced, not just
      application-level filtering.
      ⚠️ Must be a Client Extension, not middleware — prisma.$use() is
      deprecated as of Prisma 6 and must not be used.
- [ ] 2.7 Isolation tests proving cross-tenant access is impossible: workspace
      A's token must not reach workspace B's rows, on every resource
- [ ] 2.8 Unify invoice numbering across all three invoice types, with the
      counter held on the Workspace row rather than derived from COUNT —
      atomic, per-workspace, and free of the race the current daily count has.
      Prefix comes from settings, as repair invoices already do.
      (Moved from 1.7: it needs Workspace to exist first.)
```

### فاز ۳ — بازنویسی احراز هویت

```markdown
- [ ] 3.1 "create workspace" sign-up: phone + password + workspace name →
      creates Workspace + User (super admin) in one transaction
- [ ] 3.2 Enforce workspace name and phone uniqueness (phone globally)
- [ ] 3.3 Access token (JWT, ~15 min, payload: userId, workspaceId, role)
- [ ] 3.4 RefreshToken model + issuance (~30 days, server-side, revocable),
      delivered as an httpOnly cookie
- [ ] 3.5 /auth/refresh endpoint (rotate refresh token, issue new access token)
- [ ] 3.6 Logout (revoke refresh token)
- [ ] 3.7 Update auth.js middleware for the new token shape — convert to
      TypeScript at the same time
- [ ] 3.8 Update authorize.js for per-workspace roles — also to TypeScript
- [ ] 3.9 Update the frontend AuthContext for the new login/refresh/logout flow
      and httpOnly cookie handling
- [ ] 3.10 Build the sign-up page (workspace name, phone, password)
- [ ] 3.11 Update the personnel UI so a workspace's super admin can create
      admin/technician users within their own workspace
```

**نکته:** فعلاً access token عمر ۷۲ ساعته دارد. کوتاه کردنش به ۱۵ دقیقه بدون refresh
token اپ را غیرقابل استفاده می‌کند، پس ۳.۳ و ۳.۴ باید با هم انجام شوند.

### فاز ۴ — Object Storage

```markdown
- [ ] 4.1 Provision ArvanCloud Object Storage bucket (manual)
- [ ] 4.2 Add an S3-compatible client (@aws-sdk/client-s3)
- [ ] 4.3 Replace multer disk storage with direct-to-object-storage upload for
      device images and settings/logo images
- [ ] 4.4 Update imageController / ImageUploader.jsx / ImageSlider.jsx to work
      with object storage URLs instead of local paths
- [ ] 4.5 Restore importDeviceImages.js (deleted in 1.5) against object storage
- [ ] 4.6 Add a MinIO service to docker-compose for local object storage
      testing (deferred from 0.6 — deliberately not added while nothing
      consumed it)
```

### فاز ۵ — بکاپ و خروجی داده

> **این فاز کاملاً بازنویسی شده است.** در SaaS، «بکاپ» به دو چیز با مالک، هدف و فرمت
> متفاوت تقسیم می‌شود.

|           | بکاپ پلتفرم                   | خروجی مشتری                |
| --------- | ----------------------------- | -------------------------- |
| مالک      | اپراتور (شما)                 | صاحب کارگاه                |
| هدف       | فاجعه: خرابی دیسک، حذف تصادفی | مالکیت داده، مهاجرت، آرشیو |
| دامنه     | کل دیتابیس                    | فقط یک `workspaceId`       |
| فرمت      | `pg_dump` باینری              | Excel + zip عکس‌ها         |
| در UI اپ؟ | **نه**                        | بله                        |
| بازیابی   | دستی، توسط اپراتور            | ندارد                      |

```markdown
- [ ] 5.1 Check whether ParsPack's managed Postgres offers automated backups.
      If it does, configure and document it rather than building our own.
- [ ] 5.2 (only if 5.1 says no) Scheduled pg_dump on the database server,
      compressed and encrypted, shipped to ArvanCloud. Runs as a cron on the
      host — deliberately not an app feature, so a broken app can't take the
      backups with it. Retention: 7 daily, 4 weekly, 3 monthly.
- [ ] 5.3 Per-workspace data export: customers, devices, items and invoices as
      an Excel workbook plus a zip of that workspace's device images.
      Generated on demand, scoped by workspaceId, never a SQL dump — a dump is
      unreadable to a workshop owner and risks leaking schema or other
      tenants' rows.
- [ ] 5.4 Rework BackupList.jsx into an export page: request an export, see
      past exports, download. No restore button.
- [ ] 5.5 Write an operator runbook for restoring a single workspace from a
      platform dump. A manual, support-mediated procedure rather than a
      feature — selectively replacing one tenant's rows in a shared schema
      while others are live is too dangerous to expose.
- [ ] 5.6 Fineti import: restore importFromExcel.js (deleted in 1.5) with a
      --workspace-id parameter, to onboard a customer migrating from Fineti.
      Stays an operator-run script; wrap it in an admin UI only if it turns
      out to be frequent.
- [ ] 5.7 Operator recovery: a documented procedure for restoring access to a
      workspace whose owner is locked out. The old resetAdmin script is not
      the basis for this: it only ever knew one hardcoded username, which
      stops existing once each workspace has its own super admin. Password
      self-service for customers is task 8.6 (SMS OTP).
```

### فاز ۶ — تست

```markdown
- [ ] 6.1 Unit tests for all controllers (mostly done alongside 1.3 — audit
      for gaps rather than starting over)
- [ ] 6.2 Unit tests for services/business logic (invoiceTotals is done)
- [ ] 6.3 Isolation and auth tests (see 2.7)
- [ ] 6.4 Integration tests against a real test Postgres database — the only
      way to verify RLS and transaction atomicity, which mocked tests can't
```

### فاز ۷ — استقرار

```markdown
- [ ] 7.1 Production Dockerfile for backend (must include prisma generate)
- [ ] 7.2 Production Dockerfile for frontend (build + serve via Nginx)
- [ ] 7.3 docker-compose.prod.yml (no Postgres — that's a separate server)
- [ ] 7.4 Reverse proxy (Nginx or Caddy) with TLS for app.dofixo.ir
- [ ] 7.5 Provision ParsPack app server and database server (manual)
- [ ] 7.6 First manual deployment
      ⚠️ Must not happen before 5.1/5.2 — a system holding real customer data
      with no backups is an incident waiting to happen
- [ ] 7.7 A GitHub Actions workflow that runs the test suite on push
```

### فاز ۸ — اشتراک و پرداخت

```markdown
- [ ] 8.1 Subscription model (workspace, plan, status, startedAt, expiresAt)
- [ ] 8.2 One-month free trial on workspace creation (seed already does this)
- [ ] 8.3 Read-only enforcement once a subscription lapses (middleware that
      blocks writes but allows reads)
- [ ] 8.4 Zibal payment gateway (checkout, callback/webhook, plan activation)
- [ ] 8.5 Plan selection UI (monthly / 3-month / 6-month / annual — same
      features, different price and duration)
- [ ] 8.6 Kavenegar SMS for phone verification (sign-up OTP, password reset)
```

### فاز ۹ — یکدست‌سازی رابط کاربری

> عمداً تا بعد از تثبیت مدل داده و احراز هویت نگه داشته شده، تا اگر صفحه‌ای شکست، یک
> علت مشخص داشته باشد نه سه تا.

```markdown
- [ ] 9.1 Fold the stock report into the items page as a filter and retire the
      separate page — it is the item list with one condition applied
- [ ] 9.2 Move the profit summary onto the dashboard and retire the profit
      report page, where it currently goes unseen
- [ ] 9.3 Let the purchase invoice form create a complete item inline. It
      creates a reduced one today, so the same catalogue has two entry points
      with different results
- [ ] 9.4 Decide how deleting a purchase invoice should affect
      avg_purchase_price. It currently returns the stock but leaves the
      average untouched, so it drifts — a weighted average can't be reversed
      from the invoice alone. Either recompute from that item's full purchase
      history, or stop allowing deletion and record a return invoice instead,
      which is what accounting practice would do.
```

---

## ۶. بدهی‌های فنی و ریسک‌های شناخته‌شده

هیچ‌کدام از این‌ها باگ تصادفی نیستند — همه آگاهانه پذیرفته شده‌اند.

### ۱. شماره‌ی فاکتور شرایط مسابقه دارد

روش فعلی: «تعداد فاکتورهای امروز + ۱». دو درخواست همزمان می‌توانند یک شماره بگیرند.
داخل تراکنش است که پنجره را باریک می‌کند، و چون `invoiceNumber` قید یکتا دارد، دومی
با خطا رد می‌شود نه اینکه شماره‌ی تکراری بسازد. **رفع کامل در تسک ۲.۸** با شمارنده روی
ردیف `Workspace`.

### ۲. سه قالب شماره‌گذاری موازی

| مبدأ         | قالب                                                     |
| ------------ | -------------------------------------------------------- |
| فاکتور خرید  | `PUR-20260806-001`                                       |
| فاکتور فروش  | `SAL-20260806-001`                                       |
| فاکتور تعمیر | `INV-20260806-0001` (پیشوند از `settings.invoicePrefix`) |

فقط فاکتور تعمیر پیشوند را از تنظیمات می‌خواند. **تسک ۲.۸** هر سه را یکدست می‌کند.

### ۳. حذف فاکتور خرید `avgPurchasePrice` را اصلاح نمی‌کند

موجودی برمی‌گردد ولی میانگین قیمت نادرست می‌ماند، چون میانگین وزنی از روی خودِ فاکتور
برگشت‌پذیر نیست. رفتار قبلی هم همین بود. **تسک ۹.۴**.

### ۴. بهای تمام‌شده در گزارش سود، قیمت **فعلی** است

`avgPurchasePrice` لحظه‌ی گزارش استفاده می‌شود، نه قیمت زمان فروش. یعنی خرید مجدد با
قیمت متفاوت، حاشیه‌ی سود فروش‌های گذشته را بازنویسی می‌کند. ضعف حسابداری واقعی است ولی
رفتار موجود است.

### ۵. گزارش سود اقلام دلخواه را نادیده می‌گیرد

اقلام فاکتور فروش بدون `item_id` (آیتم دلخواه) بهای تمام‌شده‌ی معلومی ندارند و از
محاسبه حذف می‌شوند. JOIN داخلی قبلی هم همین کار را می‌کرد.

### ۶. `repair_invoice_items.itemId` عمداً رابطه نیست

پلی‌مورفیک است: برای `item_type === "inventory"` به جدول `items` و برای `"service"` به
جدول `services` اشاره می‌کند. SQLite این FK را اعلام کرده بود ولی هرگز اعمال نمی‌کرد
(pragma خاموش بود). اگر رابطه‌اش کنیم، ثبت فاکتور با قلم خدمت می‌شکند.

### ۷. `personnel_id` روی `devices` عملاً بلااستفاده است

همیشه `null` نوشته می‌شود و هرگز خوانده نمی‌شود. تخصیص تکنسین از
`device_assignments` می‌آید. کاندید حذف.

### ۸. سه ستون تخفیف در `SaleInvoiceItem` بلااستفاده‌اند

`discountType`، `discountValue`، `discountAmount` در اسکیما هستند ولی فرانت هیچ‌وقت
نمی‌فرستدشان و کنترلر نمی‌نویسدشان.

### ۹. `express.static` روی `/uploads` در پروداکشن نمی‌سازد

مسیر `path.join(__dirname, "uploads")` در dev به `src/uploads` و در بیلد به
`dist/uploads` اشاره می‌کند که وجود ندارد (`tsc` تصاویر را کپی نمی‌کند). **فاز ۴** کل
این مسیر را با object storage جایگزین می‌کند.

### ۱۰. `dist` خودش را پاک نمی‌کند

`tsc` فایل‌های قدیمی را حذف نمی‌کند. اگر فایلی حذف یا جابه‌جا شود، نسخه‌ی کهنه‌اش در
`dist` می‌ماند. در فاز ۷ با یک اسکریپت `prebuild` حل می‌شود.

### ۱۱. `pnpm-workspace.yaml` داخل `backend/` است

دو اپ عملاً دو پروژه‌ی pnpm مستقل با lockfile جدا هستند، نه یک workspace واقعی. کار
می‌کند ولی برای lint کل پروژه باید دو بار دستور زد.

---

## ۷. قواعد کاری (`RULES.md`)

سه فایل باید قبل از شروع کار خوانده شوند: `CLAUDE.md`، `Roadmap.md`، `RULES.md`.

### خلاصه‌ی مهم‌ترین قواعد

| #   | قاعده                                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ۱   | **یک تسک شماره‌دار در هر نشست.** قبل از شروع، دامنه و فایل‌هایی که لمس می‌شوند را بگو                                                                                                         |
| ۲   | **هرگز بدون تأیید صریح کامیت نکن.** خلاصه بده، منتظر «تایید» بمان                                                                                                                             |
| ۳   | **هر تسکی که منطق backend را لمس می‌کند تست لازم دارد.** اگر ندارد، صریح بگو چرا                                                                                                              |
| ۴   | Conventional Commits: `type(scope): description` — کامیت‌های کوچک و متمرکز                                                                                                                    |
| ۵   | روی `feature/multi-tenant-migration` بمان، بدون اجازه merge نکن                                                                                                                               |
| ۶   | الگوی موجود را رعایت کن · کد مرده نگه ندار · همه‌ی ورودی‌ها را با Zod اعتبارسنجی کن · **هرگز `workspaceId` یا `role` را از کلاینت نگیر** · کامنت «چرا» را توضیح دهد نه «چه» · بدون catch خالی |
| ۷   | چک‌لیست امنیتی: `workspaceId` + RLS، بررسی نقش، اعتبارسنجی فایل، متغیرهای محیطی در `.env.example`                                                                                             |
| ۸   | بعد از تکمیل تسک، `Roadmap.md` را به‌روز کن. اگر `CLAUDE.md` کهنه شد، در همان کامیت اصلاحش کن                                                                                                 |
| ۹   | ساختار ارائه: چه شد → نتیجه‌ی تست → ریسک‌ها → منتظر تأیید                                                                                                                                     |
| ۱۰  | **دستورات شبکه‌ای را خودت اجرا نکن.** به‌خاطر تداخل VPN، `pnpm add`، `docker pull` و مشابه را در بلوک کد بده تا کاربر خودش اجرا کند                                                           |

### دو قاعده‌ای که در مسیر اضافه شد

```markdown
- After installing any dependency on the host, the affected container must be
  rebuilt with `docker compose up -d --build --renew-anon-volumes <service>`.
  A plain restart or even `--build` alone won't do: the anonymous volume that
  shadows /app/node_modules survives container recreation.

- After deleting or renaming a source file that the running container has
  loaded (e.g. replacing a .js controller with a .ts one), restart the service
  with `docker compose restart backend`. tsx watch's module resolution can get
  stuck on the removed path and won't recover on its own — the resulting error
  usually points at the new file and is misleading.
```

---

## ۸. دستورات روزمره

### راه‌اندازی از صفر

```bash
cp .env.example .env                    # ریشه — متغیرهای docker-compose
cp backend/.env.example backend/.env    # سپس JWT_SECRET و SEED_ADMIN_PASSWORD را پر کن

docker compose up -d --build
cd backend && pnpm exec prisma migrate dev && pnpm exec prisma generate
cd backend && pnpm seed
```

### چرخه‌ی توسعه

```bash
cd backend && pnpm test          # ۲۷۶ تست
cd backend && pnpm lint          # باید ۰ error باشد
cd backend && pnpm format
cd backend && pnpm build
cd frontend && pnpm lint

docker compose logs backend --tail 30
docker compose restart backend
```

### دیتابیس

```bash
# migration + generate با هم
cd backend && pnpm migrate

# بررسی ساختار
docker compose exec postgres psql -U dofixo -d dofixo_dev -c "\dt"
docker compose exec postgres psql -U dofixo -d dofixo_dev -c "\d customers"

# پاک کردن کامل و شروع دوباره
docker compose down -v && docker compose up -d postgres
cd backend && pnpm exec prisma migrate dev && pnpm seed
```

### متغیرهای محیطی

`backend/.env`:

```dotenv
DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_dev?schema=public
PORT=5001
JWT_SECRET=<تولید با crypto.randomBytes(32).toString('hex')>
TRUST_PROXY=0
SEED_ADMIN_PASSWORD=<رمز اولیه سوپرادمین>
RATE_LIMIT_API=1000        # 0 برای خاموش کردن حین تست
RATE_LIMIT_LOGIN=10
```

---

## ۹. دام‌هایی که در مسیر به آن‌ها خوردیم

این بخش را حتماً بخوانید — هر کدام یک ساعت وقت گرفت.

### `127.0.0.1` نه `localhost`

روی Arch Linux، `localhost` اول به `::1` حل می‌شود و مسیر IPv6 به پورت منتشرشده‌ی
کانتینر جواب نمی‌دهد. Prisma با `P1001` شکست می‌خورد در حالی که `psql` از داخل
کانتینر کار می‌کند.

### `prisma generate` بعد از هر `migrate dev`

در Prisma 7 برخلاف نسخه‌ی ۶، `migrate dev` دیگر خودکار کلاینت را تولید نمی‌کند. اسکریپت
`pnpm migrate` هر دو را با هم اجرا می‌کند.

### Prisma 7 به driver adapter نیاز دارد

```typescript
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

بدون آن با `PrismaClientInitializationError` شکست می‌خورد.

### کاراکتر `<` در کپی از چت گم می‌شود

هنگام کپی کد از رابط چت، `<` در جنریک‌ها (`z.infer<...>`، `Prisma.XGetPayload<...>`)
گاهی بلعیده می‌شود و خطاهای نحوی گیج‌کننده تولید می‌کند. بعد از هر کپی:

```bash
grep -n "z.infer\|GetPayload\|satisfies" backend/src/schemas/*.ts
```

یا مطمئن‌تر: فایل را با `cat > path << 'EOF'` بسازید.

### `tsx watch` بعد از حذف فایل گیر می‌کند

خطایی می‌دهد که به فایل جدید اشاره می‌کند ولی گمراه‌کننده است. `docker compose restart
backend` حلش می‌کند.

### volume ناشناس `node_modules` پابرجا می‌ماند

بعد از `pnpm add` روی هاست، `docker compose restart` یا حتی `--build` تنها کافی نیست.
حتماً `--renew-anon-volumes` لازم است.

### `as const` با تایپ‌های Prisma کار نمی‌کند

آرایه‌ی `readonly` می‌سازد که فیلترهای Prisma قبول نمی‌کنند. به‌جایش تایپ صریح بدهید:

```typescript
const issuedOrPaid: Prisma.RepairInvoiceWhereInput = { status: { in: [...] } };
```

### `z.coerce.date()` با رشته‌ی خالی

فیلدهای تاریخ هنگام پاک شدن `""` می‌فرستند که به `Invalid Date` تبدیل می‌شود. و `null`
به **اول ژانویه ۱۹۷۰** تبدیل می‌شود. الگوی درست:

```typescript
z.preprocess((value) => (value === "" ? undefined : value), z.coerce.date().optional());
```

### تست‌ها نباید به `.env` توسعه‌دهنده وابسته باشند

`jest.setup.ts` مقادیر rate limit را پین می‌کند، چون ممکن است توسعه‌دهنده آن‌ها را برای
تست دستی صفر کرده باشد.

---

## ۱۰. باگ‌هایی که در مسیر مهاجرت پیدا و رفع شدند

فهرست کامل، چون نشان می‌دهد چه چیزهایی ممکن است هنوز جای دیگری پنهان باشند.

| باگ                                  | محل                                  | اثر                                          |
| ------------------------------------ | ------------------------------------ | -------------------------------------------- |
| نشت موجودی در ویرایش فاکتور فروش     | `saleInvoiceController.update`       | هر ویرایش ناموفق موجودی را دائمی بالا می‌برد |
| `reference_id` همیشه `null`          | هر سه کنترلر فاکتور                  | تاریخچه‌ی کالا شماره فاکتور نشان نمی‌داد     |
| خدمات به کالای بی‌ربط وصل            | `repairInvoiceController.getById`    | JOIN بی‌قید روی `item_id` پلی‌مورفیک         |
| جابه‌جایی ستون در نگاشت              | `customerController.getDevices`      | `created_at` به‌عنوان `image_path`           |
| فاکتور بدون قلم غیرقابل حذف          | خرید و فروش                          | اقلام را می‌خواند نه فاکتور را               |
| فیلتر `role` نادیده گرفته می‌شد      | `personnelController.getAll`         | فهرست تکنسین‌ها مدیران را هم نشان می‌داد     |
| پاسخ `update` همیشه ناقص             | `saleInvoiceController`              | `getById` با `res` جعلی صدا زده می‌شد        |
| نام تکراری ۵۰۰ می‌داد                | `categoryController`                 | تطبیق رشته‌ی خطای SQLite در Postgres         |
| رمز در لاگ                           | `authController`                     | ۲۰ کاراکتر اول هش bcrypt چاپ می‌شد           |
| ساخت جدول در زمان اجرا               | `serviceController.getAll`           | هر درخواست `CREATE TABLE IF NOT EXISTS`      |
| `quickSale` به قیمت خرید             | `itemController`                     | گزارش سود حاشیه‌ی صفر نشان می‌داد            |
| سوپرادمین می‌توانست خودش را تنزل دهد | `personnelController.update`         | راه برگشتی نبود                              |
| **۹ کوئری از ۱۷ بدون scope**         | `reportController.getDashboardStats` | داشبورد یک کارگاه ارقام همه را نشان می‌داد   |

مورد آخر را تست جامعی گرفت که همه‌ی کوئری‌های داشبورد را یکجا بررسی می‌کند. الگوی
ارزشمندی است که در تسک ۲.۷ باید گسترش پیدا کند.

---

## ۱۱. وضعیت تست‌ها

```
۲۲ فایل · ۲۷۶ تست · همه پاس
```

| فایل                     | تعداد | پوشش                                     |
| ------------------------ | ----- | ---------------------------------------- |
| `serialize.test.ts`      | ۶     | تبدیل snake_case، Decimal، BigInt، تاریخ |
| `validate.test.ts`       | ۸     | middleware Zod                           |
| `schemas.test.ts`        | ۵     | تاریخ‌های اختیاری، سقف صفحه‌بندی         |
| `invoiceTotals.test.ts`  | ۱۰    | محاسبه‌ی تخفیف و مالیات                  |
| `health.test.ts`         | ۴     | بوت اپ، ۵۰۳ هنگام قطعی دیتابیس           |
| `security.test.ts`       | ۳     | هدرهای helmet، rate limit                |
| `customerRoutes.test.ts` | ۲     | سیم‌کشی روت                              |
| `authController.test.ts` | ۸     | لاگین، توکن، تغییر رمز                   |
| ۱۳ فایل کنترلر           | ~۲۳۰  | CRUD، scope، منطق کسب‌وکار               |

**آنچه تست‌های واحد نمی‌سنجند:** اتمی بودن واقعی تراکنش‌ها و RLS. هر دو به تست
یکپارچگی با دیتابیس واقعی نیاز دارند — **تسک ۶.۴**.

---

## ۱۲. توصیه برای شروع نشست بعدی

۱. سه فایل `CLAUDE.md`، `Roadmap.md` و `RULES.md` را بفرست
۲. این سند را بفرست
۳. بگو: «تسک ۲.۳ را شروع کنیم»
۴. فایل‌هایی که احتمالاً خواسته می‌شوند: `schema.prisma`، `lib/prisma.ts`،
`middleware/auth.js`

### درباره‌ی تسک ۲.۳ و ۲.۴ که بعدی‌اند

این دو با هم معنا دارند و نباید جدا شوند:

- **۲.۳** سیاست‌های RLS را می‌نویسد: روی هر جدول tenant-scoped، policy ای که ردیف‌ها
  را به `current_setting('app.workspace_id')` محدود کند
- **۲.۴** یک **Prisma Client Extension** می‌نویسد که قبل از هر کوئری،
  `SET LOCAL app.workspace_id` را داخل تراکنش اجرا کند

⚠️ **حتماً Client Extension، نه middleware.** `prisma.$use()` از Prisma 6 منسوخ شده و
نباید استفاده شود.

⚠️ **بعد از روشن کردن RLS، اپ ممکن است ساکت از کار بیفتد** — هر کوئری بدون context
هیچ ردیفی برنمی‌گرداند، بدون پیام خطا. اگر چنین شد، اول بررسی کنید که extension واقعاً
اجرا می‌شود.

⚠️ **کاربر مالک دیتابیس (`dofixo`) به‌طور پیش‌فرض RLS را دور می‌زند.** برای اینکه
policyها واقعاً اعمال شوند، یا باید `FORCE ROW LEVEL SECURITY` روی جدول‌ها فعال شود، یا
اپ با یک کاربر غیرمالک وصل شود. این نکته را در طراحی ۲.۳ حتماً لحاظ کنید — وگرنه
policyها نوشته می‌شوند ولی هیچ اثری ندارند و تست‌های ۲.۷ به‌غلط سبز می‌شوند.
