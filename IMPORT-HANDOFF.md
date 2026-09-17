# Dofixo — سند انتقال ایمپورت (تسک ۵.۸)

> برای ادامه‌ی ایمپورت داده‌ی «گروه مهندسی زیمنس پارت» از نسخه‌ی تک‌مستأجر
> Dofixo (SQLite) به SaaS.
>
> **به‌روزرسانی:** ۱۷ سپتامبر ۲۰۲۶، ساعت ۹ صبح · **برنچ:** `claude/bold-gauss-get1gp`
>
> در نشست بعد این سند را به‌علاوه‌ی `CLAUDE.md`، `RULES.md`، `Roadmap.md` و
> `HANDOFF.md` بفرست.

---

## ۰. 🔴 کار ناتمام — از اینجا شروع کن

**اسکریپت نیمه‌ویرایش است.** تصمیم گرفتیم `better-sqlite3` را حذف کنیم و با
`sqlite3` خط فرمان بخوانیم. بخشی اعمال شده، بخشی نه:

| کار                                                 | وضعیت                  |
| --------------------------------------------------- | ---------------------- |
| `sqliteQuery` + `readFromSqlite` + `readUsers` تازه | ✅ اضافه شد            |
| `plan` بازنویسی شد                                  | ✅ کار می‌کند (تست شد) |
| `pnpm remove better-sqlite3 @types/better-sqlite3`  | ✅ انجام شد            |
| ایمپورت `Database from "better-sqlite3"` حذف شد     | ❓ بسنج                |
| **`media` هنوز `openLegacy` و `db.prepare` دارد**   | 🔴 **باقی مانده**      |
| `tsc` / `lint` / `test`                             | 🔴 اجرا نشده           |
| کامیت                                               | 🔴 نشده                |

⚠️ **الان کار می‌کند فقط چون `better-sqlite3` هنوز در `node_modules` است.**
بعد از یک `pnpm install` تازه (یا روی سرور) `media` می‌شکند.

### تغییر باقی‌مانده در `media`

از:

```typescript
  const db = openLegacy(options.dbPath);

  try {
    const allImages = db
      .prepare(
        "SELECT id, device_id, filename, sort_order, created_at FROM device_images ORDER BY id",
      )
      .all() as LegacyImage[];
```

به:

```typescript
  {
    const allImages = readFromSqlite(options.dbPath).images;
```

و از:

```typescript
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
}
```

به:

```typescript
      process.exitCode = 1;
    }
  }
}
```

### بررسی بعدش

```bash
cd /Programming/Code/Dofixo/backend
pnpm exec prettier --write scripts/import-legacy.ts
grep -n "better-sqlite3\|openLegacy\|db\.prepare\|db\.close\|Database" scripts/import-legacy.ts
```

انتظار: فقط یک خط کامنت توضیحی (حدود خط ۱۳۴) بماند.

```bash
pnpm exec tsc --noEmit && pnpm lint && pnpm test

pnpm exec tsx scripts/import-legacy.ts media \
  --db ~/Downloads/Feem/repair-system/backend/src/repair_system.db \
  --uploads ~/Downloads/Feem/repair-system/backend/src/uploads \
  --out ~/dofixo-import/staging --limit 5
```

انتظار: «۵ از قبل بود».

🔴 **`pnpm-lock.yaml` عوض شده و باید کامیت شود** — وگرنه build سرور با lock
قدیمی همان خطای Python را می‌دهد.

---

## ۱. چرا `better-sqlite3` حذف شد

🔴 build ایمیج `migrate` **شکست خورد**:

```
better-sqlite3 install: gyp ERR! find Python
Could not find any Python installation to use
The command '/bin/sh -c pnpm install --frozen-lockfile' returned a non-zero code: 1
```

`backend/Dockerfile`: خط ۹ `FROM node:26-slim AS deps` → خط ۱۷
`pnpm install --frozen-lockfile` → خط ۲۲ `FROM deps AS build` → خط ۹۴
`FROM build AS tooling`. پس `tooling` همه‌ی devDependency ها را نصب می‌کند و
`better-sqlite3` یک ماژول native است که به python3 و کامپایلر نیاز دارد.

⚠️ **این یعنی ایمیج `migrate` از لحظه‌ی افزودن این وابستگی اصلاً build
نمی‌شد** — حتی برای مهاجرت‌های عادی.

**سه راه بررسی شد:**

