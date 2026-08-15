# Dofixo — سند انتقال پروژه

> این سند برای ادامه‌ی کار مهاجرت Dofixo از تک‌مستأجری به SaaS در یک نشست جدید نوشته
> شده است. همه‌چیزی که برای ادامه لازم است اینجاست: وضعیت فعلی، تصمیمات گرفته‌شده و
> دلیلشان، تسک‌های باقی‌مانده، بدهی‌های فنی، و دام‌هایی که در مسیر به آن‌ها خوردیم.
>
> **تاریخ آخرین به‌روزرسانی:** پایان فاز ۴ (object storage)

---

## ۱. پروژه در یک نگاه

**Dofixo** یک نرم‌افزار مدیریت تعمیرگاه است برای کارگاه‌های کوچک تعمیر (لوازم خانگی،
موبایل، لپ‌تاپ) در ایران. دستگاه‌های ورودی، مشتریان، پرسنل، انبار و فاکتورهای
خرید/فروش/تعمیر را مدیریت می‌کند و سود و زیان را دنبال می‌کند.

| مورد       | مقدار                                                             |
| ---------- | ----------------------------------------------------------------- |
| مخزن       | `/Programming/Code/Dofixo` (مونوریپو: `backend/` و `frontend/`)   |
| برنچ فعال  | `feature/multi-tenant-migration`                                  |
| دامنه‌ی اپ | `app.dofixo.ir` — **دامنه‌ی مشترک، بدون زیردامنه برای هر مستأجر** |
| سایت معرفی | `dofixo.ir` (Astro، مخزن جدا، خارج از این کار)                    |
| زبان رابط  | فارسی، تاریخ جلالی                                                |
| واحد پول   | ریال                                                              |

**هدف اصلی:** تبدیل زیرساخت به SaaS **بدون تغییر مجموعه‌ی ویژگی‌های موجود**.

---

## ۲. وضعیت فعلی

| فاز                                            | وضعیت          |
| ---------------------------------------------- | -------------- |
| ۰ — زیرساخت و ابزار                            | ✅ کامل        |
| ۱ — مهاجرت SQLite → PostgreSQL                 | ✅ کامل        |
| ۲ — چندمستأجری (RLS، ایزولاسیون، شماره فاکتور) | ✅ کامل        |
| ۳ — بازنویسی احراز هویت                        | ✅ کامل        |
| ۴ — Object Storage                             | ✅ کامل        |
| ۶.۴ — تست یکپارچگی با دیتابیس واقعی            | ✅ (همراه ۲.۷) |

**وضعیت اپ:** کاملاً کار می‌کند. ثبت‌نام خودکار، session با کوکی refresh، ایزولاسیون
اثبات‌شده، و عکس‌ها روی object storage.

### فاز ۴ — چه چیزی ساخته شد

| تسک                 | خلاصه                                                             |
| ------------------- | ----------------------------------------------------------------- |
| 4.1 صندوقچه         | `reza-app-test-1`، خصوصی، منطقه‌ی سیمین (`s3.ir-thr-at1`)         |
| 4.2 کلاینت S3       | `@aws-sdk/client-s3` + `s3-request-presigner` در `lib/storage.ts` |
| 4.3 جایگزینی multer | حافظه → webp → object storage. هیچ‌چیز روی دیسک نمی‌ماند          |
| 4.4 فرانت           | چهار کامپوننت روی URL امضاشده                                     |
| 4.5 اسکریپت import  | ↪ منتقل شد به **۵.۶**                                             |
| 4.6 MinIO           | ⬜ کنار گذاشته شد (دلیلش پایین)                                   |

**چرا MinIO کنار گذاشته شد:** با داشتن یک صندوقچه‌ی واقعی، توسعه‌ی مستقیم روی Arvan
جلوی این را می‌گیرد که تفاوت‌های ریز سازگاری S3 را روز استقرار کشف کنیم. اگر روزی
کار آفلاین لازم شد، برمی‌گردد.

---

## ۳. پشته‌ی فنی

### Backend

```
Node 26 · TypeScript 5.9 · Express 5 · pnpm 10.10.0

Prisma 7.9.1 + @prisma/adapter-pg + pg 8.22 · PostgreSQL 17 (Docker)
Zod 4.4.3 · helmet 8.3 · express-rate-limit 8.6 · cookie-parser 1.4
@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
bcryptjs · jsonwebtoken · multer · sharp · jalaali-js
Jest 30 + ts-jest 29.4 + supertest
```

### Frontend

```
React 19 · Vite 8 · React Router 7 · Tailwind 4
Axios · react-hot-toast · react-to-print · jalaali-js · @heroicons/react
```

⚠️ فرانت هنوز JavaScript است و **هیچ زیرساخت تستی ندارد**.

### ساختار پوشه‌ی backend

