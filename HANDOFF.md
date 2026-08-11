# Dofixo — سند انتقال پروژه

> این سند برای ادامه‌ی کار مهاجرت Dofixo از تک‌مستأجری به SaaS در یک نشست جدید نوشته
> شده است. همه‌چیزی که برای ادامه لازم است اینجاست: وضعیت فعلی، تصمیمات گرفته‌شده و
> دلیلشان، تسک‌های باقی‌مانده، بدهی‌های فنی، و دام‌هایی که در مسیر به آن‌ها خوردیم.
>
> **تاریخ آخرین به‌روزرسانی:** پایان فاز ۲ (تسک ۲.۸)

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

### فاز ۲ — چندمستأجری ✅ **کامل**

| تسک                                      | وضعیت                |
| ---------------------------------------- | -------------------- |
| 2.1 مدل `Workspace`                      | ✅                   |
| 2.2 `workspaceId` روی همه‌ی جدول‌ها      | ✅                   |
| 2.3 سیاست‌های RLS در Postgres            | ✅                   |
| 2.4 تنظیم `app.workspace_id` per request | ✅                   |
| 2.5 scope کردن همه‌ی کنترلرها            | ✅                   |
| 2.6 ایندکس‌های مرکب                      | ✅ (در ۲.۲ انجام شد) |
| 2.7 تست‌های ایزولاسیون                   | ✅                   |
| 2.8 یکدست‌سازی شماره فاکتور              | ✅                   |

**تسک ۶.۴ هم اینجا بسته شد** — تست یکپارچگی با دیتابیس واقعی، چون ۲.۷ راه دیگری
برای سنجیدن RLS نداشت.

**⚠️ ترتیب عمدی:** روادمپ اصلی می‌گفت ۲.۳ (RLS) قبل از ۲.۵ (کنترلرها). آن را عوض
کردیم چون اگر اول RLS روشن شود، هر کوئری بدون context هیچ ردیفی برنمی‌گرداند و اپ
ساکت و بدون پیام خطا از کار می‌افتد.

**وضعیت فعلی اپ:** کاملاً کار می‌کند. اپ با نقش غیرمالک `dofixo_app` وصل می‌شود و
RLS واقعاً اعمال می‌شود (با `pg_stat_activity` و تست‌های یکپارچگی تأیید شده).

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
│   ├── schema.prisma          ۲۰ مدل + ۳ enum
│   ├── seed.ts                کارگاه پیش‌فرض + نقش‌ها + سوپرادمین + تنظیمات + ۴ خدمت
│   ├── rls-check.sql          تأیید دستی سیاست‌های RLS
│   └── migrations/            ۴ مهاجرت
├── src/
│   ├── app.ts                 ساخت اپ Express (بدون listen)
│   ├── server.ts              entrypoint (listen)
│   ├── lib/
│   │   ├── prisma.ts          کلاینت + extension + runInWorkspaceTransaction
│   │   └── workspaceContext.ts  AsyncLocalStorage به‌ازای هر درخواست
│   ├── controllers/           ۱۴ کنترلر، همه TypeScript
│   ├── routes/                همه TypeScript جز index.js
│   ├── middleware/
│   │   ├── auth.js            ⚠️ هنوز CommonJS — در فاز ۳ بازنویسی می‌شود
│   │   ├── authorize.js       ⚠️ هنوز CommonJS
│   │   ├── requestContext.ts  باز کردن context قبل از روترها
│   │   └── validate.ts        middleware اعتبارسنجی Zod
│   ├── schemas/               schemaهای Zod، یکی به‌ازای هر منبع
│   ├── utils/
│   │   ├── workspace.ts       workspaceIdOf(req)
│   │   ├── invoiceNumber.ts   nextInvoiceNumber(tx, workspaceId, kind)
│   │   ├── serialize.ts       تبدیل خروجی Prisma به شکل مورد انتظار فرانت
│   │   ├── errors.ts          errorMessage() + isUniqueConstraintError()
│   │   ├── dateRange.ts       todayRange, monthRange, endOfDay, dateFilter
│   │   ├── invoiceTotals.ts   محاسبه‌ی تخفیف و مالیات
│   │   ├── payment.ts         paymentStatusFor()
│   │   └── persianToEnglish.js ⚠️ هنوز CommonJS
│   ├── types/request.ts       AuthUser, AuthenticatedRequest
│   ├── generated/prisma/      ⚠️ gitignore — با prisma generate ساخته می‌شود
│   └── __tests__/
│       ├── (۲۴ فایل، ۲۸۶ تست با mock)
│       └── integration/       ۴ فایل، ۴۸ تست با دیتابیس واقعی
├── jest.config.js
├── jest.setup.ts
├── jest.integration.config.js
├── jest.integration.globalSetup.ts
├── jest.integration.setup.ts
├── Dockerfile.dev
├── tsconfig.json
└── tsconfig.build.json
```

**چهار فایل `.js` باقی‌مانده** (بی‌ضرر، `allowJs` کامپایلشان می‌کند):
`middleware/auth.js`، `middleware/authorize.js`، `routes/index.js`،
`utils/persianToEnglish.js`. دو تای اول در فاز ۳ بازنویسی می‌شوند.

### مهاجرت‌ها

| نام                               | کارش                                        |
| --------------------------------- | ------------------------------------------- |
| `20260809073159_init_multitenant` | اسکیمای اولیه با `workspaceId`              |
| `20260810095035_invoice_counters` | سه ستون شمارنده روی `workspaces`            |
| `20260810120000_rls_policies`     | نقش `dofixo_app` + ۱۹ policy + grantها      |
| `20260810140000_login_lookup`     | تابع `app_login_lookup` با SECURITY DEFINER |

⚠️ **ترتیب اجرا الفبایی است، نه زمانی.** دو مهاجرت آخر دستی نوشته شدند و timestamp
دلخواه گرفتند، به همین دلیل `invoice_counters` روی دیتابیس خالی **قبل از** RLS اجرا
می‌شود. اینجا بی‌ضرر است، ولی هر مهاجرت دستی جدید باید timestamp بزرگ‌تر از
`20260810140000` بگیرد.

---

## ۴. تصمیمات معماری و دلیلشان

این بخش مهم‌ترین قسمت سند است. هر تصمیم دلیلی دارد که اگر ندانید، ممکن است تصادفاً
برش گردانید.

### تنانسی

**دیتابیس مشترک، اسکیمای مشترک.** ایزولاسیون از طریق ستون `workspaceId` روی هر جدول
tenant-scoped.

**دو لایه‌ی دفاعی:** فیلتر در سطح اپلیکیشن + RLS در سطح دیتابیس. هیچ‌کدام نباید حذف
شوند — اگر یکی فراموش شود، دیگری هنوز جلوی نشت را می‌گیرد.

**مقیاس هدف:** حدود ۵۰۰ کارگاه، هر کدام تا ~۱۰۰۰ دستگاه.

### دو اتصال دیتابیس، عمداً

| متغیر              | نقش          | مصرف                 |
| ------------------ | ------------ | -------------------- |
| `DATABASE_URL`     | `dofixo`     | فقط migration و seed |
| `DATABASE_URL_APP` | `dofixo_app` | اپ در حال اجرا       |

**چرا:** در Postgres مالک جدول (و superuser) به‌طور پیش‌فرض RLS را **دور می‌زند**.
اگر اپ با مالک وصل شود، هر ۱۹ policy نوشته می‌شوند ولی هیچ اثری ندارند و تست‌های
ایزولاسیون به‌غلط سبز می‌شوند. `dofixo_app` مالک هیچ جدولی نیست و فقط
`SELECT/INSERT/UPDATE/DELETE` دارد — نه DDL.

⚠️ `lib/prisma.ts` عمداً **fallback به `DATABASE_URL` ندارد**. اگر داشت، یک `.env`
ناقص بی‌سروصدا اپ را به اتصال superuser برمی‌گرداند و تا روزی که یک کارگاه داده‌ی
دیگری را ببیند، هیچ‌چیز مشکوک به نظر نمی‌رسید.

### چطور `app.workspace_id` ست می‌شود

زنجیره‌ی کامل:

```
requestContext (middleware)  →  AsyncLocalStorage باز می‌شود (خالی)
authenticate (auth.js)       →  setContextWorkspaceId(payload.workspaceId)
Prisma extension             →  currentWorkspaceId() را می‌خواند
                             →  set_config('app.workspace_id', id, TRUE)
                                همراه کوئری، در یک تراکنش