- الف) `python3` + `build-essential` به `deps` — ایمیج build سنگین‌تر، دائمی
- ب) **حذف `better-sqlite3` و خواندن با `sqlite3` خط فرمان** ← **انتخاب شد**
- ج) `--ignore-scripts` — ماژول ناقص که فقط چون صدا زده نمی‌شود سالم به‌نظر می‌رسد

**دلیل (ب):** تنها وابستگی native پروژه بود و فقط برای یک اسکریپت اپراتوری
اضافه شده بود. حذفش یعنی build هیچ‌وقت به Python نیاز ندارد.

⚠️ ولی `tsx` و بقیه‌ی devDependency ها همچنان در `tooling` هستند — که لازم
است، چون اسکریپت با `tsx` اجرا می‌شود.

---

## ۲. معماری خواندن مبدأ — دو مسیر

```
لپ‌تاپ:   SQLite → sqliteQuery (execFileSync "sqlite3 -readonly -json")
سرور:     JSON   → readFromJson
          هر دو → LegacySource (شکل یکسان)
```

**چرا دو مسیر:** فایل SQLite به سرور نمی‌رود چون هیچ درایوری آنجا نیست.
`sqlite3 -json` روی لپ‌تاپ همان ردیف‌ها را در ۱٫۳ مگابایت متن می‌دهد.

| تابع                       | کجا    | استفاده                        |
| -------------------------- | ------ | ------------------------------ |
| `sqliteQuery(dbPath, sql)` | لپ‌تاپ | یک کوئری، `maxBuffer: 64MB`    |
| `readFromSqlite(dbPath)`   | لپ‌تاپ | پنج جدول → `LegacySource`      |
| `readUsers(dbPath)`        | لپ‌تاپ | فقط `plan`                     |
| `readFromJson(dir)`        | سرور   | پنج فایل JSON → `LegacySource` |

⚠️ `maxBuffer` مهم است: `devices.json` نزدیک یک مگابایت است و پیش‌فرض
`execFileSync` یک مگابایت — بی‌صدا می‌بُرد و خطای parse می‌دهد که چیزی
نمی‌گوید.

⚠️ `plan` فقط روی لپ‌تاپ اجرا می‌شود (به عکس‌های خام ۱۱ گیگی نیاز دارد که به
سرور نمی‌روند). `apply` هر دو مسیر را می‌گیرد: `--db` یا `--json`.

---

## ۳. وضعیت کلی

| مرحله                             | وضعیت                               |
| --------------------------------- | ----------------------------------- |
| تسک ۲.۹ (شماره پذیرش)             | ✅ کامیت‌شده                        |
| اسکریپت — نسخه‌ی `better-sqlite3` | ✅ کامیت‌شده (کامیت اول)            |
| اسکریپت — نسخه‌ی `sqlite3` CLI    | 🔴 نیمه‌کاره (بخش ۰)                |
| `Roadmap.md` ۵.۸                  | ✅ نوشته شد                         |
| `ops/import-legacy.md`            | ⚠️ نوشته شد ولی **بخش ۴.۵ کهنه شد** |
| تست کامل روی لوکال — مسیر SQLite  | ✅                                  |
| تست کامل روی لوکال — مسیر JSON    | ✅                                  |
| `media` کامل                      | ✅ ۳۶۵۸ از ۳۶۷۸                     |
| انتقال staging به سرور            | ✅                                  |
| کارگاه ۳ و ۴ پروداکشن             | ✅ سنگ‌قبر شدند                     |
| ایمیج `migrate` تازه              | 🔴 build نشده                       |
| اجرا روی پروداکشن                 | 🔴                                  |

---

## ۴. ✅ پروداکشن — کارهای انجام‌شده

### شماره‌ها آزاد شدند

```sql
UPDATE users SET username = username || '-old', is_active = false
WHERE id IN (3, 9);
UPDATE workspaces SET status = 'deleted', deleted_at = now()
WHERE id IN (3, 4);
```

نتیجه:

| شناسه | نام          | وضعیت                                 |
| ----- | ------------ | ------------------------------------- |
| ۱     | نینی جوجو    | active (کارگاه تست)                   |
| ۲     | مهدی         | active (دوست Reza)                    |
| ۳     | تعمیرگاه رضا | **deleted** · کاربر `09219811980-old` |
| ۴     | رضا ایرانسل  | **deleted** · کاربر `09028493475-old` |

✅ **`09219811980` حالا آزاد است** و Reza می‌تواند با آن ثبت‌نام کند.