```
backend/
├── prisma/
│   ├── schema.prisma          ۲۱ مدل + ۳ enum
│   ├── seed.ts                نقش‌ها + یک کارگاه از مسیر ثبت‌نام
│   ├── rls-check.sql          تأیید دستی سیاست‌های RLS
│   └── migrations/            ۶ مهاجرت
├── src/
│   ├── app.ts · server.ts
│   ├── lib/
│   │   ├── prisma.ts          کلاینت + extension + دو helper تراکنش
│   │   ├── storage.ts         تنها جایی که SDK را می‌شناسد
│   │   └── workspaceContext.ts  AsyncLocalStorage + restoreWorkspaceContext
│   ├── controllers/           ۱۴ کنترلر
│   ├── routes/                همه TypeScript جز index.js
│   ├── middleware/
│   │   ├── auth.ts · authorize.ts · requestContext.ts · validate.ts
│   ├── schemas/
│   ├── utils/
│   │   ├── workspace.ts · refreshToken.ts · newWorkspace.ts
│   │   ├── invoiceNumber.ts · serialize.ts · errors.ts
│   │   ├── dateRange.ts · invoiceTotals.ts · payment.ts
│   │   └── persianToEnglish.js ⚠️ هنوز CommonJS
│   ├── types/request.ts       AuthUser + declare global روی Express.Request
│   └── __tests__/             ۲۹ فایل (۳۷۱ تست) + integration/ (۶ فایل، ۷۰ تست)
├── jest.config.js · jest.setup.ts
└── jest.integration.config.js · .globalSetup.ts · .setup.ts
```

**دو فایل `.js` باقی‌مانده:** `routes/index.js` و `utils/persianToEnglish.js`.

### مهاجرت‌ها

| نام                               | کارش                                             |
| --------------------------------- | ------------------------------------------------ |
| `20260809073159_init_multitenant` | اسکیمای اولیه با `workspaceId`                   |
| `20260810095035_invoice_counters` | سه ستون شمارنده روی `workspaces`                 |
| `20260810120000_rls_policies`     | نقش `dofixo_app` + policyها + grantها            |
| `20260810140000_login_lookup`     | `app_login_lookup` (دریچه‌ی ۱)                   |
| `20260810150000_create_workspace` | `app_create_workspace` (دریچه‌ی ۲)               |
| `20260812074748_refresh_tokens`   | جدول + policy + `app_refresh_lookup` (دریچه‌ی ۳) |

⚠️ **ترتیب اجرا الفبایی است، نه زمانی.** هر مهاجرت دستی جدید باید timestamp بزرگ‌تر
از `20260812074748` بگیرد.

---

## ۴. تصمیمات معماری و دلیلشان

مهم‌ترین بخش سند. هر تصمیم دلیلی دارد که اگر ندانید، ممکن است تصادفاً برش گردانید.

### تنانسی

**دیتابیس مشترک، اسکیمای مشترک.** ایزولاسیون از طریق `workspaceId` روی هر جدول
tenant-scoped. **دو لایه:** فیلتر اپلیکیشنی + RLS. هیچ‌کدام حذف نشود. مقیاس هدف:
~۵۰۰ کارگاه، هر کدام تا ~۱۰۰۰ دستگاه.

### دو اتصال دیتابیس، عمداً

| متغیر              | نقش          | مصرف                 |
| ------------------ | ------------ | -------------------- |
| `DATABASE_URL`     | `dofixo`     | فقط migration و seed |
| `DATABASE_URL_APP` | `dofixo_app` | اپ در حال اجرا       |

در Postgres مالک جدول RLS را **دور می‌زند**. `dofixo_app` مالک هیچ جدولی نیست و فقط
DML دارد. ⚠️ `lib/prisma.ts` عمداً **fallback ندارد**.

### زنجیره‌ی `app.workspace_id`

```
requestContext (middleware)  →  AsyncLocalStorage باز می‌شود (خالی)
authenticate                 →  setContextWorkspaceId(payload.workspaceId)
Prisma extension             →  currentWorkspaceId() را می‌خواند
                             →  set_config('app.workspace_id', id, TRUE)
```

**چرا AsyncLocalStorage:** Prisma خبری از `req` ندارد، و متغیر سطح ماژول بین
درخواست‌های همزمان نشت می‌کند.

**اگر context نباشد، extension خطا پرتاب می‌کند** — نه اینکه بگذارد RLS ساکت صفر ردیف
برگرداند.

### ⚠️ multer زنجیره را قطع می‌کند

`AsyncLocalStorage` از promise عبور می‌کند ولی **از رویداد stream نه**. multer بدنه‌ی
`multipart` را با busboy می‌خواند و هندلر را از داخل یک event صدا می‌زند — نتیجه اینکه
`req.user` سالم می‌ماند ولی **هیچ store ای وجود ندارد**، نه اینکه store خالی باشد.

`restoreWorkspaceContext` این را حل می‌کند و باید **بعد از** multer روی هر مسیری که
فایل می‌پذیرد بنشیند:

```typescript
router.post(
  "/",
  validate({ params: idParamSchema }),
  upload.array("images", 20),
  restoreWorkspaceContext, // ← بعد از multer، نه قبلش
  uploadImages,
);
```

چون store دیگر وجود ندارد، این تابع `storage.run(...)` می‌زند نه
`setContextWorkspaceId(...)` — نمی‌شود در چیزی نوشت که نیست.

### دو helper تراکنش

```typescript
// ❌ هرگز
await prisma.$transaction(async (tx) => { ... });

// ✅ تراکنش معمولی
await runInWorkspaceTransaction(workspaceId, async (tx) => { ... });

// ✅ ثبت‌نام: کارگاه هنوز وجود ندارد
await runInNewWorkspaceTransaction(name, async (tx, workspaceId) => { ... });
```

عملیات داخل تراکنش دوباره وارد extension می‌شود و تراکنش دومی روی اتصال دوم باز
می‌کند؛ `set_config` آنجا می‌نشیند و کار اصلی بدون context ادامه می‌دهد.