```

**چرا AsyncLocalStorage:** Prisma هیچ خبری از `req` ندارد. گزینه‌ی دیگر کلاینت
به‌ازای هر درخواست بود که یعنی هر ۱۴ کنترلر و هر کوئری باید عوض می‌شد. متغیر ساده‌ی
سطح ماژول هم گزینه نیست — Node درخواست‌ها را روی یک thread درهم اجرا می‌کند و یک
متغیر مشترک دقیقاً همان نشتی را می‌سازد که این فاز برای جلوگیری از آن وجود دارد.

**چرا `set_config` نه `SET LOCAL`:** دومی پارامتر نمی‌گیرد و مقدار باید داخل متن SQL
تزریق شود. آرگومان سوم `TRUE` یعنی مقدار با تراکنش می‌میرد و به درخواست بعدی که همان
اتصال pool را قرض می‌گیرد نشت نمی‌کند.

**چرا کوئری داخل تراکنش:** با pool، `set_config` و کوئری روی دو اتصال متفاوت
می‌نشستند و policy چیزی نمی‌دید.

**اگر context نباشد، extension خطا پرتاب می‌کند** — نه اینکه بگذارد RLS ساکت صفر
ردیف برگرداند. کوئری بدون context یعنی باگ در زنجیره‌ی احراز هویت، و نتیجه‌ی خالی
هفته‌ها بعد توسط مشتری پیدا می‌شد نه همان لحظه توسط نویسنده‌اش.

### `runInWorkspaceTransaction` — چرا extension کافی نیست

```typescript
// ❌ هرگز
await prisma.$transaction(async (tx) => { ... });