⚠️ سه پرداخت دست‌نخورده ماندند (۲ verified، ۱ failed). دفتر مالی سالم است.
داده‌ی تنانت آن دو کارگاه هم هنوز آنجاست — سنگ‌قبر فقط `status` را عوض کرد.

### فایل‌ها روی سرور

```
~/import-staging/staging/        ← ۷۳۱۶ فایل webp (۱٫۲ گیگ) ✅
~/import-staging/repair_system.db  ← منتقل شد ولی دیگر لازم نیست
~/import-staging/users.json      ✅
~/import-staging/customers.json  ✅  (۳۰ کیلو)
~/import-staging/devices.json    ✅  (۸۷۰ کیلو)
~/import-staging/images.json     ✅  (۳۷۱ کیلو)
~/import-staging/assignments.json ✅ (۵ کیلو)
~/import-staging/settings.json   ✅
```

---

## ۵. 🔴 پروداکشن — کارهای باقی‌مانده

### ۵.۱ build و انتقال ایمیج `migrate`

بعد از تمام کردن بخش ۰:

```bash
cd /Programming/Code/Dofixo
docker compose -f docker-compose.prod.yml --env-file .env.prod build migrate
docker save dofixo-migrate:prod | gzip > /tmp/migrate.tar.gz
rsync -P /tmp/migrate.tar.gz dofixo:~/
ssh dofixo 'gunzip -c ~/migrate.tar.gz | docker load && rm ~/migrate.tar.gz'
```

⚠️ حدود ۴۰۰ مگابایت، نیم ساعت انتقال.

⚠️ بسنج که `scripts/` در ایمیج هست:

```bash
dc --profile tooling run --rm migrate ls -la /app/scripts
```

باید `import-legacy.ts` و `sms-cost-probe.ts` هر دو باشند.

### ۵.۲ 🔴 متغیرهای S3 در سرویس `migrate` نیستند

`docker-compose.prod.yml` خط ۱۷۳ به بعد فقط `DATABASE_URL` و
`DATABASE_URL_APP` می‌دهد. ولی `apply` عکس آپلود می‌کند و
`lib/storage.ts` در زمان import روی نبودن `S3_*` پرتاب می‌کند — اسکریپت حتی
بالا نمی‌آید.

```bash
cd ~/dofixo
export $(grep -E '^S3_' .env.prod | xargs)

dc --profile tooling run --rm \
  -v ~/import-staging:/import \
  -e S3_ENDPOINT -e S3_BUCKET -e S3_ACCESS_KEY -e S3_SECRET_KEY \
  migrate \
  pnpm exec tsx scripts/import-legacy.ts apply ...
```

⚠️ **تست نشده.** اگر کار نکرد، راه دوم افزودن موقت `env_file: .env.prod` به
سرویس `migrate` است.

⚠️ این متغیرها به باکت **`dofixo-prod`** اشاره می‌کنند — عکس‌ها مستقیم روی
پروداکشن می‌نشینند. برگشت‌ناپذیر.

### ۵.۳ ترتیب اجرا

```
۱. بکاپ دستی:  cd ~/dofixo && ./backup-database.sh
۲. ثبت‌نام از رابط با 09219811980 → کارگاه تازه، Reza سوپرادمین
۳. شناسه‌ی کارگاه تازه را بگیر
۴. apply --dry-run  → با چشم بخوان
۵. apply
۶. تأیید چشمی در مرورگر
۷. rm -rf ~/import-staging   (users.json رمز دارد)
```

فرمان کامل:

```bash
dc --profile tooling run --rm \
  -v ~/import-staging:/import \
  -e S3_ENDPOINT -e S3_BUCKET -e S3_ACCESS_KEY -e S3_SECRET_KEY \
  migrate \
  pnpm exec tsx scripts/import-legacy.ts apply \
    --json /import \
    --staging /import/staging \
    --users /import/users.json \
    --workspace-id <N>
```

⚠️ اگر آپلود قطع شد: همان دستور با `--images-only`.

---

## ۶. نتایج تست روی لوکال ✅

کارگاه مقصد: **کارگاه ۲** در `dofixo_dev` (نام «خودم»، مالک `09219811980`)