### سه دریچه‌ی `SECURITY DEFINER`

هر سه وجود دارند چون فراخوان هنوز workspace ندارد. هیچ‌کدام نباید گشاد شوند.

| تابع                   | کِی                         | چه برمی‌گرداند                         |
| ---------------------- | --------------------------- | -------------------------------------- |
| `app_login_lookup`     | ورود، قبل از احراز          | id، workspace، هش رمز، وضعیت فعال      |
| `app_create_workspace` | ثبت‌نام، کارگاه هنوز نیست   | فقط `id` کارگاه تازه                   |
| `app_refresh_lookup`   | refresh، access token منقضی | id ردیف، user، workspace، انقضا، ابطال |

⚠️ هر سه `SET search_path = public` دارند و `EXECUTE` از `PUBLIC` گرفته شده.

### Object storage

**صندوقچه‌ی خصوصی + presigned URL.** عکس‌ها با URL کوتاه‌عمر (۱۵ دقیقه) سرو می‌شوند
که به‌ازای هر درخواست امضا می‌شود، **بعد از** اینکه ردیف با workspace فیلتر شد.

**چرا خصوصی نه عمومی:** object storage هیچ RLS ای ندارد. صندوقچه‌ی عمومی یعنی
ایزولاسیونی که کل فاز ۲ برایش صرف شد، از یک طرف باز بماند. عکس دستگاه مشتری هم
داده‌ی شخصی است — شماره سریال، وضعیت خرابی، گاهی محتویات صفحه.

**کلیدها مستأجر را حمل می‌کنند:**

```
workspaces/{id}/devices/{deviceId}/{uuid}.webp
workspaces/{id}/settings/{type}-{uuid}.webp
```

آن پیشوند و بررسی اپلیکیشن، **تنها** چیزهایی هستند که یک کارگاه را از اشیای دیگری
دور نگه می‌دارند.

**`filepath` در دیتابیس همان کلید کامل است** و مستقیم امضا می‌شود، نه اینکه از
`workspaceId` و `deviceId` بازسازی شود — تا اگر روزی ساختار کلید عوض شد، عکس‌های
قدیمی پیدا بمانند.

**`lib/storage.ts` تنها ماژولی است که SDK را می‌شناسد.** کنترلرها از آن کلید و URL
می‌خواهند.

**خطای حذف لاگ می‌شود، پرتاب نمی‌شود:** یک شیء یتیم چند کیلوبایت هدر می‌دهد، در حالی
که خطای منتشرشده ردیفی باقی می‌گذارد که کاربر نمی‌تواند حذفش کند.

**ترتیب حذف:** اول شیء، بعد ردیف. ترتیب برعکس ریسک ردیفی را دارد که به شیء ناموجود
اشاره می‌کند — یعنی عکس شکسته که کاربر می‌بیند.

**تبدیل به webp برای همه:** عکس دستگاه و لوگو و مهر و امضا. webp شفافیت را نگه
می‌دارد، پس مهر با پس‌زمینه‌ی شفاف سالم می‌ماند.

**مقدارهای قبل از فاز ۴** (مثل `/uploads/settings/logo-1.png`) کلید نیستند و امضا
نمی‌شوند؛ `null` برمی‌گردند تا به‌جای خطا، عکس غایب دیده شود.

### احراز هویت

**access token:** JWT، ۱۵ دقیقه، در **حافظه‌ی صفحه** نه localStorage.

**refresh token:** ۳۰ روز، راز تصادفی ۳۲ بایتی — **نه JWT**، چون JWT وسوسه‌ی
اعتبارسنجی بدون دیتابیس را می‌آورد و ابطال‌پذیری را از بین می‌برد. در دیتابیس فقط هش
SHA-256 (نه bcrypt: راز پرآنتروپی دیکشنری ندارد و bcrypt هر refresh را کند می‌کند).

**کوکی:** `httpOnly`، `SameSite=Strict`، `Path=/api/auth`، `Secure` فقط در پروداکشن.

**چرخش با تشخیص سرقت:** هر refresh توکن قبلی را باطل می‌کند. ارائه‌ی دوباره‌ی توکن
**باطل‌شده** یعنی نسخه‌ای در گردش است، پس همه‌ی session های آن کاربر بسته می‌شوند.

**logout حذف می‌کند، نه ابطال.** ابطال سیگنال سرقت است؛ پایان دادن به session خودت
سیگنالی ندارد. اگر باطل می‌کرد، یک تب بازمانده کامپیوتر مغازه را هم بیرون می‌انداخت.

**سمت فرانت:** رهگیر Axios یک ۴۰۱ را بعد از refresh دوباره تلاش می‌کند، و **۴۰۱ های
همزمان یک refresh مشترک دارند** — وگرنه دومی توکن تازه‌چرخیده را می‌فرستد و سرور آن
را سرقت می‌خواند.

**نگهبان `res.headersSent`:** کلاینتی که وسط درخواست می‌رود (رفرش صفحه با
double-render در React) باعث می‌شد کد روی پاسخ بسته بنویسد و ۵۰۰ لاگ شود برای چیزی
که هرگز شکست نخورده بود.

### نام کاربری = شماره موبایل

موبایل ایران، ۱۱ رقم با `09`. تلفن ثابت پذیرفته نمی‌شود چون همین شماره کانال پیامک
تسک ۸.۶ است.