// ✅ همیشه
await runInWorkspaceTransaction(workspaceId, async (tx) => { ... });
```

عملیات داخل تراکنش، دوباره وارد extension می‌شود و **تراکنش دومی روی اتصال دوم** باز
می‌کند. آن `set_config` آنجا می‌نشیند در حالی که کار اصلی روی اتصال اول و بدون context
ادامه می‌دهد. نتیجه: خواندن خالی وسط یک نوشتن — فاکتوری که ذخیره می‌شود در حالی که
تعدیل موجودی‌اش بی‌صدا هیچ کاری نمی‌کند.

helper روی کلاینت **بدون extension** تراکنش باز می‌کند و اولین statement داخلش
`set_config` است. `workspaceId` صریحاً پاس داده می‌شود، نه از context خوانده شود.

**۱۳ نقطه** در ۵ کنترلر از این helper استفاده می‌کنند: `assignment` (۱)،
`item` (۲)، `purchaseInvoice` (۲)، `saleInvoice` (۳)، `repairInvoice` (۵).

### دریچه‌ی لاگین

`login` باید کاربر را با `username` پیدا کند وقتی هنوز نمی‌داند مال کدام کارگاه است —
تنها کوئری‌ای که هیچ policy نمی‌تواند اجازه‌اش دهد.

```sql
app_login_lookup(username) → id, workspace_id, password, is_active
```

`SECURITY DEFINER` است، یعنی با مجوز مالک تابع اجرا می‌شود و RLS را دور می‌زند.
عمداً **فقط چهار ستون** برمی‌گرداند؛ بقیه‌ی اطلاعات کاربر بعد از `setContextWorkspaceId`
با کلاینت عادی و زیر policy خوانده می‌شود.

⚠️ `search_path` روی تابع پین شده تا نشود با جدول بدلی در schema دیگری منحرفش کرد.
`EXECUTE` از `PUBLIC` گرفته شده و فقط به `dofixo_app` داده شده.

⚠️⚠️ **فاز ۳ به دریچه‌ی دومی نیاز دارد** — ثبت‌نام (تسک ۳.۱) کارگاه و اولین کاربرش را
می‌سازد وقتی هنوز هیچ `workspaceId` وجود ندارد. آن دریچه باید به همان باریکی طراحی
شود، نه با گشاد کردن این یکی.

### شماره‌گذاری فاکتور

سه ستون شمارنده روی ردیف `Workspace`: `purchaseSeq`، `saleSeq`، `repairSeq`.

```
PUR-0001    SAL-0001    REP-0001
```

**چرا شمارنده نه COUNT:** «تعداد فاکتورهای امروز + ۱» را دو درخواست همزمان می‌توانستند
یکسان بخوانند. `seq = seq + 1` قفل ردیف می‌گیرد و به هر فراخوان شماره‌ای می‌دهد که
هیچ‌کس دیگری نمی‌گیرد. با تست یکپارچگی و ده درخواست موازی تأیید شده.

**چرا داخل تراکنش خودِ فاکتور:** اگر rollback شود، شمارنده هم برمی‌گردد و شکاف نمی‌افتد.

**چرا تاریخ حذف شد:** شمارنده دیگر روزانه ریست نمی‌شود، پس تاریخ داخل شماره
گمراه‌کننده می‌شد. تاریخ فاکتور ستون خودش را دارد.

**چرا پیشوند از تنظیمات نمی‌آید:** شماره‌ی فاکتور داده‌ی حسابداری است و کارش یکتا و
پیوسته بودن است. آنچه یک کارگاه واقعاً می‌خواهد شخصی‌سازی کند، **قالب چاپ** است — که
تسک ۹.۵ است. `settings.invoicePrefix` حالا بلااستفاده است و در ۹.۶ حذف می‌شود.

### مدل `Workspace`

```prisma
model Workspace {
  id        Int
  name      String            // یکتا نیست — دو کارگاه می‌توانند هم‌نام باشند
  status    WorkspaceStatus   // trial | active | expired
  expiresAt DateTime?         // هم پایان دوره‌ی آزمایشی، هم پایان اشتراک

  purchaseSeq Int @default(0)
  saleSeq     Int @default(0)
  repairSeq   Int @default(0)
}
```

**چرا slug ندارد:** اپ از یک دامنه‌ی مشترک سرو می‌شود، پس کارگاه همیشه از روی شناسه‌ی
داخل توکن شناسایی می‌شود.

**چرا یک `expiresAt`:** سؤالی که همیشه از آن پرسیده می‌شود یکی است — «تا کی این
کارگاه می‌تواند بنویسد؟» جزئیات پلن در فاز ۸ روی مدل `Subscription` می‌نشیند.

### چه چیزی `workspaceId` می‌گیرد و چه چیزی نه

| جدول           | `workspaceId`؟ | دلیل                                                               |
| -------------- | -------------- | ------------------------------------------------------------------ |
| `roles`        | ❌             | سه نقش ثابت، داده‌ی مرجع مشترک بین همه‌ی کارگاه‌هاست               |
| `workspaces`   | ❌             | خودش مستأجر است — policy روی `id` است نه `workspace_id`            |
| بقیه‌ی ۱۸ جدول | ✅             | شامل جدول‌های فرزند مثل `SaleInvoiceItem` و `RepairInvoicePayment` |

**چرا فرزندها هم می‌گیرند:** با اینکه از طریق پدرشان هم محافظت می‌شوند، دادن ستون
مستقیم policyهای RLS را **ساده** نگه می‌دارد. و policy ساده یعنی احتمال اشتباه کمتر.

### مجوزهای نقش اپ

| جدول                 | مجوز                          | چرا                                                  |
| -------------------- | ----------------------------- | ---------------------------------------------------- |
| `roles`              | فقط `SELECT`                  | داده‌ی مرجع، فقط seed می‌نویسدش                      |
| `workspaces`         | `SELECT` + `UPDATE`           | شمارنده‌ها آپدیت می‌شوند؛ ساخت و حذف کار اپراتور است |
| `_prisma_migrations` | هیچ                           | داده‌ی اپلیکیشن نیست                                 |
| بقیه                 | `SELECT/INSERT/UPDATE/DELETE` | —                                                    |

`ALTER DEFAULT PRIVILEGES` تنظیم شده تا جدول‌های آینده خودبه‌خود همین مجوزها را
بگیرند. **ولی RLS خودبه‌خود منتقل نمی‌شود** — هر مهاجرتی که جدول جدید با
`workspace_id` بسازد، باید در همان مهاجرت RLS و policy را هم اضافه کند.
`prisma/rls-check.sql` جدول‌های جامانده را پیدا می‌کند.

### یکتایی

| ستون              | دامنه         | دلیل                                                     |
| ----------------- | ------------- | -------------------------------------------------------- |
| `User.username`   | **سراسری**    | نام کاربری = شماره تلفن. یک شماره = یک حساب در کل پلتفرم |
| `Item.code`       | per-workspace | یک کارگاه نباید کد کالا را برای بقیه رزرو کند            |
| `Category.name`   | per-workspace | همان                                                     |
| `*.invoiceNumber` | per-workspace | شماره‌گذاری هر کارگاه مستقل است                          |

### توکن

`workspaceId` **داخل JWT** است، نه از دیتابیس خوانده می‌شود. `authenticate` توکن‌های
بدون `workspaceId` را به‌عنوان منقضی رد می‌کند.

**⚠️ هرگز `workspaceId` را از body یا query نخوانید.** فقط از توکن امضاشده.

### الگوی scope در کنترلرها

فیلتر اپلیکیشنی **حذف نشده** و نباید حذف شود — همان لایه‌ی دوم مورد نظر `CLAUDE.md`
است.

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

// حذف — count را چک کن، وگرنه پاسخ برای شناسه‌ی ناموجود هم موفق است
const deleted = await prisma.x.deleteMany({ where: { id, workspaceId } });
if (deleted.count === 0) return res.status(404)...

// تراکنش
const workspaceId = workspaceIdOf(req);   // req داخل tx در دسترس نیست
await runInWorkspaceTransaction(workspaceId, async (tx) => { ... });
```

