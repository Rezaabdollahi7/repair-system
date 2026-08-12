# Dofixo — سند انتقال پروژه

> این سند برای ادامه‌ی کار مهاجرت Dofixo از تک‌مستأجری به SaaS در یک نشست جدید نوشته
> شده است. همه‌چیزی که برای ادامه لازم است اینجاست: وضعیت فعلی، تصمیمات گرفته‌شده و
> دلیلشان، تسک‌های باقی‌مانده، بدهی‌های فنی، و دام‌هایی که در مسیر به آن‌ها خوردیم.
>
> **تاریخ آخرین به‌روزرسانی:** پایان فاز ۳ (تسک ۳.۱۱)

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

**هدف اصلی:** تبدیل زیرساخت به SaaS **بدون تغییر مجموعه‌ی ویژگی‌های موجود**. این یک
بازنویسی محصول نیست — منطق کسب‌وکار فعلی درست فرض می‌شود.

---

## ۲. وضعیت فعلی

### فازهای تمام‌شده

| فاز                                            | وضعیت          |
| ---------------------------------------------- | -------------- |
| ۰ — زیرساخت و ابزار                            | ✅ کامل        |
| ۱ — مهاجرت SQLite → PostgreSQL                 | ✅ کامل        |
| ۲ — چندمستأجری (RLS، ایزولاسیون، شماره فاکتور) | ✅ کامل        |
| ۳ — بازنویسی احراز هویت                        | ✅ کامل        |
| ۶.۴ — تست یکپارچگی با دیتابیس واقعی            | ✅ (همراه ۲.۷) |

### فاز ۳ — چه چیزی ساخته شد

| تسک                                 | خلاصه                                        |
| ----------------------------------- | -------------------------------------------- |
| 3.1 ثبت‌نام خودکار                  | `app_create_workspace` + `populateWorkspace` |
| 3.2 یکتایی سراسری شماره             | `username` = شماره موبایل، یکتا در کل پلتفرم |
| 3.3 access token                    | JWT، ۱۵ دقیقه                                |
| 3.4 refresh token                   | ۳۰ روز، هش SHA-256، کوکی httpOnly            |
| 3.5 `/auth/refresh`                 | چرخش + تشخیص سرقت                            |
| 3.6 `/auth/logout`                  | حذف ردیف (نه ابطال)                          |
| 3.7 `auth.js` → `auth.ts`           | payload فیلد به فیلد بررسی می‌شود            |
| 3.8 `authorize.js` → `authorize.ts` | نقش‌ها تایپ‌دار                              |
| 3.9 `AuthContext`                   | توکن در حافظه، صف refresh، بازیابی session   |
| 3.10 صفحه‌ی ثبت‌نام                 | `/register`                                  |
| 3.11 رابط پرسنل                     | username با همان قاعده‌ی شماره موبایل        |

**وضعیت فعلی اپ:** کاملاً کار می‌کند. هر کسی می‌تواند از `/register` کارگاه بسازد،
وارد شود، session اش با رفرش صفحه زنده می‌ماند، و کاربر داخل کارگاه خودش بسازد.

---

## ۳. پشته‌ی فنی

### Backend

```
Node 26 · TypeScript 5.9 · Express 5 · pnpm 10.10.0

Prisma 7.9.1 + @prisma/adapter-pg + pg 8.22
PostgreSQL 17 (Docker)
Zod 4.4.3 · helmet 8.3 · express-rate-limit 8.6 · cookie-parser 1.4
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
│   ├── app.ts                 ساخت اپ Express (بدون listen)
│   ├── server.ts              entrypoint
│   ├── lib/
│   │   ├── prisma.ts          کلاینت + extension + دو helper تراکنش
│   │   └── workspaceContext.ts  AsyncLocalStorage به‌ازای هر درخواست
│   ├── controllers/           ۱۴ کنترلر
│   ├── routes/                همه TypeScript جز index.js
│   ├── middleware/
│   │   ├── auth.ts            JWT + انتشار workspace در context
│   │   ├── authorize.ts       authorize() و atLeast()
│   │   ├── requestContext.ts  باز کردن context قبل از روترها
│   │   └── validate.ts        middleware اعتبارسنجی Zod
│   ├── schemas/               schemaهای Zod
│   ├── utils/
│   │   ├── workspace.ts       workspaceIdOf(req)
│   │   ├── refreshToken.ts    ساخت/هش توکن، تنظیمات کوکی
│   │   ├── newWorkspace.ts    populateWorkspace() — مشترک با seed
│   │   ├── invoiceNumber.ts   nextInvoiceNumber(tx, workspaceId, kind)
│   │   ├── serialize.ts · errors.ts · dateRange.ts
│   │   ├── invoiceTotals.ts · payment.ts
│   │   └── persianToEnglish.js ⚠️ هنوز CommonJS
│   ├── types/request.ts       AuthUser + declare global روی Express.Request
│   ├── generated/prisma/      ⚠️ gitignore
│   └── __tests__/
│       ├── (۲۹ فایل، ۳۵۸ تست با mock)
│       └── integration/       ۶ فایل، ۷۰ تست با دیتابیس واقعی
├── jest.config.js · jest.setup.ts
├── jest.integration.config.js · .globalSetup.ts · .setup.ts
└── tsconfig.json · tsconfig.build.json
```

