# ایمپورت از Dofixo تک‌مستأجر — راهنمای اپراتور

> انتقال داده‌ی یک تعمیرگاه از نرم‌افزار قدیمی (SQLite) به یک کارگاه در SaaS.
> تسک ۵.۸. اسکریپت: `backend/scripts/import-legacy.ts`
>
> این یک روال دستی است، نه ویژگی. تا وقتی به تعداد انگشتان دست اتفاق بیفتد،
> رابط کاربری برایش ساخته نمی‌شود.

---

## ۰. قبل از هر چیز

🔴 **کارگاه مقصد باید خالی باشد.** اسکریپت خودش بررسی می‌کند و رد می‌شود،
ولی بدان چرا: ایمپورت روی داده‌ی موجود همه‌چیز را دو برابر می‌کند و راه
برگشتی جز بکاپ ندارد.

🔴 **مالک کارگاه را اسکریپت نمی‌سازد.** صاحب تعمیرگاه باید **خودش از رابط
ثبت‌نام کند** تا `populateWorkspace` اجرا شود — ردیف تنظیمات، چهار خدمت
پیش‌فرض، آزمایشی ۳۰ روزه، کد رفرال و کیف پول پیامکی همه از آنجا می‌آیند.

🔴 **بکاپ دستی قبل از شروع.** تنها راه برگشت همین است.

⚠️ **شماره‌های موبایل باید آزاد باشند.** نام کاربری در کل پلتفرم یکتاست. اگر
شماره‌ای از قبل حساب دارد، یا آن حساب باید آزاد شود یا شماره‌ی دیگری انتخاب.

---

## ۱. فایل کاربران

بیرون از مخزن ساخته می‌شود و **هرگز commit نمی‌شود**:

```bash
mkdir -p ~/dofixo-import
chmod 700 ~/dofixo-import
```

```json
[
  { "oldId": 9,  "fullName": "نام مالک",  "username": "09xxxxxxxxx", "password": "", "role": "owner" },
  { "oldId": 11, "fullName": "نام ادمین", "username": "09xxxxxxxxx", "password": "<رمز موقت>", "role": "admin" },
  { "oldId": 5,  "fullName": "نام تکنسین","username": "09xxxxxxxxx", "password": "<رمز موقت>", "role": "technician" }
]
```

```bash
chmod 600 ~/dofixo-import/users.json
```

| فیلد | معنی |
| --- | --- |
| `oldId` | شناسه‌ی کاربر در دیتابیس قدیم — کلید نگاشت واگذاری‌ها |
| `username` | موبایل یازده‌رقمی، با `09` |
| `role` | `owner` \| `admin` \| `technician` |

⚠️ **`owner` ساخته نمی‌شود** ولی خطش لازم است: واگذاری‌های دستگاه به شناسه‌ی
قدیمش اشاره می‌کنند.

⚠️ **کسانی که دیگر کار نمی‌کنند را نیاور.** حساب زنده برای کسی که رفته، بدهی
امنیتی است. واگذاری‌هایشان خودکار رد می‌شود و `plan` تعدادش را می‌گوید.

🔴 **رمزها موقتی‌اند.** بعد از ایمپورت به هر کاربر گفته شود از «تغییر رمز»
عوضش کند.

---

## ۲. روی لپ‌تاپ — گزارش و پردازش عکس

### ۲.۱ گزارش

```bash
cd /Programming/Code/Dofixo/backend

pnpm exec tsx scripts/import-legacy.ts plan \
  --db <path>/repair_system.db \
  --uploads <path>/uploads \
  --users ~/dofixo-import/users.json
```

**هیچ چیزی نمی‌نویسد.** خروجی را با چشم بخوان:

| چه چیزی را نگاه کن | چرا |
| --- | --- |
| «فایل روی دیسک نیست» | باید صفر باشد |
| «عکس یتیم» | باید صفر باشد |
| «به کاربر منتقل‌نشده» | عمدی است یا فراموشی؟ |
| «شناسه‌ای که در مبدأ نیست» | `users.json` غلط است |
| وضعیت دستگاه‌ها | همه در واژگان `utils/deviceStatus.ts` هستند؟ |

⚠️ وضعیتی که فرانت نمی‌شناسد، روی صفحه به‌صورت رشته‌ی خام چاپ می‌شود (باگ
۱۰.۹). `received` پیش‌فرض اسکیمای قدیم است و در هیچ نگاشتی نیست.

### ۲.۲ پردازش عکس‌ها

اول یک نمونه‌ی کوچک و **با چشم ببین**:

```bash
pnpm exec tsx scripts/import-legacy.ts media \
  --db <path>/repair_system.db \
  --uploads <path>/uploads \
  --out ~/dofixo-import/staging \
  --limit 10
```

```bash
xdg-open ~/dofixo-import/staging/1.webp
xdg-open ~/dofixo-import/staging/1-thumb.webp
```

🔴 **دنبال چرخش بگرد.** همان عکس را در مبدأ هم باز کن و مقایسه کن. اگر
مقصد کج است، `.rotate()` کار نکرده و ادامه دادن یعنی هزاران عکس کج.

⚠️ حجم‌ها: عکس کامل ۳۰۰ تا ۹۰۰ کیلوبایت، thumbnail ۱۰ تا ۳۰ کیلوبایت. خیلی
بزرگ‌تر یعنی پروفایل اعمال نشده.

بعد اجرای کامل:

```bash
pnpm exec tsx scripts/import-legacy.ts media \
  --db <path>/repair_system.db \
  --uploads <path>/uploads \
  --out ~/dofixo-import/staging
```

⚠️ **موازی‌سازی پیش‌فرض ۳ است.** بالاتر نبر مگر رم آزاد داشته باشی: هر عکس
۴۸ مگاپیکسلی حدود ۲۰۰ مگابایت برای دیکد می‌گیرد.

⚠️ **قابل ازسرگیری است.** `Ctrl+C` بی‌خطر است؛ همان دستور را دوباره بزن.

⚠️ **staging روی `/tmp` نگذار** اگر `tmpfs` است — روی رم می‌نشیند.

خطاها با نام فایل گزارش می‌شوند. فایل خراب قابل بازیابی نیست؛ دستگاهش بدون
عکس منتقل می‌شود.

---

## ۳. تمرین روی لوکال

🔴 **این مرحله را رد نکن.** اولین اجرای واقعی نباید روی داده‌ی مشتری باشد.

```bash
# کارگاه تازه از رابط بساز، شناسه‌اش را بگیر
docker compose exec -T postgres psql -U dofixo -d dofixo_dev \
  -c "SELECT id, name FROM workspaces ORDER BY id;"

pnpm exec tsx scripts/import-legacy.ts apply \
  --db <path>/repair_system.db \
  --staging ~/dofixo-import/staging \
  --users ~/dofixo-import/users.json \
  --workspace-id <N> --dry-run
```

بعد بدون `--dry-run`، و بررسی:

```bash
docker compose exec -T postgres psql -U dofixo -d dofixo_dev -c "
SELECT
  (SELECT count(*) FROM users      WHERE workspace_id = <N>) AS users,
  (SELECT count(*) FROM customers  WHERE workspace_id = <N>) AS customers,
  (SELECT count(*) FROM devices    WHERE workspace_id = <N>) AS devices,
  (SELECT count(*) FROM device_images WHERE workspace_id = <N>) AS images,
  (SELECT device_seq FROM workspaces WHERE id = <N>) AS device_seq;

SELECT min(reception_number), max(reception_number),
       count(DISTINCT reception_number)
FROM devices WHERE workspace_id = <N>;"
```

و در مرورگر: ورود با یکی از حساب‌های تازه · فهرست دستگاه‌ها · یک مودال با
عکس · صفحه‌ی یک مشتری · تنظیمات.