### شکل پاسخ API

**ناسازگاری موجود که عمداً حفظ شده است:**

| endpoint                                              | شکل کلیدها   |
| ----------------------------------------------------- | ------------ |
| بیشتر API                                             | `snake_case` |
| `items` (اکثر متدها) و `categories`                   | `camelCase`  |
| `items/:id/transactions` و `items/search/for-invoice` | `snake_case` |

`serialize()` در `utils/serialize.ts` هست ولی **در کنترلرهای item و category استفاده
نمی‌شود** چون به snake_case تبدیل می‌کند و فرانت را می‌شکند.

### پول و اعداد

- مبالغ: `Decimal(18, 0)` — ریال عدد صحیح است و float برای پول خطای گرد کردن دارد
- نرخ‌ها: `Decimal(5, 2)` · `avgPurchasePrice`: `Decimal(18, 2)`
- Prisma شیء `Decimal` برمی‌گرداند، در کنترلر با `.toNumber()` تبدیل می‌شود
- محاسبات تخفیف و مالیات صریح `Math.round` می‌شوند

### تاریخ

- ذخیره: میلادی · API: رشته‌ی ISO کامل · نمایش: تبدیل به جلالی در فرانت
- مرزهای «امروز» و «این ماه» در گزارش‌ها **UTC** هستند — شمارنده‌ی روزانه ساعت ۳:۳۰
  بامداد تهران صفر می‌شود
- `dateFilter()` تاریخ پایان بازه را به انتهای همان روز می‌برد

---

## ۵. تسک‌های باقی‌مانده

### فاز ۳ — بازنویسی احراز هویت ⬅ **بعدی**

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

**نکته‌ها:**

- فعلاً access token عمر ۷۲ ساعته دارد. کوتاه کردنش به ۱۵ دقیقه بدون refresh token
  اپ را غیرقابل استفاده می‌کند، پس ۳.۳ و ۳.۴ باید با هم انجام شوند.
- **۳.۱ زیر RLS اجرا نمی‌شود.** ساخت کارگاه و اولین کاربرش وقتی اتفاق می‌افتد که هنوز
  هیچ `workspaceId` وجود ندارد. راه‌حل باید به باریکی `app_login_lookup` باشد. یک
  گزینه: تابع `SECURITY DEFINER` که هر دو را در یک تراکنش می‌سازد و فقط شناسه‌ها را
  برمی‌گرداند.
- `authenticate` که به TypeScript می‌رود (۳.۷)، فراموش نشود که
  `setContextWorkspaceId` را هم صدا بزند — بدون آن هر کوئری خطا می‌دهد.

### فاز ۴ — Object Storage

```markdown
- [ ] 4.1 Provision ArvanCloud Object Storage bucket (manual)
- [ ] 4.2 Add an S3-compatible client (@aws-sdk/client-s3)
- [ ] 4.3 Replace multer disk storage with direct-to-object-storage upload
- [ ] 4.4 Update imageController / ImageUploader.jsx / ImageSlider.jsx
- [ ] 4.5 Restore importDeviceImages.js (deleted in 1.5) against object storage
- [ ] 4.6 Add a MinIO service to docker-compose for local testing
```

### فاز ۵ — بکاپ و خروجی داده

|           | بکاپ پلتفرم                   | خروجی مشتری                |
| --------- | ----------------------------- | -------------------------- |
| مالک      | اپراتور (شما)                 | صاحب کارگاه                |
| هدف       | فاجعه: خرابی دیسک، حذف تصادفی | مالکیت داده، مهاجرت، آرشیو |
| دامنه     | کل دیتابیس                    | فقط یک `workspaceId`       |
| فرمت      | `pg_dump` باینری              | Excel + zip عکس‌ها         |
| در UI اپ؟ | **نه**                        | بله                        |

```markdown
- [ ] 5.1 Check whether ParsPack's managed Postgres offers automated backups
- [ ] 5.2 (only if 5.1 says no) Scheduled pg_dump, shipped to ArvanCloud
- [ ] 5.3 Per-workspace data export: Excel workbook + zip of device images
- [ ] 5.4 Rework BackupList.jsx into an export page. No restore button
- [ ] 5.5 Operator runbook for restoring a single workspace from a dump
- [ ] 5.6 Fineti import: restore importFromExcel.js with --workspace-id
- [ ] 5.7 Operator recovery for a workspace whose owner is locked out
```