normalize یکسان در ثبت‌نام، ورود **و ساخت پرسنل** (`phoneSchema` مشترک): ارقام فارسی
و عربی‌هندی، جداکننده‌ها، `+98` و `0098`.

ستون `users.phone` حالا «شماره تماس دیگر» است (اختیاری).

### یک کارگاه تازه

`populateWorkspace` که ثبت‌نام و `seed.ts` هر دو صدایش می‌زنند: سوپرادمین با
`fullName = "مدیر"`، یک ردیف `settings` با نام کارگاه، و چهار خدمت پیش‌فرض.

**دوره‌ی آزمایشی:** `status = trial` و `expiresAt = +1 ماه` در تابع SQL. اعمالش تسک
۸.۳ است.

### شماره‌گذاری فاکتور

سه شمارنده روی ردیف `Workspace`. قالب `PUR-0001`، `SAL-0001`، `REP-0001`.
`seq = seq + 1` قفل ردیف می‌گیرد (با ده درخواست موازی تست شده). داخل تراکنش خودِ
فاکتور، پس rollback شماره را برمی‌گرداند.

پیشوند از تنظیمات نمی‌آید: شماره داده‌ی حسابداری است و باید خسته‌کننده بماند. آنچه
کارگاه می‌خواهد شخصی‌سازی کند **قالب چاپ** است — تسک ۹.۵.

### مجوزهای نقش اپ

| جدول                 | مجوز                          | چرا                       |
| -------------------- | ----------------------------- | ------------------------- |
| `roles`              | فقط `SELECT`                  | داده‌ی مرجع               |
| `workspaces`         | `SELECT` + `UPDATE`           | شمارنده‌ها؛ ساخت از دریچه |
| `_prisma_migrations` | هیچ                           | داده‌ی اپلیکیشن نیست      |
| بقیه                 | `SELECT/INSERT/UPDATE/DELETE` | —                         |

`ALTER DEFAULT PRIVILEGES` جدول‌های آینده را پوشش می‌دهد. **ولی RLS منتقل نمی‌شود** —
هر مهاجرتی که جدول با `workspace_id` بسازد باید RLS و policy را در همان مهاجرت اضافه
کند. `smoke.test.ts` تعداد policy را با تعداد جدول‌های `workspace_id` دار مقایسه
می‌کند.

### الگوی scope در کنترلرها

```typescript
const where = { workspaceId: workspaceIdOf(req), ...filters };

// تک‌رکورد — findUnique کار نمی‌کند چون شرط مرکب است
const row = await prisma.x.findFirst({ where: { id, workspaceId } });

// حذف — count را چک کن، وگرنه پاسخ برای شناسه‌ی ناموجود هم موفق است
const deleted = await prisma.x.deleteMany({ where: { id, workspaceId } });
if (deleted.count === 0) return res.status(404)...
```

### شکل پاسخ API

**ناسازگاری عمدی:** بیشتر API `snake_case`، ولی `items` و `categories` با
`camelCase`. `serialize()` در آن دو استفاده نمی‌شود چون فرانت را می‌شکند.

### پول و تاریخ

- مبالغ `Decimal(18, 0)` · نرخ‌ها `Decimal(5, 2)` · در کنترلر `.toNumber()`
- ذخیره میلادی، API رشته‌ی ISO، نمایش جلالی در فرانت
- مرزهای «امروز» در گزارش‌ها **UTC** — ساعت ۳:۳۰ بامداد تهران صفر می‌شود

---

## ۵. تسک‌های باقی‌مانده

### فاز ۵ — بکاپ و خروجی داده

|           | بکاپ پلتفرم      | خروجی مشتری          |
| --------- | ---------------- | -------------------- |
| مالک      | اپراتور          | صاحب کارگاه          |
| دامنه     | کل دیتابیس       | فقط یک `workspaceId` |
| فرمت      | `pg_dump` باینری | Excel + zip عکس‌ها   |
| در UI اپ؟ | **نه**           | بله                  |

```markdown
- [ ] 5.1 Check whether ParsPack's managed Postgres offers automated backups
- [ ] 5.2 (only if 5.1 says no) Scheduled pg_dump shipped to ArvanCloud
- [ ] 5.3 Per-workspace data export: Excel workbook + zip of device images
- [ ] 5.4 Rework BackupList.jsx into an export page. No restore button
- [ ] 5.5 Operator runbook for restoring a single workspace from a dump
- [ ] 5.6 Fineti import: importFromExcel + importDeviceImages with
      --workspace-id (4.5 موکول شد به اینجا)
- [ ] 5.7 Operator recovery for a workspace whose owner is locked out
```

### فاز ۶ — تست

```markdown
- [x] 6.4 Integration tests against a real test Postgres database
- [ ] 6.1 Audit controller unit tests for gaps rather than starting over
- [ ] 6.2 Unit tests for business logic (invoiceTotals is done)
- [ ] 6.3 Auth tests — بیشترش در فاز ۳ نوشته شد؛ ممیزی لازم است
- [ ] (تازه) Frontend testing: نه Vitest هست نه Testing Library
```

### فاز ۷ — استقرار