| بررسی                 | نتیجه                                         |
| --------------------- | --------------------------------------------- |
| ردیف‌ها (مسیر SQLite) | ۲۹۹ / ۲۰۵۴ / ۷۰ — ۱ ثانیه                     |
| ردیف‌ها (مسیر JSON)   | ۲۹۹ / ۲۰۵۴ / ۷۰ — ۲ ثانیه ✅ یکسان            |
| شماره‌ی پذیرش         | ۱ تا ۲۰۵۴، همه یکتا                           |
| `device_seq`          | ۲۰۵۴                                          |
| تاریخ خروج            | ۵۸ دستگاه                                     |
| عکس‌ها                | ۲۱۸ آپلود شد، بقیه با Ctrl+C متوقف            |
| ورود با حساب تازه     | ✅ `09121820830` / `Jafari1234` — ادمین       |
| مرورگر                | فهرست، مودال با عکس، مشتری، پرسنل، تنظیمات ✅ |

⚠️ **کارگاه ۲ لوکال الان پر است** (۲۹۹ مشتری، ۲۰۵۴ دستگاه، ۲۱۸ عکس). برای
تست دوباره باید خالی شود:

```bash
docker compose exec -T postgres psql -U dofixo -d dofixo_dev -c "
DELETE FROM device_assignments WHERE workspace_id = 2;
DELETE FROM device_images      WHERE workspace_id = 2;
DELETE FROM devices            WHERE workspace_id = 2;
DELETE FROM customers          WHERE workspace_id = 2;
DELETE FROM users WHERE workspace_id = 2
  AND username NOT IN ('09219811980', '09219811985');
UPDATE workspaces SET device_seq = 0 WHERE id = 2;"
```

---

## ۷. اعداد کارایی

| کار               | سرعت                                    |
| ----------------- | --------------------------------------- |
| `media` کامل      | **۲۱ دقیقه** · ۱۱ گیگ → ۱٫۲ گیگ         |
| نوشتن ردیف‌ها     | **۱ تا ۲ ثانیه** (~۶۱۰۰ درج، یک تراکنش) |
| آپلود عکس — دیروز | ~۳ ثانیه هر کدام (۶ موازی)              |
| آپلود عکس — امروز | **~۴ در ثانیه** (همان کد)               |

⚠️ نرخ آپلود روی لپ‌تاپ **بسیار متغیر** است. روی سرور آروان داخلی است و
احتمالاً پایدارتر. با نرخ امروز کل مجموعه حدود ۱۵ دقیقه است؛ با نرخ دیروز
سه ساعت.

---

## ۸. 🔴 بیست عکس خراب

`media` کامل ۳۶۵۸ از ۳۶۷۸ را پردازش کرد. بیست فایل JPEG معیوب‌اند و **در
نمایشگر تصویر هم باز نمی‌شوند** — فایل‌ها واقعاً از بین رفته‌اند.

```
315-2.jpg · 907-1.jpg · 908-1.jpg · 912-1.jpg · 913-1.jpg
915-1.jpg · 916-1.jpg · 918-1.jpg · 921-1.jpg · 922-1.jpg
925-1.jpg · 925-2.jpg · 926-1.jpg · 927-1.jpg · 929-1.jpg
930-1.jpg · 933-1.jpg · 933-2.jpg · 985-1.jpg · 985-2.jpg
```

هجده‌تا پشت سر هم (۹۰۷–۹۳۳) — احتمالاً یک انتقال ناقص در گذشته.

**تصمیم Reza:** رها شوند. دستگاه‌ها قدیمی‌اند و بدون عکس منتقل می‌شوند.

---

## ۹. فایل کاربران

**مسیر:** `~/dofixo-import/users.json` · روی سرور `~/import-staging/users.json`

| oldId | نام             | نام کاربری    | نقش        | رمز موقت       |
| ----- | --------------- | ------------- | ---------- | -------------- |
| ۹     | رضا عبدالهی     | `09219811980` | **owner**  | — (ثبت‌نام)    |
| ۱۱    | مهندس جعفری     | `09121820830` | admin      | `Jafari1234`   |
| ۵     | شاقلانی         | `09923348078` | technician | `Nastaran1234` |
| ۶     | یگانه جعفری     | `09335374224` | technician | `Yeganeh1234`  |
| ۷     | ریحانه حیدری    | `09399639268` | technician | `Reyhaneh1234` |
| ۸     | علیرضا اسماعیلی | `09121822435` | technician | `Alreza1234`   |
| ۴۳    | آرزو جعفری      | `09199889539` | technician | `Arezu1234`    |

⚠️ **`owner` ساخته نمی‌شود** — Reza از رابط ثبت‌نام می‌کند تا
`populateWorkspace` اجرا شود. خط `oldId: 9` فقط برای نگاشت واگذاری‌هاست.

⚠️ **یگانه شماره‌ی تازه گرفت** (`09335374224`) چون قبلی‌اش در کارگاه ۱
پروداکشن حساب دارد.