### فاز ۶ — تست

```markdown
- [x] 6.4 Integration tests against a real test Postgres database (با ۲.۷)
- [ ] 6.1 Unit tests for all controllers — audit for gaps rather than starting over
- [ ] 6.2 Unit tests for services/business logic (invoiceTotals is done)
- [ ] 6.3 Auth tests (token issuance/refresh/expiry) — ایزولاسیون در ۲.۷ بسته شد
```

### فاز ۷ — استقرار

```markdown
- [ ] 7.1 Production Dockerfile for backend (must include prisma generate)
- [ ] 7.2 Production Dockerfile for frontend (build + serve via Nginx)
- [ ] 7.3 docker-compose.prod.yml (no Postgres — that's a separate server)
- [ ] 7.4 Reverse proxy (Nginx or Caddy) with TLS for app.dofixo.ir
- [ ] 7.5 Provision ParsPack app server and database server (manual)
- [ ] 7.6 First manual deployment
      ⚠️ Must not happen before 5.1/5.2
- [ ] 7.7 A GitHub Actions workflow that runs `pnpm test:all` on push
      ⚠️ test:all، نه test — وگرنه تست‌های ایزولاسیون هرگز در CI اجرا نمی‌شوند
```

⚠️ **۷.۵:** روی Postgres مدیریت‌شده ممکن است کاربر شما superuser نباشد و
`CREATE ROLE` در مهاجرت `rls_policies` شکست بخورد. قبل از استقرار از ParsPack بپرسید؛
در آن صورت نقش باید دستی ساخته شود.

### فاز ۸ — اشتراک و پرداخت

```markdown
- [ ] 8.1 Subscription model · 8.2 One-month free trial · 8.3 Read-only when lapsed
- [ ] 8.4 Zibal payment gateway · 8.5 Plan selection UI · 8.6 Kavenegar SMS OTP
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

هیچ‌کدام از این‌ها باگ تصادفی نیستند — همه آگاهانه پذیرفته شده‌اند.

### ۱. `settings.invoice_prefix` کد مرده است

از ۲.۸ هیچ‌جا خوانده نمی‌شود. حذفش اسکیما، فرم تنظیمات فرانت و شکل پاسخ را لمس
می‌کند، پس به **۹.۶** موکول شد.

### ۲. هر کوئری یک تراکنش با دو رفت‌وبرگشت است

`getDashboardStats` هفده کوئری موازی می‌زند که روی pool پیش‌فرض ده‌اتصالی `pg` صف
می‌بندند. الان قابل تحمل است. تنظیم اندازه‌ی pool تا وقتی عدد واقعی نداریم عمداً
انجام نشده.

### ۳. `DeprecationWarning` از `pg`

«کوئری روی کلاینتی که هنوز مشغول است» در اجرای تست‌های یکپارچگی. مسدودکننده نیست،
احتمالاً هم‌ریشه با مورد ۲. کاندید بررسی در فاز ۷.

### ۴. raw SQL زیر extension نمی‌رود

`$queryRaw` و `$executeRaw` context نمی‌گیرند. هر raw query روی جدول tenant باید داخل
`runInWorkspaceTransaction` باشد. استثناها: `SELECT 1` در health check و
`app_login_lookup` که اصلاً برای همین وجود دارد.

### ۵. سه فاکتور فقط از مسیر payment/status تست ایزولاسیون دارند

`PUT /:id` کامل فاکتورها بدنه‌ی پیچیده با آرایه‌ی اقلام می‌خواهد. مسیرهای
`payment`/`status` همان‌قدر write path هستند، ولی پوشش کامل نیست.

### ۶. حذف فاکتور خرید `avgPurchasePrice` را اصلاح نمی‌کند

موجودی برمی‌گردد ولی میانگین قیمت نادرست می‌ماند، چون میانگین وزنی از روی خودِ فاکتور
برگشت‌پذیر نیست. **تسک ۹.۴**.

### ۷. بهای تمام‌شده در گزارش سود، قیمت **فعلی** است

`avgPurchasePrice` لحظه‌ی گزارش استفاده می‌شود، نه قیمت زمان فروش.

### ۸. گزارش سود اقلام دلخواه را نادیده می‌گیرد

اقلام فاکتور فروش بدون `item_id` بهای تمام‌شده‌ی معلومی ندارند و از محاسبه حذف می‌شوند.

### ۹. `repair_invoice_items.itemId` عمداً رابطه نیست

پلی‌مورفیک است: برای `item_type === "inventory"` به `items` و برای `"service"` به
`services` اشاره می‌کند.

### ۱۰. `personnel_id` روی `devices` عملاً بلااستفاده است

همیشه `null` نوشته می‌شود. تخصیص تکنسین از `device_assignments` می‌آید. کاندید حذف.

### ۱۱. سه ستون تخفیف در `SaleInvoiceItem` بلااستفاده‌اند

`discountType`، `discountValue`، `discountAmount` در اسکیما هستند ولی فرانت هیچ‌وقت
نمی‌فرستدشان.

### ۱۲. `express.static` روی `/uploads` در پروداکشن نمی‌سازد

**فاز ۴** کل این مسیر را با object storage جایگزین می‌کند.

### ۱۳. `dist` خودش را پاک نمی‌کند

در فاز ۷ با یک اسکریپت `prebuild` حل می‌شود.

### ۱۴. `pnpm-workspace.yaml` داخل `backend/` است

دو اپ عملاً دو پروژه‌ی pnpm مستقل با lockfile جدا هستند.

### ۱۵. تست‌های یکپارچگی در CI نیستند

تسک **۷.۷** باید `pnpm test:all` را اجرا کند نه `pnpm test`.

---

## ۷. قواعد کاری (`RULES.md`)

سه فایل باید قبل از شروع کار خوانده شوند: `CLAUDE.md`، `Roadmap.md`، `RULES.md`.

| #   | قاعده                                                                                                                       |
| --- | --------------------------------------------------------------------------------------------------------------------------- |
| ۱   | **یک تسک شماره‌دار در هر نشست.** قبل از شروع، دامنه و فایل‌هایی که لمس می‌شوند را بگو                                       |
| ۲   | **هرگز بدون تأیید صریح کامیت نکن.** خلاصه بده، منتظر «تایید» بمان                                                           |
| ۳   | **هر تسکی که منطق backend را لمس می‌کند تست لازم دارد.** منبع REST جدید = یک خط در جدول `isolation.test.ts`                 |
| ۴   | Conventional Commits: `type(scope): description` — کامیت‌های کوچک و متمرکز                                                  |
| ۵   | روی `feature/multi-tenant-migration` بمان، بدون اجازه merge نکن                                                             |
| ۶   | الگوی موجود را رعایت کن · کد مرده نگه ندار · همه‌ی ورودی‌ها را با Zod اعتبارسنجی کن · **هرگز `workspaceId` از کلاینت نگیر** |
| ۷   | چک‌لیست امنیتی: `workspaceId` + RLS · raw SQL داخل `runInWorkspaceTransaction` · جدول جدید = policy در همان مهاجرت          |
| ۸   | بعد از تکمیل تسک، `Roadmap.md` را به‌روز کن                                                                                 |
| ۹   | ساختار ارائه: چه شد → نتیجه‌ی تست → ریسک‌ها → منتظر تأیید                                                                   |
| ۱۰  | **دستورات شبکه‌ای را خودت اجرا نکن.** `pnpm add`، `docker pull` و مشابه را در بلوک کد بده                                   |

---

## ۸. دستورات روزمره

### راه‌اندازی از صفر

```bash
cp .env.example .env                    # ریشه
cp backend/.env.example backend/.env    # سپس متغیرها را پر کن

