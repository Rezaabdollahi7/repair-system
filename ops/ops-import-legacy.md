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

🔴 **ایمیج‌های پروداکشن باید به‌روز باشند — کامیت‌شده یعنی مستقر نشده.**
ایمپورت اول بار با ایمیج‌هایی اجرا شد که سه هفته عقب بودند: مهاجرت ۲.۹ روی
پروداکشن نبود، و بعد از رفع آن، فرانت هنوز `devices.id` را به‌جای شماره‌ی
پذیرش نشان می‌داد. قبل از شروع، هر سه ایمیج را بساز و منتقل کن، و بررسی کن:

```bash
dc --profile tooling run --rm migrate pnpm exec prisma migrate status
```

باید بگوید همه‌ی مهاجرت‌ها اعمال شده‌اند.

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
  {
    "oldId": 9,
    "fullName": "نام مالک",
    "username": "09xxxxxxxxx",
    "password": "",
    "role": "owner"
  },
  {
    "oldId": 11,
    "fullName": "نام ادمین",
    "username": "09xxxxxxxxx",
    "password": "<رمز موقت>",
    "role": "admin"
  },
  {
    "oldId": 5,
    "fullName": "نام تکنسین",
    "username": "09xxxxxxxxx",
    "password": "<رمز موقت>",
    "role": "technician"
  }
]
```

```bash
chmod 600 ~/dofixo-import/users.json
```

| فیلد       | معنی                                                  |
| ---------- | ----------------------------------------------------- |
| `oldId`    | شناسه‌ی کاربر در دیتابیس قدیم — کلید نگاشت واگذاری‌ها |
| `username` | موبایل یازده‌رقمی، با `09`                            |
| `role`     | `owner` \| `admin` \| `technician`                    |

⚠️ **`owner` ساخته نمی‌شود** ولی خطش لازم است: واگذاری‌های دستگاه به شناسه‌ی
قدیمش اشاره می‌کنند.

⚠️ **نام مالک از ثبت‌نام می‌آید، نه از این فایل.** رابط ثبت‌نام `fullName` را
«مدیر» می‌گذارد و اسکریپت آن ردیف را لمس نمی‌کند. بعد از ایمپورت از صفحه‌ی
پرسنل اصلاحش کن.

⚠️ **کسانی که دیگر کار نمی‌کنند را نیاور.** حساب زنده برای کسی که رفته، بدهی
امنیتی است. واگذاری‌هایشان خودکار رد می‌شود و `plan` تعدادش را می‌گوید.

🔴 **رمزها موقتی‌اند.** بعد از ایمپورت به هر کاربر گفته شود از «تغییر رمز»
عوضش کند.

---

## ۲. روی لپ‌تاپ — گزارش، عکس‌ها و خروجی JSON

### ۲.۱ گزارش

```bash
cd /Programming/Code/Dofixo/backend

pnpm exec tsx scripts/import-legacy.ts plan \
  --db <path>/repair_system.db \
  --uploads <path>/uploads \
  --users ~/dofixo-import/users.json
```

**هیچ چیزی نمی‌نویسد.** خروجی را با چشم بخوان:

| چه چیزی را نگاه کن         | چرا                                          |
| -------------------------- | -------------------------------------------- |
| «فایل روی دیسک نیست»       | باید صفر باشد                                |
| «عکس یتیم»                 | باید صفر باشد                                |
| «به کاربر منتقل‌نشده»      | عمدی است یا فراموشی؟                         |
| «شناسه‌ای که در مبدأ نیست» | `users.json` غلط است                         |
| وضعیت دستگاه‌ها            | همه در واژگان `utils/deviceStatus.ts` هستند؟ |

⚠️ وضعیتی که فرانت نمی‌شناسد، روی صفحه به‌صورت رشته‌ی خام چاپ می‌شود (باگ
۱۰.۹). `received` پیش‌فرض اسکیمای قدیم است و در هیچ نگاشتی نیست.

⚠️ **اعداد این گزارش را یادداشت کن.** در `--dry-run` روی پروداکشن دوباره
می‌بینی‌شان و باید یکی باشند.

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

### ۲.۳ خروجی JSON برای سرور

روی سرور `sqlite3` نصب نیست و لازم هم نیست — `apply` آنجا از JSON می‌خواند.
پنج فایل را روی لپ‌تاپ بساز:

```bash
DB=<path>/repair_system.db
OUT=~/dofixo-import

sqlite3 -readonly -json "$DB" \
  "SELECT id, name, phone, created_at FROM customers ORDER BY id" \
  > "$OUT/customers.json"

sqlite3 -readonly -json "$DB" \
  "SELECT id, customer_id, device_name, brand, model, serial_number,
          entry_date, exit_date, status, description, needs_invoice,
          created_at, updated_at FROM devices ORDER BY id" \
  > "$OUT/devices.json"

sqlite3 -readonly -json "$DB" \
  "SELECT id, device_id, filename, sort_order, created_at
   FROM device_images ORDER BY id" \
  > "$OUT/images.json"

sqlite3 -readonly -json "$DB" \
  "SELECT device_id, personnel_id, assigned_at FROM device_assignments" \
  > "$OUT/assignments.json"