---

## ۴. روی پروداکشن

### ۴.۱ آزاد کردن شماره‌ی مالک

اگر شماره از قبل حساب دارد:

```bash
cd ~/dofixo
alias dc='docker compose -f docker-compose.prod.yml --env-file .env.prod'

dc exec -T postgres psql -U dofixo -d dofixo -c "
SELECT u.id, u.username, u.workspace_id, w.name
FROM users u JOIN workspaces w ON w.id = u.workspace_id
WHERE u.username = '09xxxxxxxxx';"
```

**سنگ‌قبر، نه حذف:**

```bash
dc exec -T postgres psql -U dofixo -d dofixo -c "
UPDATE users SET username = username || '-old', is_active = false
WHERE workspace_id = <OLD>;

UPDATE workspaces SET status = 'deleted', deleted_at = now()
WHERE id = <OLD>;"
```

🔴 **چرا حذف کامل نه:** نقش اپ روی `payments` و `subscription_events` مجوز
`DELETE` ندارد — عمدی، چون دفتری که پاک شود دفتر نیست. سنگ‌قبر همان کاری است
که cron فاز ۸.۷ می‌کند.

⚠️ اگر داده‌ی آن کارگاه هم باید برود، `utils/workspaceDeletion.ts` را
استفاده کن، نه `DELETE` دستی: بیست جدول با `Restrict` به هم وصل‌اند و
عکس‌های آروان باید **قبل** از ردیف‌ها بروند، وگرنه کلیدها برای همیشه گم
می‌شوند و فضا تا ابد هزینه می‌دهد.

### ۴.۲ بکاپ

```bash
cd ~/dofixo && ./backup-database.sh
```

🔴 باید `done (daily, N backups before this run)` ببینی.

### ۴.۳ ثبت‌نام مالک

از مرورگر، `https://app.dofixo.ir` → ثبت‌نام. پیامک واقعی می‌رود.

```bash
dc exec -T postgres psql -U dofixo -d dofixo \
  -c "SELECT id, name, created_at FROM workspaces ORDER BY id DESC LIMIT 3;"
```

### ۴.۴ انتقال فایل‌ها

```bash
# از لپ‌تاپ
rsync -P -r ~/dofixo-import/staging/ dofixo:~/import-staging/
rsync -P <path>/repair_system.db dofixo:~/import-staging/
rsync -P ~/dofixo-import/users.json dofixo:~/import-staging/
```

⚠️ **`rsync -P` نه `scp`** — قابل ادامه است. staging حدود ۱ تا ۲ گیگ است.

⚠️ `users.json` رمز دارد. بعد از ایمپورت پاکش کن.

### ۴.۵ اجرا داخل کانتینر

🔴 **از سرویس `migrate`، نه `backend`.** دو دلیل:
`better-sqlite3` یک devDependency است و در ایمیج `backend` وجود ندارد؛ و
`DATABASE_URL` عمداً فقط در `migrate` هست، که `takenUsernames` به آن نیاز
دارد.

⚠️ سرویس `migrate` باید پوشه‌ی `~/import-staging` را mount داشته باشد. اگر
ندارد، یک volume موقت به `docker-compose.prod.yml` اضافه کن و بعد از کار
برش دار.

```bash
dc --profile tooling run --rm \
  -v ~/import-staging:/import \
  migrate \
  pnpm exec tsx scripts/import-legacy.ts plan \
    --db /import/repair_system.db \
    --uploads /import/uploads \
    --users /import/users.json
```

بعد `--dry-run`، بعد اجرای واقعی:

```bash
dc --profile tooling run --rm \
  -v ~/import-staging:/import \
  migrate \
  pnpm exec tsx scripts/import-legacy.ts apply \
    --db /import/repair_system.db \
    --staging /import/staging \
    --users /import/users.json \
    --workspace-id <N>
```