**دو فایل `.js` باقی‌مانده:** `routes/index.js` (به‌خاطر `export =` در فایل‌های روت)
و `utils/persianToEnglish.js`. هیچ‌کدام در روادمپ تسکی ندارند.

### مهاجرت‌ها

| نام                               | کارش                                             |
| --------------------------------- | ------------------------------------------------ |
| `20260809073159_init_multitenant` | اسکیمای اولیه با `workspaceId`                   |
| `20260810095035_invoice_counters` | سه ستون شمارنده روی `workspaces`                 |
| `20260810120000_rls_policies`     | نقش `dofixo_app` + policyها + grantها            |
| `20260810140000_login_lookup`     | `app_login_lookup` (دریچه‌ی ۱)                   |
| `20260810150000_create_workspace` | `app_create_workspace` (دریچه‌ی ۲)               |
| `20260812074748_refresh_tokens`   | جدول + policy + `app_refresh_lookup` (دریچه‌ی ۳) |

⚠️ **ترتیب اجرا الفبایی است، نه زمانی.** چند مهاجرت دستی timestamp دلخواه گرفتند، پس
`invoice_counters` روی دیتابیس خالی قبل از RLS اجرا می‌شود. بی‌ضرر است، ولی هر
مهاجرت دستی جدید باید timestamp بزرگ‌تر از `20260812074748` بگیرد.

---

## ۴. تصمیمات معماری و دلیلشان

مهم‌ترین بخش سند. هر تصمیم دلیلی دارد که اگر ندانید، ممکن است تصادفاً برش گردانید.

### تنانسی

**دیتابیس مشترک، اسکیمای مشترک.** ایزولاسیون از طریق ستون `workspaceId` روی هر جدول
tenant-scoped. **دو لایه‌ی دفاعی:** فیلتر در سطح اپلیکیشن + RLS در سطح دیتابیس.
هیچ‌کدام نباید حذف شوند. مقیاس هدف: ~۵۰۰ کارگاه، هر کدام تا ~۱۰۰۰ دستگاه.

### دو اتصال دیتابیس، عمداً

| متغیر              | نقش          | مصرف                 |
| ------------------ | ------------ | -------------------- |
| `DATABASE_URL`     | `dofixo`     | فقط migration و seed |
| `DATABASE_URL_APP` | `dofixo_app` | اپ در حال اجرا       |

در Postgres مالک جدول (و superuser) RLS را **دور می‌زند**. اگر اپ با مالک وصل شود،
policyها نوشته می‌شوند ولی هیچ اثری ندارند و تست‌های ایزولاسیون به‌غلط سبز می‌شوند.
`dofixo_app` مالک هیچ جدولی نیست و فقط DML دارد.

⚠️ `lib/prisma.ts` عمداً **fallback به `DATABASE_URL` ندارد**. اگر داشت، یک `.env`
ناقص بی‌سروصدا اپ را به اتصال superuser برمی‌گرداند.

### زنجیره‌ی `app.workspace_id`

```
requestContext (middleware)  →  AsyncLocalStorage باز می‌شود (خالی)
authenticate                 →  setContextWorkspaceId(payload.workspaceId)
Prisma extension             →  currentWorkspaceId() را می‌خواند
                             →  set_config('app.workspace_id', id, TRUE)
                                همراه کوئری، در یک تراکنش
```

**چرا AsyncLocalStorage:** Prisma خبری از `req` ندارد، و متغیر سطح ماژول بین
درخواست‌های همزمان نشت می‌کند.

**چرا `set_config` نه `SET LOCAL`:** دومی پارامتر نمی‌گیرد. آرگومان سوم `TRUE` یعنی
مقدار با تراکنش می‌میرد و به درخواست بعدی روی همان اتصال pool نشت نمی‌کند.

**اگر context نباشد، extension خطا پرتاب می‌کند** — نه اینکه بگذارد RLS ساکت صفر ردیف
برگرداند.

### دو helper تراکنش

```typescript
// ❌ هرگز
await prisma.$transaction(async (tx) => { ... });

// ✅ تراکنش معمولی
await runInWorkspaceTransaction(workspaceId, async (tx) => { ... });

// ✅ ثبت‌نام: کارگاه هنوز وجود ندارد
await runInNewWorkspaceTransaction(name, async (tx, workspaceId) => { ... });
```

عملیات داخل تراکنش دوباره وارد extension می‌شود و **تراکنش دومی روی اتصال دوم** باز
می‌کند؛ `set_config` آنجا می‌نشیند و کار اصلی بدون context ادامه می‌دهد. نتیجه:
خواندن خالی وسط یک نوشتن.