docker compose up -d --build

# نقش اپ رمز ندارد تا اینجا — یکی بساز و ست کن
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
docker compose exec postgres psql -U dofixo -d dofixo_dev \
  -c "ALTER ROLE dofixo_app WITH LOGIN PASSWORD '<رمز>';"
# همان رمز در DATABASE_URL_APP و POSTGRES_APP_PASSWORD

cd backend && pnpm exec prisma migrate dev && pnpm exec prisma generate
cd backend && pnpm seed
```

### دیتابیس تست (یک بار)

```bash
docker compose exec postgres psql -U dofixo -d postgres \
  -c "CREATE DATABASE dofixo_test OWNER dofixo;"
# نقش‌ها سطح cluster هستند، پس dofixo_app از قبل هست
```

### چرخه‌ی توسعه

```bash
cd backend && pnpm test              # ۲۸۶ تست با mock
cd backend && pnpm test:integration  # ۴۸ تست با دیتابیس واقعی
cd backend && pnpm test:all          # هر دو
cd backend && pnpm lint              # باید ۰ error باشد
cd backend && pnpm build

docker compose logs backend --tail 30
docker compose restart backend
```

### دیتابیس

```bash
cd backend && pnpm migrate            # migrate dev + generate

docker compose exec postgres psql -U dofixo -d dofixo_dev -c "\dt"
docker compose exec postgres psql -U dofixo -d dofixo_dev \
  -c "SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';"

# تأیید RLS
docker compose exec -T postgres psql -U dofixo -d dofixo_dev \
  -v ON_ERROR_STOP=0 < backend/prisma/rls-check.sql

# پاک کردن کامل و شروع دوباره
docker compose down -v && docker compose up -d postgres
cd backend && pnpm exec prisma migrate dev && pnpm seed
```

### متغیرهای محیطی

`backend/.env`:

```dotenv
# مالک — فقط migration و seed
DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_dev?schema=public
# نقش اپ — RLS رویش اعمال می‌شود
DATABASE_URL_APP=postgresql://dofixo_app:<رمز>@127.0.0.1:5432/dofixo_dev?schema=public
# تست‌های یکپارچگی
TEST_DATABASE_URL=postgresql://dofixo:dofixo@127.0.0.1:5432/dofixo_test?schema=public
TEST_DATABASE_URL_APP=postgresql://dofixo_app:<رمز>@127.0.0.1:5432/dofixo_test?schema=public