```markdown
- [ ] 7.1 Production Dockerfile for backend (must include prisma generate)
- [ ] 7.2 Production Dockerfile for frontend (build + serve via Nginx)
- [ ] 7.3 docker-compose.prod.yml (no Postgres — separate server)
- [ ] 7.4 Reverse proxy (Nginx or Caddy) with TLS for app.dofixo.ir
- [ ] 7.5 Provision ParsPack app server and database server (manual)
- [ ] 7.6 First manual deployment
      ⚠️ Must not happen before 5.1/5.2
- [ ] 7.7 A GitHub Actions workflow that runs `pnpm test:all` on push
```

⚠️ **۷.۵:** روی Postgres مدیریت‌شده ممکن است کاربر superuser نباشد و `CREATE ROLE` در
مهاجرت `rls_policies` شکست بخورد. قبل از استقرار از ParsPack بپرسید.

⚠️ **۷.۴:** `NODE_ENV=production` باید ست شود، وگرنه کوکی refresh بدون `Secure`
فرستاده می‌شود.

⚠️ **تازه:** پروداکشن باید **صندوقچه و کلید Arvan جداگانه** داشته باشد. آنچه الان
استفاده می‌شود صندوقچه‌ی تست است.

### فاز ۸ — اشتراک و پرداخت

```markdown
- [ ] 8.1 Subscription model · 8.2 One-month trial (ثبتش در 3.1 انجام شد)
- [ ] 8.3 Read-only enforcement once a trial/subscription lapses
- [ ] 8.4 Zibal · 8.5 Plan selection UI · 8.6 Kavenegar SMS OTP
```

### فاز ۹ — یکدست‌سازی رابط کاربری

```markdown
- [ ] 9.1 Fold the stock report into the items page as a filter
- [ ] 9.2 Move the profit summary onto the dashboard
- [ ] 9.3 Let the purchase invoice form create a complete item inline
- [ ] 9.4 Decide how deleting a purchase invoice should affect avg_purchase_price
- [ ] 9.5 A proper invoice template: editable layout, logo/stamp/signature
      placement, column choice and print styling
- [ ] 9.6 Remove `settings.invoice_prefix`, unused since 2.8
```

---

## ۶. بدهی‌های فنی و ریسک‌های شناخته‌شده

هیچ‌کدام باگ تصادفی نیستند — همه آگاهانه پذیرفته شده‌اند.

### ۱. فرانت هیچ تست خودکاری ندارد

تأیید فاز ۳ و ۴ در سمت فرانت تماماً دستی بود. مهم‌ترین شکاف پروژه.

### ۲. صندوقچه و کلید Arvan همان تست است

قبل از پروداکشن باید جدا شود، مثل دیتابیس.

### ۳. URL امضاشده ۱۵ دقیقه اعتبار دارد

اگر کاربر مودالی را بیست دقیقه باز بگذارد، عکس‌ها ۴۰۳ می‌گیرند. تصمیم: فعلاً کاری
نکنیم. اگر آزارنده شد، یک `onError` با **یک بار** تلاش (نه حلقه) اضافه می‌شود.

### ۴. ثبت‌نام بدون تأیید هویت باز است

تا ۸.۶، تنها ترمز rate limiter مشترک با login است.

### ۵. سقف مطلق عمر session نداریم

هر چرخش ۳۰ روز تازه می‌دهد. تصمیم عمدی، ولی یعنی توکن دزدیده‌شده‌ای که مرتب چرخانده
شود تا ابد زنده می‌ماند — مگر دارنده‌ی قانونی هم refresh بزند.

### ۶. `settings.invoice_prefix` کد مرده است

از ۲.۸ خوانده نمی‌شود → **۹.۶**.

### ۷. هر کوئری یک تراکنش با دو رفت‌وبرگشت است

`getDashboardStats` هفده کوئری موازی روی pool ده‌اتصالی. تنظیم pool تا وقتی عدد
واقعی نداریم عمداً انجام نشده.

### ۸. `DeprecationWarning` از `pg`

«کوئری روی کلاینتی که مشغول است». مسدودکننده نیست، احتمالاً هم‌ریشه با ۷.

### ۹. raw SQL زیر extension نمی‌رود

هر raw query روی جدول tenant باید داخل `runInWorkspaceTransaction` باشد. استثناها:
health check و سه تابع دریچه.

### ۱۰. سه فاکتور فقط از مسیر payment/status تست ایزولاسیون دارند

### ۱۱. تست‌های یکپارچگی در CI نیستند

**۷.۷** باید `pnpm test:all` را اجرا کند.

### ۱۲. `seed.ts` idempotent نیست

اگر کارگاهی وجود داشته باشد رد می‌شود. برای seed دوباره `docker compose down -v`.

### ۱۳. حذف فاکتور خرید `avgPurchasePrice` را اصلاح نمی‌کند → **۹.۴**

### ۱۴. بهای تمام‌شده در گزارش سود، قیمت **فعلی** است، نه قیمت زمان فروش

### ۱۵. گزارش سود اقلام دلخواه را نادیده می‌گیرد

### ۱۶. `repair_invoice_items.itemId` عمداً رابطه نیست (پلی‌مورفیک)

### ۱۷. `personnel_id` روی `devices` بلااستفاده است. کاندید حذف

### ۱۸. سه ستون تخفیف در `SaleInvoiceItem` بلااستفاده‌اند

### ۱۹. `dist` خودش را پاک نمی‌کند · `pnpm-workspace.yaml` داخل `backend/` است

---

## ۷. قواعد کاری (`RULES.md`)