**۱۳ نقطه** در ۵ کنترلر از اولی استفاده می‌کنند.

### سه دریچه‌ی `SECURITY DEFINER`

هر سه وجود دارند چون فراخوان هنوز هیچ workspace ای ندارد. هیچ‌کدام نباید گشاد شوند.

| تابع                   | کِی                         | چه برمی‌گرداند                         |
| ---------------------- | --------------------------- | -------------------------------------- |
| `app_login_lookup`     | ورود، قبل از احراز          | id، workspace، هش رمز، وضعیت فعال      |
| `app_create_workspace` | ثبت‌نام، کارگاه هنوز نیست   | فقط `id` کارگاه تازه                   |
| `app_refresh_lookup`   | refresh، access token منقضی | id ردیف، user، workspace، انقضا، ابطال |

⚠️ هر سه `SET search_path = public` دارند تا نشود با جدول بدلی منحرفشان کرد، و
`EXECUTE` از `PUBLIC` گرفته شده.

⚠️ **ثبت‌نام فقط ساخت کارگاه را از دریچه رد می‌کند.** کاربر، تنظیمات و خدمات پیش‌فرض
بعدش با کلاینت عادی و **زیر policy** نوشته می‌شوند، چون به‌محض داشتن شناسه می‌شود
context را ست کرد. گشاد کردن تابع، چهار insert را بی‌دلیل بیرون از policyها می‌برد.

### احراز هویت

**access token:** JWT، ۱۵ دقیقه، payload شامل `userId`، `workspaceId`، `role`. در
**حافظه‌ی صفحه** نگه داشته می‌شود نه localStorage.

**refresh token:** ۳۰ روز، یک راز تصادفی ۳۲ بایتی — **نه JWT**. اگر JWT بود، وسوسه‌ی
اعتبارسنجی بدون خواندن دیتابیس پیش می‌آمد و ابطال‌پذیری از بین می‌رفت.

**در دیتابیس فقط هش SHA-256 ذخیره می‌شود.** SHA-256 نه bcrypt: راز پرآنتروپی است،
دیکشنری معنی ندارد، و bcrypt هر refresh را کند می‌کرد.

**کوکی:** `httpOnly`، `SameSite=Strict`، `Path=/api/auth`، و `Secure` فقط در
پروداکشن (کوکی secure روی http بی‌صدا دور انداخته می‌شود و dev هم TLS ندارد).

**چرخش با تشخیص سرقت:** هر refresh توکن قبلی را باطل و نو صادر می‌کند. اگر توکن
**باطل‌شده** دوباره ارائه شود، یعنی نسخه‌ای در گردش است — کدام‌یک دزد است معلوم نیست،
پس **همه‌ی session های آن کاربر** بسته می‌شوند.

**logout ردیف را حذف می‌کند، نه باطل.** ابطال سیگنال سرقت است؛ پایان دادن به session
خودت سیگنالی ندارد. اگر باطل می‌کرد، یک تب بازمانده که دوباره تلاش کند، کامپیوتر مغازه
را هم بیرون می‌انداخت — که تست یکپارچگی همین را گرفت.

**چند session همزمان مجاز است.** ردیف‌های منقضی همان کاربر در هر refresh پاک می‌شوند.

**عمداً ذخیره نمی‌شود:** IP و User-Agent. فقط به درد صفحه‌ی «دستگاه‌های فعال» می‌خورند
که وجود ندارد.

### سمت فرانت

توکن در یک متغیر ماژول در `src/api` است. رفرش صفحه آن را می‌برد و از `/auth/refresh`
بازیابی می‌شود — که کاربر را هم برمی‌گرداند تا یک رفت‌وبرگشت کمتر شود.

**رهگیر Axios** یک ۴۰۱ را بعد از refresh دوباره تلاش می‌کند. **۴۰۱ های همزمان یک
refresh مشترک دارند** — وگرنه دومی توکنی را می‌فرستد که اولی همین الان چرخانده، و
سرور آن را سرقت می‌خواند.

مسیرهای `/auth/*` از رهگیر مستثنا هستند، وگرنه شکست refresh خودش refresh می‌ساخت.

### نام کاربری = شماره موبایل

موبایل ایران، ۱۱ رقم با `09`. تلفن ثابت عمداً پذیرفته نمی‌شود چون همین شماره کانال
پیامک تسک ۸.۶ است.

normalize یکسان در ثبت‌نام، ورود **و ساخت پرسنل** (`phoneSchema` مشترک): ارقام فارسی
و عربی‌هندی، جداکننده‌ها، `+98` و `0098`. هر سه باید یکی بمانند — قبلاً نبودند و
تکنسینی با username `ali_tech` ساخته می‌شد که هیچ‌کس نمی‌توانست واردش شود.

ستون `users.phone` حالا «شماره تماس دیگر» است (اختیاری)، نه شماره‌ی اصلی.