PORT=5001
JWT_SECRET=<crypto.randomBytes(32).toString('hex')>
TRUST_PROXY=0
SEED_ADMIN_PASSWORD=<رمز اولیه سوپرادمین>
RATE_LIMIT_API=1000
RATE_LIMIT_LOGIN=10
```

`.env` ریشه: `POSTGRES_APP_PASSWORD=<همان رمز>`

---

## ۹. دام‌هایی که در مسیر به آن‌ها خوردیم

این بخش را حتماً بخوانید — هر کدام یک ساعت وقت گرفت.

### کاراکتر `<` در کپی از چت گم می‌شود

هنگام کپی کد از رابط چت، `<` در جنریک‌ها (`z.infer<...>`، `$queryRaw<...>`) گاهی
بلعیده می‌شود. جنریک‌های چندخطی بیشتر در خطرند. بعد از هر کپی:

```bash
cd backend && grep -n "z.infer\|GetPayload\|queryRaw\|satisfies" src/**/*.ts
```

یا مطمئن‌تر: فایل را با `cat > path << 'EOF'` بسازید.

### `sudo` نزنید

`prisma generate` فایل می‌نویسد؛ با `sudo` مالکشان root می‌شود و اجرای بعدی با
`EACCES` می‌خورد. کانتینر backend هم موقع بوت `prisma generate` می‌زند و همین اثر را
دارد. درمان:

```bash
sudo chown -R "$USER":"$USER" backend
```

### تست رمز از داخل کانتینر بی‌معنی است

`pg_hba.conf` ایمیج رسمی برای اتصال محلی و `127.0.0.1` روی `trust` است، پس
`docker compose exec postgres psql -h 127.0.0.1` هر رمزی را قبول می‌کند. برای تست
واقعی باید از نام سرویس رفت:

```bash
docker compose exec postgres env PGPASSWORD='wrong' \
  psql -h postgres -U dofixo_app -d dofixo_dev -c "SELECT 1;"