| #   | قاعده                                                                                                                                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ۱   | **یک تسک شماره‌دار در هر نشست**                                                                                                                                                        |
| ۲   | **هرگز بدون تأیید صریح کامیت نکن**                                                                                                                                                     |
| ۳   | هر تسکی که منطق backend را لمس می‌کند تست لازم دارد · منبع REST جدید = یک خط در `isolation.test.ts`                                                                                    |
| ۴   | Conventional Commits، کامیت‌های کوچک                                                                                                                                                   |
| ۵   | روی `feature/multi-tenant-migration` بمان                                                                                                                                              |
| ۶   | الگوی موجود · بدون کد مرده · Zod روی همه‌ی ورودی‌ها · **هرگز `workspaceId` از کلاینت نگیر**                                                                                            |
| ۷   | امنیت: `workspaceId` + RLS · raw SQL داخل helper · جدول جدید = policy در همان مهاجرت · مسیر آپلود = `restoreWorkspaceContext` بعد از multer · دریچه‌ی چهارم بدون توضیح در COMMENT نساز |
| ۸   | بعد از تکمیل تسک `Roadmap.md` را به‌روز کن                                                                                                                                             |
| ۹   | ارائه: چه شد → نتیجه‌ی تست → ریسک‌ها → منتظر تأیید                                                                                                                                     |
| ۱۰  | **دستورات شبکه‌ای را خودت اجرا نکن**                                                                                                                                                   |

---

## ۸. دستورات روزمره

### راه‌اندازی از صفر

```bash
cp .env.example .env
cp backend/.env.example backend/.env

docker compose up -d --build

node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
docker compose exec postgres psql -U dofixo -d dofixo_dev \
  -c "ALTER ROLE dofixo_app WITH LOGIN PASSWORD '<رمز>';"
# همان رمز در DATABASE_URL_APP و POSTGRES_APP_PASSWORD

cd backend && pnpm exec prisma migrate dev && pnpm exec prisma generate
cd backend && pnpm seed        # با SEED_ADMIN_USERNAME وارد می‌شوید
```

### دیتابیس تست (یک بار)

```bash
docker compose exec postgres psql -U dofixo -d postgres \
  -c "CREATE DATABASE dofixo_test OWNER dofixo;"
```

### چرخه‌ی توسعه

```bash
cd backend && pnpm test              # ۳۷۱ تست با mock
cd backend && pnpm test:integration  # ۷۰ تست با دیتابیس واقعی
cd backend && pnpm test:all
cd backend && pnpm lint && pnpm build
cd frontend && pnpm lint

docker compose logs backend --tail 30
docker compose restart backend
```

### دیتابیس

```bash
cd backend && pnpm migrate

docker compose exec postgres psql -U dofixo -d dofixo_dev \
  -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';"
docker compose exec postgres psql -U dofixo -d dofixo_dev \
  -c "SELECT proname, prosecdef FROM pg_proc WHERE proname LIKE 'app_%';"

docker compose exec -T postgres psql -U dofixo -d dofixo_dev \
  -v ON_ERROR_STOP=0 < backend/prisma/rls-check.sql

docker compose down -v && docker compose up -d postgres
cd backend && pnpm exec prisma migrate dev && pnpm seed
```

### متغیرهای محیطی — `backend/.env`

```dotenv
DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_dev?schema=public
DATABASE_URL_APP=postgresql://dofixo_app:<رمز>@127.0.0.1:5432/dofixo_dev?schema=public
TEST_DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_test?schema=public
TEST_DATABASE_URL_APP=postgresql://dofixo_app:<رمز>@127.0.0.1:5432/dofixo_test?schema=public

PORT=5001
JWT_SECRET=<crypto.randomBytes(32).toString('hex')>
TRUST_PROXY=0
SEED_ADMIN_USERNAME=09120000000   # باید موبایل معتبر باشد
SEED_ADMIN_PASSWORD=<رمز اولیه>
RATE_LIMIT_API=1000
RATE_LIMIT_LOGIN=10

# ArvanCloud — صندوقچه باید خصوصی باشد
S3_ENDPOINT=https://s3.ir-thr-at1.arvanstorage.ir
S3_REGION=default
S3_BUCKET=reza-app-test-1
S3_ACCESS_KEY=<کلید>
S3_SECRET_KEY=<کلید>
```

`.env` ریشه: `POSTGRES_APP_PASSWORD=<همان رمز>`

---

## ۹. دام‌هایی که در مسیر به آن‌ها خوردیم

حتماً بخوانید — هر کدام دست‌کم یک ساعت وقت گرفت.

### multer از async context عبور نمی‌کند

پرهزینه‌ترین دام فاز ۴. busboy هندلر را از یک رویداد stream صدا می‌زند و
`AsyncLocalStorage` آن را دنبال نمی‌کند. علامتش: `req.user` هست ولی
`currentWorkspaceId()` برابر `undefined` و هر کوئری خطای «No workspace context»
می‌دهد. راه‌حل: `restoreWorkspaceContext` بعد از multer، که store **تازه** باز کند.

### کاراکتر `<` در کپی از چت گم می‌شود

`<` در جنریک‌ها (`z.infer<...>`، `$queryRaw<...>`) گاهی بلعیده می‌شود. بعد از هر کپی:

```bash
cd backend && grep -n "z.infer\|GetPayload\|queryRaw\|satisfies" src/**/*.ts
```