sqlite3 -readonly -json "$DB" \
  "SELECT company_name, company_address, company_phone,
          company_email, company_website FROM settings LIMIT 1" \
  > "$OUT/settings.json"
```

⚠️ **نام ستون‌ها باید دقیقاً همین‌ها باشند.** `readFromJson` کلیدهای خام
SQLite را انتظار دارد تا شکل خروجی با `readFromSqlite` یکی باشد و هیچ کدی
پایین‌دست نفهمد از کدام مسیر آمده.

⚠️ `-readonly` احتیاط نیست: دیتابیس مبدأ تنها نسخه‌ی تاریخچه‌ی یک تعمیرگاه
کاری است، و دستوری که بتواند بنویسد دستوری است که بتواند خرابش کند.

اندازه‌ی فایل‌ها را نگاه کن — فایل خالی یعنی کوئری چیزی برنگرداند.

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

⚠️ **مسیر لوکال از SQLite می‌خواند و مسیر سرور از JSON.** هر دو به یک شکل
داده می‌رسند، ولی اگر خواستی مسیر سرور را هم تمرین کنی، اینجا `--json` بده
به‌جای `--db`.

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

⚠️ اسکریپت نسخه‌ی محلی نگه نمی‌دارد و مستقیم به آروان می‌فرستد. `s3cmd` خام
روی سرور پیکربندی ندارد و خطا می‌دهد؛ خود اسکریپت پیکربندی جداگانه دارد، پس
با `s3cmd` دستی وقت تلف نکن.

### ۴.۳ ثبت‌نام مالک

از مرورگر، `https://app.dofixo.ir` → ثبت‌نام. پیامک واقعی می‌رود.

🔴 **بعد از ثبت‌نام هیچ چیزی وارد نکن** — نه دستگاه، نه مشتری، حتی آزمایشی.
محافظ «کارگاه خالی» جلوی ایمپورت را می‌گیرد.

```bash
dc exec -T postgres psql -U dofixo -d dofixo \
  -c "SELECT id, name, status, created_at FROM workspaces ORDER BY id DESC LIMIT 3;"
```

### ۴.۴ انتقال فایل‌ها

```bash
# از لپ‌تاپ
rsync -P -r ~/dofixo-import/staging/ dofixo:~/import-staging/staging/
rsync -P ~/dofixo-import/*.json dofixo:~/import-staging/
```

⚠️ **فایل `.db` لازم نیست.** سرور از JSON می‌خواند.

⚠️ **`rsync -P` نه `scp`** — قابل ادامه است. staging حدود ۱ تا ۲ گیگ است.

⚠️ `users.json` رمز دارد. بعد از ایمپورت پاکش کن.

### ۴.۵ اجرا داخل کانتینر

🔴 **از سرویس `migrate`، نه `backend`.** سه دلیل: `migrate` تنها کانتینری
است که `scripts/` و `tsx` را دارد (ایمیج `backend` فقط `dist` است)؛
`DATABASE_URL` عمداً فقط آنجاست و `takenUsernames` به آن نیاز دارد؛ و
متغیرهای `S3_*` برای فاز آپلود در `environment` همان سرویس نشسته‌اند.

🔴 **ایمیجش باید تازه باشد.** قبل از هر چیز:

```bash
dc --profile tooling run --rm migrate ls -la /app/scripts /app/src/lib
```

اگر تاریخ فایل‌ها از آخرین build عقب‌تر است، ایمیج کهنه است — `docker run`
همیشه چیزی اجرا می‌کند و هیچ‌وقت خودش نمی‌گوید تگ قدیمی است.

⚠️ سرویس `migrate` باید پوشه‌ی `~/import-staging` را mount داشته باشد. اگر
ندارد، یک volume موقت به `docker-compose.prod.yml` اضافه کن و بعد از کار
برش دار.

⚠️ **`plan` روی سرور اجرا نمی‌شود.** به عکس‌های خام ۱۱ گیگی نیاز دارد که
منتقل نشده‌اند، و از SQLite می‌خواند. گزارش همان است که در ۲.۱ خواندی.

اول آزمایشی:

```bash
dc --profile tooling run --rm \
  -v ~/import-staging:/import \
  migrate \
  pnpm exec tsx scripts/import-legacy.ts apply \
    --json /import \
    --staging /import/staging \
    --users /import/users.json \
    --workspace-id <N> --dry-run
```

🔴 خروجی را با چشم بخوان: نام کارگاه مقصد، و چهار عددی که باید با گزارش ۲.۱
یکی باشند. این آخرین فرصت دیدن اشتباه قبل از نوشتن است.

⚠️ `--dry-run` قبل از فاز آپلود برمی‌گردد، پس `lib/storage` را لمس نمی‌کند.
اولین آزمون واقعی S3 در خود `apply` است — یعنی **بعد از** نوشتن ردیف‌ها. اگر
آنجا بشکند، ردیف‌ها امن‌اند و `--images-only` ادامه می‌دهد.

بعد اجرای واقعی، همان دستور بدون `--dry-run`:

```bash
tmux new -s import

dc --profile tooling run --rm \
  -v ~/import-staging:/import \
  migrate \
  pnpm exec tsx scripts/import-legacy.ts apply \
    --json /import \
    --staging /import/staging \
    --users /import/users.json \
    --workspace-id <N>
```

⚠️ **داخل `tmux`.** فاز آپلود طولانی است و قطع شدن SSH می‌کشدش.

⚠️ **اگر آپلود وسط کار قطع شد**، همان دستور با `--images-only` ادامه می‌دهد.
ردیف‌ها دوباره نوشته نمی‌شوند.

⚠️ گزارش پایانی ممکن است بگوید چند عکس «جا افتاد» و پیشنهاد کند `media` را
دوباره بزنی. اگر تعدادش با تعداد فایل‌های خراب گزارش ۲.۲ یکی است، همان‌هاست
و کاری نمی‌شود کرد.

### ۴.۶ تأیید

```bash
dc exec -T postgres psql -U dofixo -d dofixo -c "
SELECT
  (SELECT count(*) FROM users      WHERE workspace_id = <N>) AS users,
  (SELECT count(*) FROM customers  WHERE workspace_id = <N>) AS customers,
  (SELECT count(*) FROM devices    WHERE workspace_id = <N>) AS devices,
  (SELECT count(*) FROM device_images WHERE workspace_id = <N>) AS images,
  (SELECT count(*) FROM device_assignments WHERE workspace_id = <N>) AS assignments,
  (SELECT device_seq FROM workspaces WHERE id = <N>) AS device_seq;

SELECT min(reception_number) AS lo, max(reception_number) AS hi,
       count(*) AS n, count(DISTINCT reception_number) AS distinct_n
FROM devices WHERE workspace_id = <N>;"
```

🔴 `n` و `distinct_n` باید برابر باشند، و `hi` برابر `device_seq`.

⚠️ **اگر شماره‌ها از عدد بزرگی شروع شدند** (مثلاً ۱۳۶۷ به‌جای ۱)، داده سالم
است و ایمیج فرانت یا بک کهنه: `devices.id` نمایش داده می‌شود نه
`reception_number`. کوئری بالا حقیقت را می‌گوید، مرورگر نه.

در مرورگر — بعد از `Ctrl+Shift+R`، وگرنه جاوااسکریپت قدیمی از کش می‌آید:

| #   | کار                    | چه چیزی را ثابت می‌کند          |
| --- | ---------------------- | ------------------------------- |
| ۱   | ورود با حساب یک تکنسین | هش رمز و نقش درست نوشته شده     |
| ۲   | فهرست دستگاه‌ها        | شماره‌ی پذیرش از ۱ شروع می‌شود  |
| ۳   | مودال یک دستگاه با عکس | آروان، thumbnail، presigned URL |
| ۴   | صفحه‌ی یک مشتری        | رابطه‌ی مشتری و دستگاه          |
| ۵   | صفحه‌ی یک پرسنل        | واگذاری‌ها                      |
| ۶   | تنظیمات                | نام و تلفن شرکت                 |
| ۷   | **ثبت یک دستگاه تازه** | شماره‌ی بعدی می‌گیرد، نه تکراری |

🔴 مورد ۷ مهم‌ترین است: اگر `deviceSeq` درست ست نشده باشد، اولین دستگاه
واقعی با شماره‌ی تکراری برخورد می‌کند.

⚠️ مورد ۳ عکس‌ها را **سروته** هم بررسی کن، نه فقط بارگذاری شدن.

### ۴.۷ تمیزکاری

```bash
ssh dofixo 'rm -rf ~/import-staging'
```

⚠️ `users.json` رمز دارد. و volume موقتی که به compose اضافه کردی را بردار.

---

## ۵. بعد از ایمپورت

- [ ] نام مالک از «مدیر» به نام واقعی عوض شود (صفحه‌ی پرسنل)
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
دوباره زد. با این کوئری مطمئن شو:

```bash
dc exec -T postgres psql -U dofixo -d dofixo -c "
SELECT
  (SELECT count(*) FROM customers WHERE workspace_id = <N>) AS customers,
  (SELECT count(*) FROM devices   WHERE workspace_id = <N>) AS devices;"
```

هر دو باید صفر باشند.

**فاز عکس‌ها وسط کار شکست:** ردیف‌ها سر جایشان‌اند. با `--images-only`
ادامه بده.

**ایمپورت تمام شد ولی داده غلط است:** بازیابی از بکاپ ۴.۲ تنها راه است —
`ops/restore-database.md`. هر داده‌ای که بعد از آن بکاپ ساخته شده از دست
می‌رود، که دلیل انجام ایمپورت در ساعت خلوت است.

**شماره‌ی پذیرش در مرورگر غلط است ولی در دیتابیس درست:** داده سالم است.
ایمیج فرانت یا بک کهنه است — بساز، منتقل کن، `up -d --force-recreate`، و
`Ctrl+Shift+R`.

⚠️ حذف دستی کارگاه ایمپورت‌شده با `DELETE` **کار نمی‌کند** (کلیدهای
`Restrict`). `utils/workspaceDeletion.ts` را استفاده کن.
