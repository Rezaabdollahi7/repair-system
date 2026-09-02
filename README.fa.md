<div align="center">

# 🔧 Dofixo

### مدیریت چندمستاجره تعمیرگاه‌ها، ساخته‌شده برای کارگاه‌های ایرانی

[![React](https://img.shields.io/badge/React-19-blue)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-26-green)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791)](https://www.postgresql.org/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748)](https://www.prisma.io/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-4-06B6D4)](https://tailwindcss.com/)

[English](./README.md) | [فارسی](./README.fa.md)

**نسخه زنده:** [app.dofixo.ir](https://app.dofixo.ir) · **وب‌سایت معرفی:** [dofixo.ir](https://dofixo.ir)

</div>

---

## 📋 درباره پروژه

**Dofixo** یک پلتفرم SaaS میزبانی‌شده و چندمستاجره برای کارگاه‌های تعمیراتی کوچک است؛ از تعمیر موبایل و لپ‌تاپ گرفته تا لوازم خانگی. هر تعمیرگاه ثبت‌نام می‌کند، فضای کاری ایزوله خودش را دریافت می‌کند و تمام عملیات خود را از پذیرش دستگاه تا صدور فاکتور و گزارش‌های مالی مدیریت می‌کند.

رابط کاربری به‌طور کامل فارسی است: چیدمان RTL، تاریخ جلالی، اعداد فارسی و مبالغ ریالی.

این مخزن در ابتدا یک برنامه تک‌مستاجره بود که با SQLite و در یک شبکه محلی اجرا می‌شد. اکنون به یک پلتفرم چندمستاجره مبتنی بر PostgreSQL با امنیت در سطح سطر، ثبت‌نام تأییدشده با پیامک، ذخیره‌سازی آبجکت، صورتحساب اشتراک و بکاپ‌های شبانه رمزنگاری‌شده تبدیل شده است.

---

## 🏢 چندمستاجره بودن

ایزوله‌سازی، مهم‌ترین محدودیت طراحی این کدبیس است. این موضوع در دو لایه مستقل پیاده‌سازی شده و هیچ‌کدام جایگزین دیگری نیست:

**۱. فیلتر در لایه برنامه.** هر جدول وابسته به مستاجر دارای `workspaceId` است. یک Prisma Client Extension آن را به تمام کوئری‌ها اضافه می‌کند تا هیچ کنترلری نتواند آن را فراموش کند.

**۲. Row-Level Security در PostgreSQL.** هر جدول وابسته به مستاجر دارای سیاست `workspace_isolation` است که مقدار `app.workspace_id` را از session می‌خواند. بنابراین حتی کوئری‌ای که از Extension عبور کرده باشد نیز داده‌ای برنمی‌گرداند.

شناسه Workspace از JWT تأییدشده — و هرگز از body یا query parameter درخواست — از طریق `AsyncLocalStorage` به یک `set_config()` روی اتصال منتقل می‌شود:

```text
requestContext (middleware) → opens AsyncLocalStorage
authenticate                → setContextWorkspaceId(payload.workspaceId)
Prisma extension            → set_config('app.workspace_id', id, TRUE)
```

اگر Context وجود نداشته باشد، Extension خطا می‌دهد تا RLS به‌صورت بی‌صدا صفر ردیف برنگرداند؛ پاسخ اشتباه از خطا بدتر است.

**دو نقش دیتابیس، عمداً.** برنامه با نقش `dofixo_app` متصل می‌شود که مالک هیچ جدولی نیست. در PostgreSQL، مالک جدول می‌تواند RLS را **دور بزند**؛ بنابراین اطلاعات مالک فقط در کانتینر Migration وجود دارد و هرگز در محیط پردازشی که درخواست‌ها را پاسخ می‌دهد قرار نمی‌گیرد.

**سه تابع `SECURITY DEFINER`** به‌عنوان مسیرهای کنترل‌شده و آگاهانه برای عبور از RLS تعریف شده‌اند: `app_login_lookup`، `app_create_workspace` و `app_refresh_lookup`. هرکدام به این دلیل وجود دارند که فراخواننده هنوز Context مربوط به Workspace ندارد.

---

## ✨ امکانات

### 🏪 Workspace و شروع کار

- ثبت‌نام سلف‌سرویس با تأیید پیامکی (OTP)
- نام کاربری همان شماره موبایل است؛ یک هویت، تأییدشده از همان ابتدا
- ۳۰ روز دوره آزمایشی رایگان، بدون محدودیت امکانات و بدون نیاز به کارت
- تنظیمات، برندینگ و شمارنده‌های فاکتور اختصاصی برای هر Workspace

### 💳 اشتراک و پرداخت

- سه پلن: ۹۰ روزه، ۱۸۰ روزه و ۴۲۵ روزه
- درگاه پرداخت زیبال با محاسبه قیمت در سمت سرور
- کدهای تخفیف درصدی یا مبلغ ثابت؛ بیشترین تخفیف اعمال می‌شود و تخفیف‌ها با هم جمع نمی‌شوند
- سیستم معرفی: تعمیرگاه دعوت‌شده تخفیف می‌گیرد و معرف روزهای اضافه دریافت می‌کند
- رسید پرداخت قابل چاپ با شماره مرجع درگاه
- حالت فقط‌خواندنی پس از پایان اشتراک: ۳ روز مهلت، سپس خواندن مجاز است و عملیات نوشتن با `402` پاسخ داده می‌شود؛ اشتراک منقضی‌شده «ممنوع» نیست
- Job شبانه برای یادآوری‌ها، تغییر وضعیت‌ها، حذف داده‌ها و تسویه پرداخت‌ها

### 📋 مدیریت دستگاه‌ها

- ثبت سریع دستگاه با شماره پذیرش اتمیک
- جستجو بر اساس شماره پذیرش، مشتری، برند یا مدل
- فیلتر بر اساس وضعیت، بازه زمانی و تکنسین مسئول
- گردش وضعیت: Pending → Diagnosing → Repairing → Repaired → Delivered
- تخصیص تکنسین همراه با تاریخچه
- آپلود تصویر با چرخش آگاه از EXIF، تغییر اندازه و Thumbnail
- اسلایدر تمام‌صفحه تصاویر

### 👥 مدیریت مشتریان

- پروفایل مشتری همراه با تاریخچه کامل تعمیرات
- آمار هر مشتری: تعداد دستگاه‌ها، تعمیرات موفق و میانگین زمان تعمیر
- جستجوی سریع با نام یا شماره تلفن

### 👨‍🔧 پرسنل و نقش‌ها

- سه نقش: مدیر ارشد، مدیر و تکنسین
- فعال و غیرفعال‌سازی بدون حذف
- اعمال سطح دسترسی در سطح Route و رابط کاربری

### 📦 انبار

- کاتالوگ قطعات با کد، نام، دسته‌بندی و واحد
- رهگیری لحظه‌ای موجودی با هشدار کمبود موجودی
- میانگین موزون قیمت خرید
- خرید سریع و فروش سریع از صفحه جزئیات کالا
- تاریخچه کامل تراکنش‌های هر کالا

### 🧾 فاکتورها

سه نوع فاکتور که هرکدام شمارنده اتمیک مخصوص خود را دارند (`PUR-0001`، `SAL-0001` و `REP-0001`):

- **فاکتور خرید** — خرید از تأمین‌کننده، افزایش خودکار موجودی و رهگیری پرداخت
- **فاکتور فروش** — فروش مستقیم قطعات، اعتبارسنجی موجودی، قیمت پیشنهادی و قالب قابل چاپ (A4 / A5 / حرارتی)
- **فاکتور تعمیر** — متصل به یک دستگاه، سه نوع آیتم (موجودی، خدمات و سفارشی)، تخفیف و مالیات، مدت گارانتی، تاریخچه پرداخت و قابلیت چاپ همراه با لوگو، مهر و امضا

### 📊 داشبورد و گزارش‌ها

- KPIهای لحظه‌ای: دستگاه‌ها، درآمد و سود
- توزیع وضعیت دستگاه‌ها و نمای کلی موجودی
- خلاصه‌های مالی ماهانه و روزانه
- گزارش سود و زیان هر کالا با فیلتر تاریخ
- گزارش موجودی با فیلتر دسته‌بندی
- گزارش تراکنش‌ها

### 📤 خروجی داده‌ها

- خروجی کامل Workspace: یک فایل Excel هفت‌شیت به‌همراه فایل ZIP شامل تمام تصاویر دستگاه‌ها
- ساخت در پس‌زمینه؛ تعمیرگاهی با هزار دستگاه ممکن است چند دقیقه زمان نیاز داشته باشد، بیشتر از زمانی که هر reverse proxy یک اتصال را باز نگه می‌دارد
- دانلود از طریق Presigned URL با زمان اعتبار محدود

### 🎨 رابط کاربری

- کاملاً فارسی و RTL، همراه با تقویم جلالی و اعداد فارسی
- تم روشن و تاریک
- سایدبار جمع‌شونده، دکمه عملیات شناور و مودال‌های تأیید
- واکنش‌گرا از موبایل تا دسکتاپ

---

## 🔐 امنیت

| بخش | رویکرد |
| --- | --- |
| **ایزوله‌سازی مستاجر** | فیلتر `workspaceId` **و** PostgreSQL RLS، به‌صورت مستقل |
| **نقش دیتابیس** | برنامه با نقشی غیرمالک اجرا می‌شود که نمی‌تواند RLS را دور بزند |
| **Access Token** | JWT، ۱۵ دقیقه، فقط در حافظه صفحه — هرگز در `localStorage` |
| **Refresh Token** | ۳۰ روز، راز تصادفی ۳۲ بایتی (نه JWT)، ذخیره‌شده به‌صورت SHA-256 Hash |
| **چرخش توکن** | استفاده مجدد از توکن لغوشده تمام Sessionهای آن کاربر را نامعتبر می‌کند |
| **Cookieها** | `httpOnly`، `SameSite=Strict`، `Path=/api/auth` و `Secure` در Production |
| **رمز عبور** | bcrypt |
| **اعتبارسنجی ورودی** | Zod Schema برای تمام Routeها؛ Handlerها از `req.valid` می‌خوانند، نه `req.body` |
| **Rate Limiting** | سقف‌های مستقل برای ورود، OTP و ترافیک عمومی API |
| **Object Storage** | Bucketهای خصوصی و Presigned URL امضاشده برای هر درخواست پس از Scope شدن Row |
| **Headerها** | `helmet` با `Referrer-Policy` برابر `strict-origin-when-cross-origin` |
| **Secrets** | `JWT_SECRET`، `DATABASE_URL_APP` و API Keyها در صورت نبودن هنگام Import خطا می‌دهند — بدون مقدار پیش‌فرض |
| **Backupها** | `pg_dump` شبانه، رمزنگاری با `age` و آپلود در Object Storage |

**هیچ مقدار پیش‌فرضی، هیچ‌جا وجود ندارد.** نبودن یک Secret باعث توقف برنامه هنگام Boot می‌شود. جایگزین آن برنامه‌ای است که اجرا می‌شود، ثبت‌نام می‌پذیرد و دقیقاً در مهم‌ترین درخواست ممکن شکست می‌خورد.

---

## ⚙️ فناوری‌های استفاده‌شده

### Backend

```text
Node 26 · TypeScript 5.9 · Express 5 · pnpm 10
Prisma 7 + @prisma/adapter-pg + pg 8 · PostgreSQL 17
Zod 4 · helmet 8 · express-rate-limit 8 · cookie-parser
@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner
bcryptjs · jsonwebtoken · multer · sharp · jalaali-js · archiver 7
Jest 30 + ts-jest + supertest
```

### Frontend

```text
React 19 · Vite 8 · React Router 7 · Tailwind 4 · TypeScript 5.9
Axios · react-hot-toast · react-to-print · jalaali-js · @heroicons/react
```

### Infrastructure

```text
Docker Compose · Caddy (تنها سرویسی که پورت منتشر می‌کند)
S3-compatible object storage (Bucketهای خصوصی)
sms.ir (OTP و اعلان‌ها) · Zibal (پرداخت‌ها)
age (رمزنگاری Backup) · s3cmd
```

---

## 🏗️ ساختار پروژه

```text
Dofixo/
├── backend/
│   ├── prisma/
│   │   ├── migrations/        14 migration
│   │   ├── schema.prisma      30 model
│   │   ├── rls-check.sql      یافتن جدول‌های فاقد سیاست RLS
│   │   └── seed.ts            فقط برای محیط توسعه
│   ├── src/
│   │   ├── lib/               prisma · storage · workspaceContext
│   │   │                      sms · zibal · imageProfile
│   │   ├── controllers/       16 controller
│   │   ├── routes/            مسیرهای REST
│   │   ├── middleware/        auth · authorize · requestContext
│   │   │                      validate · subscription
│   │   ├── schemas/           Zod schema برای هر resource
│   │   ├── scripts/           subscriptionCron.ts
│   │   ├── utils/             subscription · pricing · referral
│   │   │                      workspaceDeletion · jalali · export/
│   │   └── __tests__/         unit suites + integration/
│   ├── Dockerfile             multi-stage: runtime + tooling targets
│   └── Dockerfile.dev
│
├── frontend/
│   ├── src/
│   │   ├── api/               Axios client با refresh interception
│   │   ├── components/        29 component
│   │   ├── context/           Auth · Modal · Subscription · Theme
│   │   ├── pages/             19 page
│   │   ├── types/             api.ts شکل تمام endpointها را توصیف می‌کند
│   │   └── utils/
│   ├── Dockerfile             nginx-unprivileged
│   └── nginx.conf
│
├── ops/
│   ├── backup-database.sh     بکاپ شبانه رمزنگاری‌شده
│   ├── subscription-cron.sh   job شبانه اشتراک
│   ├── extract-workspace.sh   استخراج یک Workspace از Backup
│   ├── reset-password.sh      بازیابی حساب اپراتور
│   └── *.md                   runbookها
│
├── docker-compose.yml         development
├── docker-compose.prod.yml    production
└── Caddyfile
```

**Frontend کاملاً TypeScript است.** گزینه `allowJs` بسته است؛ یک فایل `.js` جدید زیر `src/` یک خطای Compile محسوب می‌شود. دستور `tsc --noEmit` درون `pnpm build` اجرا می‌شود و این تنها Gate خودکار Frontend است.

---

## 🚀 راه‌اندازی محیط توسعه

### پیش‌نیازها

- Docker و Docker Compose v2
- Node.js 20+ و pnpm (برای اجرای دستورها خارج از کانتینر)

### شروع کار

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

Frontend روی `http://localhost:5173` و API روی `http://localhost:5001` اجرا می‌شوند.

Seed یک Workspace و یک مدیر ارشد را از `SEED_ADMIN_USERNAME` و `SEED_ADMIN_PASSWORD` ایجاد می‌کند. این Seed هرگز در Production اجرا نمی‌شود؛ در آنجا `migrate deploy` کافی است و سه نقش به‌عنوان داده مرجع داخل یک Migration منتشر می‌شوند.

### دستورهای کاربردی

```bash
# Tests
cd backend

pnpm test              # unit suites, mocked
pnpm test:integration  # نیازمند Postgres و دیتابیس dofixo_test
pnpm test:all          # هر دو

# Quality gates
pnpm lint && pnpm build

# After adding a dependency, rebuild — a plain restart keeps the old
# node_modules, because an anonymous volume shadows /app/node_modules
docker compose up -d --build --renew-anon-volumes backend

# After a migration
docker compose exec backend pnpm prisma generate
```

⚠️ مقدار `DATABASE_URL` باید از `127.0.0.1` استفاده کند، نه `localhost`. Prisma 7 به Driver Adapter نیاز دارد و این دو به شکل متفاوتی Resolve می‌شوند.

---

## 🧪 تست

**تست‌های واحد Backend** دیتابیس را Mock می‌کنند و Controllerها، Schemaها، قیمت‌گذاری، زمان‌بندی اشتراک، Clientهای SMS و Zibal و Middleware احراز مجوز را پوشش می‌دهند.

**تست‌های Integration** در برابر PostgreSQL واقعی اجرا می‌شوند و مواردی را ثابت می‌کنند که Mock قادر به اثبات آن‌ها نیست: ایزوله‌سازی مستاجر در تمام REST Resourceها، شماره‌گذاری فاکتور در شرایط هم‌زمانی، چرخش توکن، ثبت‌نام، پاداش معرفی و چرخه کامل پرداخت.

یک REST Resource جدید فقط به یک خط در جدول `resources` در `isolation.test.ts` نیاز دارد، نه چهار تست جدید. مواردی که در این ساختار نمی‌گنجند (Singletonها و Aggregateها) در `isolationSpecialCases.test.ts` قرار می‌گیرند و باید توضیحی درباره دلیل آن داشته باشند.

⚠️ Frontend هنوز زیرساخت تست خودکار ندارد. TypeScript تنها Gate آن است.

---

## 📡 نمای کلی API

تمام Routeها با `/api` شروع می‌شوند و به‌جز موارد مشخص‌شده، به Bearer Token نیاز دارند.

| گروه | مسیرها |
| --- | --- |
| **Auth** | `login` · `register` · `send-otp` · `reset-password` · `refresh` · `logout` · `me` · `change-password` |
| **Devices** | CRUD · تصاویر · تخصیص‌ها |
| **Customers** | CRUD · دستگاه‌ها · آمار |
| **Personnel** | CRUD · تغییر وضعیت فعال |
| **Items** | CRUD · جستجو · کمبود موجودی · تراکنش‌ها · خرید/فروش سریع |
| **Categories · Services** | CRUD |
| **Invoices** | `purchase-invoices` · `sale-invoices` · `repair-invoices` (+ پرداخت‌ها، وضعیت) |
| **Reports** | داشبورد · موجودی · خریدها · فروش‌ها · سود |
| **Settings** | خواندن · بروزرسانی · آپلود تصویر |
| **Exports** | درخواست · فهرست · دانلود |
| **Subscription** | وضعیت · پیش‌فاکتور · پرداخت · تأیید · پرداخت‌ها · معرفی |

هر Handler ورودی خود را با یک Zod Schema از طریق Middleware `validate()` اعتبارسنجی می‌کند و از `req.valid` می‌خواند. `workspaceId` و `role` همیشه از JWT تأییدشده دریافت می‌شوند.

---

## 🚢 استقرار

Production به‌صورت چهار کانتینر روی یک Host اجرا می‌شود: Postgres، Backend، Frontend و Caddy. Caddy تنها سرویسی است که پورت منتشر می‌کند. سرویس پنجم با نام `migrate` پشت یک Compose Profile قرار دارد و هرگز هم‌زمان با API اجرا نمی‌شود؛ این تنها جایی است که اطلاعات مالک دیتابیس در آن وجود دارد.

Imageها روی یک Workstation ساخته و با `docker save` منتقل می‌شوند، زیرا Host محیط Production به Docker Hub یا npm دسترسی ندارد.

Runbook عملیاتی در `DEPLOY.md` قرار دارد که خارج از Version Control نگهداری می‌شود.

`HANDOFF.md` مرجع اصلی وضعیت پروژه، تصمیم‌های معماری و دلایل پشت آن‌ها است.

---

## 📊 وضعیت پروژه

| مرحله | وضعیت |
| --- | --- |
| 0 — زیرساخت و ابزارها | ✅ |
| 1 — SQLite → PostgreSQL | ✅ |
| 2 — چندمستاجره بودن | ✅ |
| 3 — بازنویسی احراز هویت | ✅ |
| 4 — Object Storage | ✅ |
| 5 — Backup و خروجی داده | ✅ |
| OTP — تأیید پیامکی | ✅ |
| 7 — استقرار | ✅ |
| 8 — اشتراک و پرداخت‌ها | ✅ |
| 9 — یکپارچگی رابط کاربری | ⬜ |
| 10 — رفع باگ‌های Frontend | ⬜ |

---

## 👨‍💻 سازنده

**توسعه‌دهنده:** Reza Abdollahi

**ایمیل:** srezaabdollahi7@gmail.com

**GitHub:** [@Rezaabdollahi7](https://github.com/Rezaabdollahi7)

---

<div align="center">

**وضعیت:** در حال اجرا در محیط Production

</div>