مطمئن‌تر: فایل را با `cat > path << 'EOF'` بسازید.

### موقع اعمال «از → به»، خط قدیمی را حذف کنید

باگ دو-پاسخی `refresh` از همین آمد: خط تازه اضافه شد ولی قدیمی ماند، و هر رفرش
صفحه دو session ساخت. علامتش `ERR_HTTP_HEADERS_SENT` در لاگ بود، بدون هیچ اثری در
مرورگر.

### `sudo` نزنید

`prisma generate` فایل می‌نویسد و با `sudo` مالکشان root می‌شود. کانتینر هم موقع بوت
همین کار را می‌کند:

```bash
sudo chown -R "$USER":"$USER" backend
```

### بعد از `pnpm add` کانتینر را بازبسازید

volume ناشناس `node_modules` را می‌پوشاند و کانتینر مجموعه‌ی قدیمی را نگه می‌دارد.
علامتش `MODULE_NOT_FOUND` روی پکیج تازه‌نصب است:

```bash
docker compose up -d --build --renew-anon-volumes backend
```

### موقع کار روی migration کانتینر را بخوابانید

`tsx watch` می‌تواند migration را قبل از شما اجرا کند: `docker compose stop backend`.

### تست رمز از داخل کانتینر بی‌معنی است

`pg_hba.conf` برای `127.0.0.1` روی `trust` است. باید از **نام سرویس** رفت:

```bash
docker compose exec postgres env PGPASSWORD='wrong' \
  psql -h postgres -U dofixo_app -d dofixo_dev -c "SELECT 1;"
```

### `ERR_HTTP_HEADERS_SENT` همیشه باگ نیست

کلاینتی که وسط درخواست می‌رود (double-render در React) پاسخ را می‌بندد. نگهبان
`if (!res.headersSent)` قبل از هر نوشتن، و در `catch` هم.

### مهاجرت دستی: timestamp باید بزرگ‌تر باشد

ترتیب اجرا الفبایی است، نه زمانی.

### `globalSetup` فقط وقتی تستی باشد اجرا می‌شود

### mock کردن `lib/prisma` سه export دارد

`default`، `runInWorkspaceTransaction` و در صورت نیاز
`runInNewWorkspaceTransaction` — و helperها باید callback را **واقعاً** صدا بزنند:

```typescript
runInWorkspaceTransaction: jest.fn(
  (_workspaceId: number, fn: (tx: unknown) => unknown) => fn(tx),
),
```

`jest.fn()` خالی یعنی بدنه اصلاً اجرا نمی‌شود.

### تستی که context لازم دارد باید در `runWithRequestContext` بپیچد

`login`، `register`، `refresh`، `logout` همه `setContextWorkspaceId` صدا می‌زنند.

### `127.0.0.1` نه `localhost`

روی Arch، `localhost` اول به `::1` حل می‌شود و Prisma با `P1001` شکست می‌خورد.

### `prisma generate` بعد از هر `migrate dev`

در Prisma 7 خودکار نیست. `pnpm migrate` هر دو را می‌زند.

### Prisma 7 به driver adapter نیاز دارد

### `tsx watch` بعد از حذف فایل گیر می‌کند

اول `.ts` را بسازید، بعد `.js` را حذف کنید، بعد `docker compose restart backend`.

### `as const` با تایپ‌های Prisma کار نمی‌کند

### `z.coerce.date()` با رشته‌ی خالی

```typescript
z.preprocess((value) => (value === "" ? undefined : value), z.coerce.date().optional());
```

### ارقام فارسی و عربی‌هندی دو چیز متفاوتند

`۰۹۱۲` (U+06F0) و `٠٩١٢` (U+0660). `persianToEnglish` فقط اولی را می‌شناسد؛
`schemas/auth.ts` هر دو را.

---

## ۱۰. باگ‌هایی که در مسیر پیدا و رفع شدند

| باگ                                           | محل                                  | اثر                                                |
| --------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| نشت موجودی در ویرایش فاکتور فروش              | `saleInvoiceController.update`       | هر ویرایش ناموفق موجودی را دائمی بالا می‌برد       |
| `reference_id` همیشه `null`                   | هر سه کنترلر فاکتور                  | تاریخچه‌ی کالا شماره فاکتور نشان نمی‌داد           |
| خدمات به کالای بی‌ربط وصل                     | `repairInvoiceController.getById`    | JOIN بی‌قید روی `item_id` پلی‌مورفیک               |
| جابه‌جایی ستون در نگاشت                       | `customerController.getDevices`      | `created_at` به‌عنوان `image_path`                 |
| فاکتور بدون قلم غیرقابل حذف                   | خرید و فروش                          | اقلام را می‌خواند نه فاکتور را                     |
| فیلتر `role` نادیده گرفته می‌شد               | `personnelController.getAll`         | فهرست تکنسین‌ها مدیران را هم نشان می‌داد           |
| رمز در لاگ                                    | `authController`                     | ۲۰ کاراکتر اول هش bcrypt چاپ می‌شد                 |
| ساخت جدول در زمان اجرا                        | `serviceController.getAll`           | هر درخواست `CREATE TABLE IF NOT EXISTS`            |
| `quickSale` به قیمت خرید                      | `itemController`                     | گزارش سود حاشیه‌ی صفر نشان می‌داد                  |
| سوپرادمین می‌توانست خودش را تنزل دهد          | `personnelController.update`         | راه برگشتی نبود                                    |
| **۹ کوئری از ۱۷ بدون scope**                  | `reportController.getDashboardStats` | داشبورد یک کارگاه ارقام همه را نشان می‌داد         |
| **حذف مشتری ۲۰۰ برای شناسه‌ی ناموجود**        | `customerController.remove`          | همان عملیات در devices و items ۴۰۴ می‌داد          |
| **logout همه‌ی دستگاه‌ها را بیرون می‌انداخت** | `authController.logout`              | ابطال به‌جای حذف، تب بازمانده = سیگنال سرقت        |
| **username غیرموبایل در ساخت پرسنل**          | `schemas/personnel.ts`               | حسابی که ساخته می‌شد و هیچ‌کس نمی‌توانست واردش شود |
| **multer context را قطع می‌کرد**              | مسیرهای آپلود                        | هر کوئری پشت آپلود خطا می‌داد                      |
| **`refresh` دو بار پاسخ می‌فرستاد**           | `authController.refresh`             | دو session به‌ازای هر رفرش صفحه، نامرئی برای کاربر |
| **کلاینت رهاشده ۵۰۰ لاگ می‌کرد**              | `issueSession`                       | خطا برای درخواستی که هرگز شکست نخورده بود          |