⚠️ **اگر آپلود وسط کار قطع شد**، همان دستور با `--images-only` ادامه می‌دهد.
ردیف‌ها دوباره نوشته نمی‌شوند.

### ۴.۶ تأیید

```bash
dc exec -T postgres psql -U dofixo -d dofixo -c "
SELECT
  (SELECT count(*) FROM users      WHERE workspace_id = <N>) AS users,
  (SELECT count(*) FROM customers  WHERE workspace_id = <N>) AS customers,
  (SELECT count(*) FROM devices    WHERE workspace_id = <N>) AS devices,
  (SELECT count(*) FROM device_images WHERE workspace_id = <N>) AS images,
  (SELECT device_seq FROM workspaces WHERE id = <N>) AS device_seq;"
```

در مرورگر:

| # | کار | چه چیزی را ثابت می‌کند |
| --- | --- | --- |
| ۱ | ورود با حساب یک تکنسین | هش رمز و نقش درست نوشته شده |
| ۲ | فهرست دستگاه‌ها | شماره‌ی پذیرش از ۱ شروع می‌شود |
| ۳ | مودال یک دستگاه با عکس | آروان، thumbnail، presigned URL |
| ۴ | صفحه‌ی یک مشتری | رابطه‌ی مشتری و دستگاه |
| ۵ | صفحه‌ی یک پرسنل | واگذاری‌ها |
| ۶ | تنظیمات | نام و تلفن شرکت |
| ۷ | **ثبت یک دستگاه تازه** | شماره‌ی بعدی می‌گیرد، نه تکراری |

🔴 مورد ۷ مهم‌ترین است: اگر `deviceSeq` درست ست نشده باشد، اولین دستگاه
واقعی با شماره‌ی تکراری برخورد می‌کند.

### ۴.۷ تمیزکاری

```bash
ssh dofixo 'rm -rf ~/import-staging'
```

⚠️ `users.json` رمز دارد. و volume موقتی که به compose اضافه کردی را بردار.

---

## ۵. بعد از ایمپورت

- [ ] به هر کاربر گفته شود رمزش را عوض کند
- [ ] لوگوی شرکت از صفحه‌ی تنظیمات آپلود شود (ایمپورت نمی‌شود — پروفایل
      تصویر تنظیمات فرق دارد و یک بار آپلود دستی ساده‌تر است)
- [ ] اگر اعلان پیامکی می‌خواهند: کیف پول شارژ و تنظیمات روشن شود
- [ ] یک خروجی داده بگیر و برگه‌ی «دستگاه‌ها» را باز کن

⚠️ **هیچ پیامکی موقع ایمپورت نمی‌رود** — اسکریپت مستقیم با Prisma می‌نویسد و
از کنترلر دستگاه رد نمی‌شود، و `smsCustomerNotificationsEnabled` هم پیش‌فرض
`false` است. ولی این را بدان: اگر روزی کسی ایمپورت را از مسیر کنترلر بنویسد،
۳۰۰ مشتری یک‌باره پیامک «دستگاه شما پذیرش شد» می‌گیرند.

---

## ۶. اگر چیزی خراب شد

**فاز ردیف‌ها شکست:** تراکنش همه را برگردانده. چیزی نوشته نشده و می‌شود
دوباره زد.

**فاز عکس‌ها وسط کار شکست:** ردیف‌ها سر جایشان‌اند. با `--images-only`
ادامه بده.

**ایمپورت تمام شد ولی داده غلط است:** بازیابی از بکاپ ۴.۲ تنها راه است —
`ops/restore-database.md`. هر داده‌ای که بعد از آن بکاپ ساخته شده از دست
می‌رود، که دلیل انجام ایمپورت در ساعت خلوت است.

⚠️ حذف دستی کارگاه ایمپورت‌شده با `DELETE` **کار نمی‌کند** (کلیدهای
`Restrict`). `utils/workspaceDeletion.ts` را استفاده کن.