⚠️ صدرا (۱۹) و پارسا (۲۰) منتقل نمی‌شوند — رفته‌اند و واگذاری ندارند.

🔴 رمزها قابل حدس‌اند. بعد از ایمپورت همه باید عوض کنند.

---

## ۱۰. مسیرهای لپ‌تاپ

```
دیتابیس:  ~/Downloads/Feem/repair-system/backend/src/repair_system.db
عکس‌ها:    ~/Downloads/Feem/repair-system/backend/src/uploads/devices/
staging:  ~/dofixo-import/staging/   (۱٫۲ گیگ · ۷۳۱۶ فایل)
JSON:     ~/dofixo-import/*.json
```

⚠️ مخزن قدیم روی برنچ `custom/siemens-part` با ۹۱ فایل تغییریافته. **دست
نزن** — فقط خواندنی.

---

## ۱۱. کارهای باقی‌مانده

```markdown
- [ ] media را از openLegacy پاک کن (بخش ۰)
- [ ] tsc + lint + test
- [ ] کامیت (شامل pnpm-lock.yaml)
- [ ] ops/import-legacy.md بخش ۴.۵ به‌روز شود (JSON به‌جای SQLite، متغیر S3)
- [ ] Roadmap 5.8: پاراگراف better-sqlite3 عوض شود
- [ ] build و انتقال ایمیج migrate
- [ ] تست متغیرهای S3 در docker compose run
- [ ] بکاپ + ثبت‌نام + apply روی پروداکشن
- [ ] لوگوی شرکت (دستی)
- [ ] HANDOFF.md مخزن به‌روز شود (بعد از همه)
```

⚠️ **نقص کوچک:** گزارش «۷ کاربر» می‌گوید در حالی که دیتابیس ۸ نشان می‌دهد —
عدد اندازه‌ی **نگاشت** است نه تعداد کاربران کارگاه.

⚠️ **`config()` قبل از `import`ها** در اسکریپت. کار می‌کند ولی خواندنش عجیب.

---

## ۱۲. دام‌های این پروژه

🔴 **کاراکتر `<` در کپی از چت گم می‌شود.** چهار بار اتفاق افتاد. الگو: `<` در
**انتهای خط** می‌افتد، وسط خط سالم می‌ماند. بعد از هر کپی:

```bash
grep -n "Omit<\|Pick<\|Map<\|Promise<\|GetPayload<" <file>
```

⚠️ **ویرایش ساختاری با «از → به» پرخطر است.** دو بار بلوک در جای اشتباه
نشست. برای تغییری که بیش از سه چهار جا را لمس می‌کند، بازنویسی کل تابع.

⚠️ **`prisma generate` با `EACCES`** → `sudo chown -R "$USER":"$USER" backend`

⚠️ **`pgcrypto` روی Postgres توسعه نیست** — برای OTP دستی از `hashOtpCode`
پروژه استفاده کن.

⚠️ **بررسی امنیتی که مسیر دوم را می‌بندد** — یکتایی نام کاربری در
`--images-only` باید رد شود.

⚠️ **گرپ روی نام متغیر کافی نیست.** در ۲.۹ دو نقطه از `device.id` در رفتند و
با گرپ روی **عنوان فارسی** و نگاه کردن در مرورگر پیدا شدند.

⚠️ **کوئری بدون workspace context پرتاب می‌کند** — حتی `workspace.findUnique`،
چون `workspaces` پالیسی `workspace_self` دارد.

⚠️ **یکتایی نام کاربری سراسری است** و RLS جواب غلط می‌دهد — `takenUsernames`
با اتصال مالک (`DATABASE_URL`) می‌خواند.

---

## ۱۳. شروع سریع نشست بعد

```bash
cd /Programming/Code/Dofixo
git status --short && git log --oneline -3

grep -n "better-sqlite3\|openLegacy\|db\.prepare" backend/scripts/import-legacy.ts

docker compose exec -T postgres psql -U dofixo -d dofixo_dev -c "
SELECT w.id, w.name,
  (SELECT count(*) FROM customers c WHERE c.workspace_id=w.id) AS customers,
  (SELECT count(*) FROM devices d WHERE d.workspace_id=w.id) AS devices,
  (SELECT count(*) FROM device_images i WHERE i.workspace_id=w.id) AS images,
  w.device_seq
FROM workspaces w ORDER BY w.id;"

ssh dofixo 'du -sh ~/import-staging && ls ~/import-staging'
```