---

## ۱۱. وضعیت تست‌ها

### تست‌های واحد (`pnpm test`)

```
۲۹ فایل · ۳۷۱ تست · همه پاس · Prisma و storage با mock
```

| فایل                       | پوشش                                              |
| -------------------------- | ------------------------------------------------- |
| `auth.test.ts`             | authenticate: امضا، انقضا، شکل payload            |
| `authorize.test.ts`        | `authorize()` و `atLeast()`                       |
| `authController.test.ts`   | ثبت‌نام، ورود، refresh، logout                    |
| `authSchemas.test.ts`      | normalize شماره، قواعد رمز، هم‌ترازی پرسنل        |
| `refreshToken.test.ts`     | ساخت/هش توکن، تنظیمات کوکی                        |
| `newWorkspace.test.ts`     | فرش کردن کارگاه تازه                              |
| `workspaceContext.test.ts` | ایزوله بودن context + `restoreWorkspaceContext`   |
| `prismaExtension.test.ts`  | کوئری بدون context باید خطا بدهد                  |
| `imageController.test.ts`  | کلید با پیشوند workspace، URL امضاشده، شکست آپلود |
| ۱۳ فایل کنترلر + ابزار     | CRUD، scope، منطق کسب‌وکار                        |

### تست‌های یکپارچگی (`pnpm test:integration`)

```
۶ فایل · ۷۰ تست (۱ skip) · دیتابیس واقعی dofixo_test
```

| فایل                            | پوشش                                             |
| ------------------------------- | ------------------------------------------------ |
| `smoke.test.ts`                 | اتصال با `dofixo_app`، شمارش policy، دو کارگاه   |
| `isolation.test.ts`             | جدول‌محور: ۹ منبع × (فهرست، خواندن، ویرایش، حذف) |
| `isolationSpecialCases.test.ts` | `settings`، ۱۷ کوئری داشبورد، `personnel`        |
| `invoiceNumbering.test.ts`      | شمارنده، استقلال کارگاه‌ها، ۱۰ درخواست همزمان    |
| `register.test.ts`              | ثبت‌نام، کارگاه یتیم، ایزوله بودن کارگاه تازه    |
| `refreshToken.test.ts`          | کوکی، چرخش، تشخیص سرقت، logout تک‌session        |

⚠️ تست‌های یکپارچگی **به Arvan واقعی نمی‌خورند** — `lib/storage` در آن‌ها هم mock
است، وگرنه هر اجرا صندوقچه را پر می‌کرد.

**آنچه هنوز تست نمی‌شود:** فرانت، اتمی بودن تراکنش‌ها در حالت شکست، `PUT /:id` کامل
سه نوع فاکتور، و اتصال واقعی به object storage.

---

## ۱۲. توصیه برای شروع نشست بعدی

۱. سه فایل `CLAUDE.md`، `Roadmap.md` و `RULES.md` را بفرست
۲. این سند را بفرست
۳. تسک را انتخاب کن (پیشنهادها پایین)

### سه مسیر پیش رو

**الف) فاز ۵ — بکاپ و خروجی داده.** منطقی‌ترین ادامه، چون **۷.۶ نباید قبل از ۵.۱ و
۵.۲ اتفاق بیفتد** — سیستمی که داده‌ی واقعی مشتری دارد و بکاپ ندارد، حادثه‌ای است که
منتظر وقوع است. شروعش با ۵.۱ است که یک سؤال از ParsPack است، نه کد.

**ب) Vitest برای فرانت.** بزرگ‌ترین شکاف فعلی. دو فاز اخیر تماماً دستی تأیید شدند، و
هرچه فرانت بزرگ‌تر شود این گران‌تر می‌شود. اگر تصمیم داری فرانت را TypeScript کنی،
بهتر است اول آن، بعد تست.

**ج) فاز ۷ — استقرار.** فقط اگر سرورها تهیه شده باشند، و **نه قبل از ۵.۱/۵.۲**.

پیشنهاد من **الف** است، چون تنها چیزی است که مسیر رسیدن به پروداکشن را باز می‌کند و
شروعش ارزان است.