### یک کارگاه تازه چه چیزی همراهش دارد

`populateWorkspace` که هم ثبت‌نام و هم `seed.ts` صدایش می‌زنند: سوپرادمین با
`fullName = "مدیر"`، یک ردیف `settings` با نام کارگاه، و چهار خدمت پیش‌فرض.

**چرا «مدیر» نه نام کارگاه:** فرم ثبت‌نام نام شخص نمی‌گیرد. گذاشتن نام کارگاه یعنی
ردیفی در فهرست پرسنل که شبیه یک آدم است، و به‌محض ساختن کاربر دوم بی‌معنی می‌شود.

**چرا ردیف `settings` الزامی است:** `updateSettings` مستقیم `update` می‌زند، پس بدون
آن اولین ذخیره‌ی تنظیمات شکست می‌خورد.

**دوره‌ی آزمایشی:** `status = trial` و `expiresAt = +1 ماه` در همان تابع SQL. اعمالش
(قفل شدن) تسک ۸.۳ است؛ اینجا فقط ثبت می‌شود تا هیچ ردیفی بدون جواب «تا کی» نماند.

### شماره‌گذاری فاکتور

سه شمارنده روی ردیف `Workspace`. قالب: `PUR-0001`، `SAL-0001`، `REP-0001`.

`seq = seq + 1` قفل ردیف می‌گیرد، پس دو درخواست همزمان یک شماره نمی‌گیرند (با ده
درخواست موازی تست شده). داخل تراکنش خودِ فاکتور است، پس rollback شماره را برمی‌گرداند
و شکاف نمی‌افتد.

**چرا تاریخ حذف شد:** شمارنده روزانه ریست نمی‌شود، پس تاریخ گمراه‌کننده بود.

**چرا پیشوند از تنظیمات نمی‌آید:** شماره داده‌ی حسابداری است و باید خسته‌کننده بماند.
آنچه یک کارگاه می‌خواهد شخصی‌سازی کند **قالب چاپ** است — تسک ۹.۵.

### مجوزهای نقش اپ

| جدول                 | مجوز                          | چرا                                       |
| -------------------- | ----------------------------- | ----------------------------------------- |
| `roles`              | فقط `SELECT`                  | داده‌ی مرجع، فقط seed می‌نویسدش           |
| `workspaces`         | `SELECT` + `UPDATE`           | شمارنده‌ها؛ ساخت از دریچه، حذف با اپراتور |
| `_prisma_migrations` | هیچ                           | داده‌ی اپلیکیشن نیست                      |
| بقیه                 | `SELECT/INSERT/UPDATE/DELETE` | —                                         |

`ALTER DEFAULT PRIVILEGES` جدول‌های آینده را پوشش می‌دهد. **ولی RLS منتقل نمی‌شود** —
هر مهاجرتی که جدول با `workspace_id` بسازد باید RLS و policy را در همان مهاجرت اضافه
کند. `prisma/rls-check.sql` جامانده‌ها را پیدا می‌کند، و `smoke.test.ts` تعداد policy
را با تعداد جدول‌های `workspace_id` دار مقایسه می‌کند.

### یکتایی

| ستون              | دامنه         | دلیل                                      |
| ----------------- | ------------- | ----------------------------------------- |
| `User.username`   | **سراسری**    | یک شماره = یک حساب در کل پلتفرم           |
| `Item.code`       | per-workspace | یک کارگاه نباید کد را برای بقیه رزرو کند  |
| `Category.name`   | per-workspace | همان                                      |
| `*.invoiceNumber` | per-workspace | شماره‌گذاری هر کارگاه مستقل               |
| نام کارگاه        | **یکتا نیست** | دو مغازه در دو شهر می‌توانند هم‌نام باشند |

### الگوی scope در کنترلرها

فیلتر اپلیکیشنی **حذف نشده** و نباید حذف شود — لایه‌ی دوم است.

```typescript
const where = { workspaceId: workspaceIdOf(req), ...filters };

// تک‌رکورد — findUnique کار نمی‌کند چون شرط مرکب است
const row = await prisma.x.findFirst({ where: { id, workspaceId } });

// حذف — count را چک کن، وگرنه پاسخ برای شناسه‌ی ناموجود هم موفق است
const deleted = await prisma.x.deleteMany({ where: { id, workspaceId } });
if (deleted.count === 0) return res.status(404)...

// تراکنش — req داخل tx در دسترس نیست
const workspaceId = workspaceIdOf(req);
await runInWorkspaceTransaction(workspaceId, async (tx) => { ... });
```

### شکل پاسخ API

**ناسازگاری موجود که عمداً حفظ شده:** بیشتر API `snake_case` است، ولی `items` (اکثر
متدها) و `categories` با `camelCase` جواب می‌دهند. `serialize()` در آن دو استفاده
نمی‌شود چون فرانت را می‌شکند.

### پول و تاریخ