# باید password authentication failed بدهد
```

### `127.0.0.1` نه `localhost`

روی Arch Linux، `localhost` اول به `::1` حل می‌شود و مسیر IPv6 به پورت منتشرشده‌ی
کانتینر جواب نمی‌دهد. Prisma با `P1001` شکست می‌خورد.

### `prisma generate` بعد از هر `migrate dev`

در Prisma 7 برخلاف ۶، `migrate dev` دیگر خودکار کلاینت را تولید نمی‌کند. اسکریپت
`pnpm migrate` هر دو را با هم اجرا می‌کند.

### Prisma 7 به driver adapter نیاز دارد

```typescript
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });
```

### مهاجرت دستی: timestamp باید بزرگ‌تر باشد

ترتیب اجرا الفبایی است. نام پوشه‌ی دلخواه یعنی مهاجرت‌ها می‌توانند برخلاف ترتیب
نوشته شدنشان اجرا شوند.

### `globalSetup` فقط وقتی تستی باشد اجرا می‌شود

Jest اگر هیچ تستی پیدا نکند `globalSetup` را رد می‌کند، پس مهاجرت روی دیتابیس تست
اعمال نمی‌شود. برای امتحان لوله‌کشی باید حداقل یک تست واقعی وجود داشته باشد.

### mock کردن `lib/prisma` حالا دو export دارد

هر factory تست باید هم `default` و هم `runInWorkspaceTransaction` را برگرداند، و
دومی باید callback را واقعاً صدا بزند:

```typescript
runInWorkspaceTransaction: jest.fn(
  (_workspaceId: number, fn: (tx: unknown) => unknown) => fn(tx),
),
```

اگر `jest.fn()` خالی باشد، `undefined` برمی‌گرداند و بدنه‌ی تراکنش اصلاً اجرا نمی‌شود
— علامتش این است که تست می‌گوید فلان mock صفر بار صدا زده شده.

### `tsx watch` بعد از حذف فایل گیر می‌کند

`docker compose restart backend` حلش می‌کند.

### volume ناشناس `node_modules` پابرجا می‌ماند

بعد از `pnpm add` روی هاست، حتماً
`docker compose up -d --build --renew-anon-volumes <service>`.

### `as const` با تایپ‌های Prisma کار نمی‌کند

آرایه‌ی `readonly` می‌سازد که فیلترهای Prisma قبول نمی‌کنند. تایپ صریح بدهید.

### `z.coerce.date()` با رشته‌ی خالی

فیلدهای تاریخ هنگام پاک شدن `""` می‌فرستند که `Invalid Date` می‌شود، و `null` به اول
ژانویه ۱۹۷۰ تبدیل می‌شود:

```typescript
z.preprocess((value) => (value === "" ? undefined : value), z.coerce.date().optional());
```

### تست‌ها نباید به `.env` توسعه‌دهنده وابسته باشند

`jest.setup.ts` مقادیر rate limit را پین می‌کند و `DATABASE_URL_APP` را ست می‌کند
(چون `lib/prisma` هنگام import بدون آن خطا می‌دهد).

---

## ۱۰. باگ‌هایی که در مسیر مهاجرت پیدا و رفع شدند

| باگ                                    | محل                                  | اثر                                          |
| -------------------------------------- | ------------------------------------ | -------------------------------------------- |
| نشت موجودی در ویرایش فاکتور فروش       | `saleInvoiceController.update`       | هر ویرایش ناموفق موجودی را دائمی بالا می‌برد |
| `reference_id` همیشه `null`            | هر سه کنترلر فاکتور                  | تاریخچه‌ی کالا شماره فاکتور نشان نمی‌داد     |
| خدمات به کالای بی‌ربط وصل              | `repairInvoiceController.getById`    | JOIN بی‌قید روی `item_id` پلی‌مورفیک         |
| جابه‌جایی ستون در نگاشت                | `customerController.getDevices`      | `created_at` به‌عنوان `image_path`           |
| فاکتور بدون قلم غیرقابل حذف            | خرید و فروش                          | اقلام را می‌خواند نه فاکتور را               |
| فیلتر `role` نادیده گرفته می‌شد        | `personnelController.getAll`         | فهرست تکنسین‌ها مدیران را هم نشان می‌داد     |
| پاسخ `update` همیشه ناقص               | `saleInvoiceController`              | `getById` با `res` جعلی صدا زده می‌شد        |
| نام تکراری ۵۰۰ می‌داد                  | `categoryController`                 | تطبیق رشته‌ی خطای SQLite در Postgres         |
| رمز در لاگ                             | `authController`                     | ۲۰ کاراکتر اول هش bcrypt چاپ می‌شد           |
| ساخت جدول در زمان اجرا                 | `serviceController.getAll`           | هر درخواست `CREATE TABLE IF NOT EXISTS`      |
| `quickSale` به قیمت خرید               | `itemController`                     | گزارش سود حاشیه‌ی صفر نشان می‌داد            |
| سوپرادمین می‌توانست خودش را تنزل دهد   | `personnelController.update`         | راه برگشتی نبود                              |
| **۹ کوئری از ۱۷ بدون scope**           | `reportController.getDashboardStats` | داشبورد یک کارگاه ارقام همه را نشان می‌داد   |
| **حذف مشتری ۲۰۰ برای شناسه‌ی ناموجود** | `customerController.remove`          | همان عملیات در devices و items ۴۰۴ می‌داد    |

مورد آخر را تست ایزولاسیون تسک ۲.۷ گرفت — نشت داده نبود، ولی یک عملیات با سه رفتار
متفاوت در API.

---

## ۱۱. وضعیت تست‌ها

### تست‌های واحد (`pnpm test`)

```
۲۴ فایل · ۲۸۶ تست · همه پاس · Prisma با mock
```

| فایل                       | پوشش                                       |
| -------------------------- | ------------------------------------------ |
| `serialize.test.ts`        | تبدیل snake_case، Decimal، BigInt، تاریخ   |
| `validate.test.ts`         | middleware Zod                             |
| `schemas.test.ts`          | تاریخ‌های اختیاری، سقف صفحه‌بندی           |
| `invoiceTotals.test.ts`    | محاسبه‌ی تخفیف و مالیات                    |
| `health.test.ts`           | بوت اپ، ۵۰۳ هنگام قطعی دیتابیس             |
| `security.test.ts`         | هدرهای helmet، rate limit                  |
| `customerRoutes.test.ts`   | سیم‌کشی روت                                |
| `authController.test.ts`   | لاگین از مسیر app_login_lookup، توکن       |
| `workspaceContext.test.ts` | ایزوله بودن context بین درخواست‌های همزمان |
| `prismaExtension.test.ts`  | کوئری بدون context باید خطا بدهد           |
| ۱۳ فایل کنترلر             | CRUD، scope، منطق کسب‌وکار                 |

### تست‌های یکپارچگی (`pnpm test:integration`)

```
۴ فایل · ۴۸ تست (۱ skip) · دیتابیس واقعی dofixo_test
```

| فایل                            | پوشش                                             |
| ------------------------------- | ------------------------------------------------ |
| `smoke.test.ts`                 | اتصال با `dofixo_app`، ۱۹ policy، دو کارگاه      |
| `isolation.test.ts`             | جدول‌محور: ۹ منبع × (فهرست، خواندن، ویرایش، حذف) |
| `isolationSpecialCases.test.ts` | `settings`، ۱۷ کوئری داشبورد، `personnel`        |
| `invoiceNumbering.test.ts`      | شمارنده، استقلال کارگاه‌ها، ۱۰ درخواست همزمان    |

**اضافه کردن منبع REST جدید:** یک خط در آرایه‌ی `resources` در `isolation.test.ts`.
چیزی که در جدول نمی‌گنجد (singleton، aggregate) در `isolationSpecialCases.test.ts`
با توضیح دلیلش.

**آنچه هنوز تست نمی‌شود:** اتمی بودن تراکنش‌ها در حالت شکست، و `PUT /:id` کامل سه
نوع فاکتور.

---

## ۱۲. توصیه برای شروع نشست بعدی

۱. سه فایل `CLAUDE.md`، `Roadmap.md` و `RULES.md` را بفرست
۲. این سند را بفرست
۳. بگو: «تسک ۳.۱ را شروع کنیم»
۴. فایل‌هایی که احتمالاً خواسته می‌شوند: `schema.prisma`، `lib/prisma.ts`،
`middleware/auth.js`، `controllers/authController.ts`، `schemas/auth.ts`،
`routes/auth.ts`، `frontend/src/context/AuthContext.jsx`

### درباره‌ی تسک ۳.۱

**مسئله‌ی اصلی که باید اول حلش کنید:** ثبت‌نام کارگاه و اولین کاربرش را می‌سازد وقتی
هیچ `workspaceId` وجود ندارد. زیر RLS این کار از مسیر عادی ممکن نیست:

- `INSERT` روی `workspaces` برای نقش اپ **مجاز نیست** (عمداً — در مهاجرت ۲.۳ گرفته شد)
- `INSERT` روی `users` هم به policy می‌خورد چون context خالی است

راه پیشنهادی: یک تابع `SECURITY DEFINER` مثل `app_create_workspace(...)` که هر دو را
در یک تراکنش می‌سازد و فقط `workspace_id` و `user_id` را برمی‌گرداند. دقیقاً همان
الگوی `app_login_lookup`، به همان باریکی.

⚠️ این تابع نقطه‌ی حساسی است: هر ورودی‌اش باید قبلاً با Zod اعتبارسنجی شده باشد، و
هرگز نباید چیزی بیشتر از دو شناسه برگرداند.

### ترتیب پیشنهادی فاز ۳

۳.۱ و ۳.۲ با هم (ثبت‌نام) · بعد ۳.۳ تا ۳.۶ با هم (توکن‌ها — جدا کردنی نیستند) ·
بعد ۳.۷ و ۳.۸ (تبدیل middleware به TypeScript) · بعد کار فرانت ۳.۹ تا ۳.۱۱.