- مبالغ: `Decimal(18, 0)` — ریال عدد صحیح است · نرخ‌ها: `Decimal(5, 2)`
- Prisma شیء `Decimal` برمی‌گرداند؛ در کنترلر `.toNumber()`
- ذخیره میلادی، API رشته‌ی ISO، نمایش جلالی در فرانت
- مرزهای «امروز» در گزارش‌ها **UTC** هستند — ساعت ۳:۳۰ بامداد تهران صفر می‌شود

---

## ۵. تسک‌های باقی‌مانده

### فاز ۴ — Object Storage ⬅ **بعدی پیشنهادی**

```markdown
- [ ] 4.1 Provision ArvanCloud Object Storage bucket (manual)
- [ ] 4.2 Add an S3-compatible client (@aws-sdk/client-s3)
- [ ] 4.3 Replace multer disk storage with direct-to-object-storage upload
- [ ] 4.4 Update imageController / ImageUploader.jsx / ImageSlider.jsx
- [ ] 4.5 Restore importDeviceImages.js (deleted in 1.5) against object storage
- [ ] 4.6 Add a MinIO service to docker-compose for local testing
```

**پیشنهاد ترتیب:** از **۴.۶** شروع کنید (MinIO محلی)، بعد ۴.۲ و ۴.۳ رویش. اینطوری
کار منتظر تهیه‌ی حساب ArvanCloud نمی‌ماند و ۴.۱ می‌تواند تا زمان استقرار عقب بیفتد.
MinIO با S3 سازگار است، پس کدی که رویش کار کند روی Arvan هم کار می‌کند.

⚠️ **مهم‌ترین نکته‌ی طراحی فاز ۴:** کلید هر شیء باید `workspaceId` داشته باشد، مثلاً
`workspaces/42/devices/7/photo.webp`. object storage نه RLS دارد نه policy — تنها
محافظ، ساختار کلید و بررسی اپلیکیشن است. اگر کلیدها تخت باشند، ایزولاسیونی که کل فاز
۲ برایش صرف شد، سر عکس‌ها سوراخ می‌شود.

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
- [ ] 5.6 Fineti import: restore importFromExcel.js with --workspace-id
- [ ] 5.7 Operator recovery for a workspace whose owner is locked out
```

### فاز ۶ — تست

```markdown
- [x] 6.4 Integration tests against a real test Postgres database
- [ ] 6.1 Audit controller unit tests for gaps rather than starting over
- [ ] 6.2 Unit tests for business logic (invoiceTotals is done)
- [ ] 6.3 Auth tests — بیشترش در فاز ۳ نوشته شد؛ ممیزی لازم است نه شروع دوباره
- [ ] (تازه) Frontend testing: نه Vitest هست نه Testing Library. بهتر است بعد از
      TypeScript شدن فرانت انجام شود
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
      ⚠️ test:all، نه test — وگرنه تست‌های ایزولاسیون هرگز در CI اجرا نمی‌شوند
```

⚠️ **۷.۵:** روی Postgres مدیریت‌شده ممکن است کاربر شما superuser نباشد و
`CREATE ROLE` در مهاجرت `rls_policies` شکست بخورد. قبل از استقرار از ParsPack بپرسید.

⚠️ **۷.۴:** `NODE_ENV=production` باید ست شود، وگرنه کوکی refresh بدون `Secure`
فرستاده می‌شود.

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
      placement, column choice and print styling, replacing the pile of
      `sale_invoice_show_*` booleans in settings
- [ ] 9.6 Remove `settings.invoice_prefix`, unused since 2.8
```

---

## ۶. بدهی‌های فنی و ریسک‌های شناخته‌شده

هیچ‌کدام باگ تصادفی نیستند — همه آگاهانه پذیرفته شده‌اند.

### ۱. فرانت هیچ تست خودکاری ندارد

کل تأیید فاز ۳ در سمت فرانت دستی بود. مهم‌ترین شکاف فعلی پروژه.

### ۲. ثبت‌نام بدون تأیید هویت باز است

تا تسک ۸.۶ (پیامک OTP)، تنها ترمز، rate limiter مشترک با login است.

### ۳. سقف مطلق عمر session نداریم

هر چرخش ۳۰ روز تازه می‌دهد، پس کاربر فعال هرگز بیرون نمی‌افتد. تصمیم عمدی، ولی یعنی
توکن دزدیده‌شده‌ای که مرتب چرخانده شود تا ابد زنده می‌ماند — مگر دارنده‌ی قانونی هم
refresh بزند و سیگنال سرقت را فعال کند.

### ۴. `settings.invoice_prefix` کد مرده است

از ۲.۸ خوانده نمی‌شود. حذفش فرانت را لمس می‌کند → **۹.۶**.

### ۵. هر کوئری یک تراکنش با دو رفت‌وبرگشت است

`getDashboardStats` هفده کوئری موازی می‌زند روی pool پیش‌فرض ده‌اتصالی `pg`. الان قابل
تحمل است؛ تنظیم pool تا وقتی عدد واقعی نداریم عمداً انجام نشده.

### ۶. `DeprecationWarning` از `pg`

«کوئری روی کلاینتی که مشغول است» در تست‌های یکپارچگی. مسدودکننده نیست، احتمالاً
هم‌ریشه با مورد ۵.

### ۷. raw SQL زیر extension نمی‌رود

`$queryRaw` و `$executeRaw` context نمی‌گیرند. هر raw query روی جدول tenant باید داخل
`runInWorkspaceTransaction` باشد. استثناها: health check و سه تابع دریچه.

### ۸. سه فاکتور فقط از مسیر payment/status تست ایزولاسیون دارند

`PUT /:id` کامل بدنه‌ی پیچیده می‌خواهد. پوشش کامل نیست.

### ۹. تست‌های یکپارچگی در CI نیستند

تسک **۷.۷** باید `pnpm test:all` را اجرا کند.

### ۱۰. `seed.ts` دیگر idempotent نیست

اگر کارگاهی وجود داشته باشد کلاً رد می‌شود. عمدی است تا منطق «فرش کردن کارگاه» دو جا
تکرار نشود، ولی یعنی برای seed دوباره باید `docker compose down -v` بزنید.

### ۱۱. حذف فاکتور خرید `avgPurchasePrice` را اصلاح نمی‌کند

میانگین وزنی از روی خودِ فاکتور برگشت‌پذیر نیست. **تسک ۹.۴**.

### ۱۲. بهای تمام‌شده در گزارش سود، قیمت **فعلی** است

نه قیمت زمان فروش. خرید مجدد، حاشیه‌ی سود فروش‌های گذشته را بازنویسی می‌کند.

### ۱۳. گزارش سود اقلام دلخواه را نادیده می‌گیرد

اقلام بدون `item_id` بهای تمام‌شده‌ی معلومی ندارند.

### ۱۴. `repair_invoice_items.itemId` عمداً رابطه نیست

پلی‌مورفیک: برای `"inventory"` به `items` و برای `"service"` به `services`.

### ۱۵. `personnel_id` روی `devices` بلااستفاده است

همیشه `null`. تخصیص از `device_assignments` می‌آید. کاندید حذف.

### ۱۶. سه ستون تخفیف در `SaleInvoiceItem` بلااستفاده‌اند

`discountType`، `discountValue`، `discountAmount` در اسکیما هستند ولی فرانت
نمی‌فرستدشان.

### ۱۷. `express.static` روی `/uploads` در پروداکشن نمی‌سازد

**فاز ۴** کل مسیر را با object storage جایگزین می‌کند.

### ۱۸. `dist` خودش را پاک نمی‌کند · `pnpm-workspace.yaml` داخل `backend/` است

اولی در فاز ۷ با `prebuild` حل می‌شود؛ دومی یعنی lint کل پروژه دو دستور می‌خواهد.

---

## ۷. قواعد کاری (`RULES.md`)

سه فایل قبل از شروع کار: `CLAUDE.md`، `Roadmap.md`، `RULES.md`.

| #   | قاعده                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| ۱   | **یک تسک شماره‌دار در هر نشست.** قبل از شروع، دامنه و فایل‌ها را بگو                                                            |
| ۲   | **هرگز بدون تأیید صریح کامیت نکن**                                                                                              |
| ۳   | **هر تسکی که منطق backend را لمس می‌کند تست لازم دارد.** منبع REST جدید = یک خط در `isolation.test.ts`                          |
| ۴   | Conventional Commits، کامیت‌های کوچک و متمرکز                                                                                   |
| ۵   | روی `feature/multi-tenant-migration` بمان                                                                                       |
| ۶   | الگوی موجود · بدون کد مرده · Zod روی همه‌ی ورودی‌ها · **هرگز `workspaceId` از کلاینت نگیر**                                     |
| ۷   | امنیت: `workspaceId` + RLS · raw SQL داخل helper · جدول جدید = policy در همان مهاجرت · دریچه‌ی چهارم بدون توضیح در COMMENT نساز |
| ۸   | بعد از تکمیل تسک `Roadmap.md` را به‌روز کن                                                                                      |
| ۹   | ارائه: چه شد → نتیجه‌ی تست → ریسک‌ها → منتظر تأیید                                                                              |
| ۱۰  | **دستورات شبکه‌ای را خودت اجرا نکن** (`pnpm add`، `docker pull`، build کانتینر)                                                 |

---

## ۸. دستورات روزمره

### راه‌اندازی از صفر

```bash
cp .env.example .env
cp backend/.env.example backend/.env

docker compose up -d --build

# نقش اپ بدون رمز ساخته می‌شود — یکی بساز و ست کن
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
cd backend && pnpm test              # ۳۵۸ تست با mock
cd backend && pnpm test:integration  # ۷۰ تست با دیتابیس واقعی
cd backend && pnpm test:all
cd backend && pnpm lint && pnpm build
cd frontend && pnpm lint

docker compose logs backend --tail 30
docker compose restart backend
```

### دیتابیس

```bash
cd backend && pnpm migrate            # migrate dev + generate

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
# مالک — فقط migration و seed
DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_dev?schema=public
# نقش اپ — RLS رویش اعمال می‌شود، بدون fallback
DATABASE_URL_APP=postgresql://dofixo_app:<رمز>@127.0.0.1:5432/dofixo_dev?schema=public
# تست‌های یکپارچگی
TEST_DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_test?schema=public
TEST_DATABASE_URL_APP=postgresql://dofixo_app:<رمز>@127.0.0.1:5432/dofixo_test?schema=public

PORT=5001
JWT_SECRET=<crypto.randomBytes(32).toString('hex')>
TRUST_PROXY=0
SEED_ADMIN_USERNAME=09120000000   # باید موبایل معتبر باشد
SEED_ADMIN_PASSWORD=<رمز اولیه>
RATE_LIMIT_API=1000
RATE_LIMIT_LOGIN=10
```

`.env` ریشه: `POSTGRES_APP_PASSWORD=<همان رمز>`

---

## ۹. دام‌هایی که در مسیر به آن‌ها خوردیم

حتماً بخوانید — هر کدام دست‌کم یک ساعت وقت گرفت.

### کاراکتر `<` در کپی از چت گم می‌شود

`<` در جنریک‌ها (`z.infer<...>`، `$queryRaw<...>`) گاهی بلعیده می‌شود. جنریک‌های
چندخطی بیشتر در خطرند. بعد از هر کپی:

```bash
cd backend && grep -n "z.infer\|GetPayload\|queryRaw\|satisfies" src/**/*.ts
```

مطمئن‌تر: فایل را با `cat > path << 'EOF'` بسازید.

### `sudo` نزنید

`prisma generate` فایل می‌نویسد؛ با `sudo` مالکشان root می‌شود. کانتینر backend هم
موقع بوت `prisma generate` می‌زند و **همین اثر را دارد** — این خطا تکرارشونده است:

```bash
sudo chown -R "$USER":"$USER" backend
```

در فاز ۷ با اضافه کردن کاربر غیر-root به `Dockerfile.dev` ریشه‌کن می‌شود.

### موقع کار روی migration کانتینر را بخوابانید

کانتینر با `tsx watch` بالاست و می‌تواند migration را قبل از شما اجرا کند، که تشخیص
وضعیت را گیج‌کننده می‌کند:

```bash
docker compose stop backend
# ... migration ...
docker compose start backend
```

### تست رمز از داخل کانتینر بی‌معنی است

`pg_hba.conf` ایمیج رسمی برای اتصال محلی و `127.0.0.1` روی `trust` است. برای تست
واقعی باید از **نام سرویس** رفت:

```bash
docker compose exec postgres env PGPASSWORD='wrong' \
  psql -h postgres -U dofixo_app -d dofixo_dev -c "SELECT 1;"
# باید password authentication failed بدهد
```

### مهاجرت دستی: timestamp باید بزرگ‌تر باشد

ترتیب اجرا الفبایی است، نه زمانی.

### `globalSetup` فقط وقتی تستی باشد اجرا می‌شود

Jest اگر هیچ تستی پیدا نکند رد می‌کند، پس مهاجرت روی دیتابیس تست اعمال نمی‌شود.

### mock کردن `lib/prisma` سه export دارد

هر factory تست باید `default`، `runInWorkspaceTransaction` و در صورت نیاز
`runInNewWorkspaceTransaction` را برگرداند — و helperها باید callback را **واقعاً**
صدا بزنند:

```typescript
runInWorkspaceTransaction: jest.fn(
  (_workspaceId: number, fn: (tx: unknown) => unknown) => fn(tx),
),
```

اگر `jest.fn()` خالی باشد، `undefined` برمی‌گرداند و بدنه اجرا نمی‌شود — علامتش این
است که تست می‌گوید فلان mock صفر بار صدا زده شده.

### تستی که context لازم دارد باید در `runWithRequestContext` بپیچد

`login`، `register`، `refresh` و `logout` همه `setContextWorkspaceId` صدا می‌زنند که
بدون context باز شده خطا می‌دهد — و آن خطا در catch به ۵۰۰ تبدیل می‌شود، پس تست با
پیام گمراه‌کننده‌ای می‌شکند.

### `127.0.0.1` نه `localhost`

روی Arch، `localhost` اول به `::1` حل می‌شود و Prisma با `P1001` شکست می‌خورد.

### `prisma generate` بعد از هر `migrate dev`

در Prisma 7 خودکار نیست. `pnpm migrate` هر دو را با هم اجرا می‌کند.

### Prisma 7 به driver adapter نیاز دارد

```typescript
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

### `tsx watch` بعد از حذف فایل گیر می‌کند

`docker compose restart backend` حلش می‌کند. حتماً اول فایل `.ts` را بسازید و بعد
`.js` را حذف کنید، نه برعکس.

### volume ناشناس `node_modules` پابرجا می‌ماند

بعد از `pnpm add` روی هاست حتماً `--renew-anon-volumes`.

### `as const` با تایپ‌های Prisma کار نمی‌کند

آرایه‌ی `readonly` می‌سازد که فیلترهای Prisma قبول نمی‌کنند.

### `z.coerce.date()` با رشته‌ی خالی

`""` می‌شود `Invalid Date` و `null` می‌شود اول ژانویه ۱۹۷۰:

```typescript
z.preprocess((value) => (value === "" ? undefined : value), z.coerce.date().optional());
```

### ارقام فارسی و عربی‌هندی دو چیز متفاوتند

`۰۹۱۲` (U+06F0) و `٠٩١٢` (U+0660) شبیه‌اند ولی کد نویسه‌شان فرق دارد.
`persianToEnglish` فقط اولی را می‌شناسد؛ `schemas/auth.ts` هر دو را.

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

سه مورد آخر را کارهای همین دو فاز گرفتند — دو تای اول را تست یکپارچگی، آخری را
بازبینی schema هنگام ۳.۱۱.

---

## ۱۱. وضعیت تست‌ها

### تست‌های واحد (`pnpm test`)

```
۲۹ فایل · ۳۵۸ تست · همه پاس · Prisma با mock
```

| فایل                                                                           | پوشش                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------ |
| `auth.test.ts`                                                                 | authenticate: امضا، انقضا، شکل payload     |
| `authorize.test.ts`                                                            | `authorize()` و `atLeast()`                |
| `authController.test.ts`                                                       | ثبت‌نام، ورود، refresh، logout             |
| `authSchemas.test.ts`                                                          | normalize شماره، قواعد رمز، هم‌ترازی پرسنل |
| `refreshToken.test.ts`                                                         | ساخت/هش توکن، تنظیمات کوکی                 |
| `newWorkspace.test.ts`                                                         | فرش کردن کارگاه تازه                       |
| `workspaceContext.test.ts`                                                     | ایزوله بودن context بین درخواست‌های همزمان |
| `prismaExtension.test.ts`                                                      | کوئری بدون context باید خطا بدهد           |
| `serialize` · `validate` · `schemas` · `invoiceTotals` · `health` · `security` | ابزار و زیرساخت                            |
| ۱۳ فایل کنترلر                                                                 | CRUD، scope، منطق کسب‌وکار                 |

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

**اضافه کردن منبع REST جدید:** یک خط در آرایه‌ی `resources` در `isolation.test.ts`.

**آنچه هنوز تست نمی‌شود:** فرانت (هیچ زیرساختی ندارد)، اتمی بودن تراکنش‌ها در حالت
شکست، و `PUT /:id` کامل سه نوع فاکتور.

---

## ۱۲. توصیه برای شروع نشست بعدی

۱. سه فایل `CLAUDE.md`، `Roadmap.md` و `RULES.md` را بفرست
۲. این سند را بفرست
۳. بگو: «تسک ۴.۶ را شروع کنیم» (یا هر تسکی که انتخاب کردی)
۴. فایل‌های محتمل: `docker-compose.yml`، `controllers/imageController.ts`،
`routes/images.ts`، `schemas/image.ts`، `frontend/src/components/ImageUploader.jsx`

### چرا فاز ۴ و چرا از ۴.۶

فاز ۴ تنها فازی است که بدون تهیه‌ی سرور یا حساب بیرونی می‌شود شروعش کرد — به‌شرطی که
از **MinIO محلی** شروع کنید. کدی که روی MinIO کار کند روی ArvanCloud هم کار می‌کند،
چون هر دو S3-compatible اند. آن‌وقت ۴.۱ (تهیه‌ی bucket) می‌تواند تا زمان استقرار عقب
بیفتد بدون اینکه کار متوقف شود.

⚠️ **مهم‌ترین نکته‌ی طراحی فاز ۴:** کلید هر شیء باید `workspaceId` داشته باشد، مثلاً
`workspaces/42/devices/7/photo.webp`. object storage نه RLS دارد نه policy — تنها
محافظ، ساختار کلید و بررسی اپلیکیشن است. اگر کلیدها تخت باشند، ایزولاسیونی که کل فاز
۲ برایش صرف شد، سر عکس‌ها سوراخ می‌شود.

### گزینه‌های دیگر

- **فاز ۶** (ممیزی تست) اگر می‌خواهی قبل از افزودن سطح جدید، پوشش فعلی را محکم کنی
- **Vitest برای فرانت** — بزرگ‌ترین شکاف فعلی، ولی بهتر است بعد از TypeScript شدن فرانت
- **فاز ۷** فقط وقتی سرورها تهیه شده باشند، و **نه قبل از ۵.۱/۵.۲**
