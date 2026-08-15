# بازیابی دیتابیس Dofixo

> این سند برای لحظه‌ای نوشته شده که دیتابیس از دست رفته است. با آرامش
> مرحله‌به‌مرحله جلو برو؛ هیچ‌کدام از این قدم‌ها عجله برنمی‌دارد.

## قبل از هر چیز

**چیزی را عجولانه پاک نکن.** اگر دیتابیس فعلی هنوز وجود دارد ولی خراب است،
دست نگه دار — ممکن است حاوی داده‌ای باشد که در آخرین بکاپ نیست. اول یک کپی
از وضعیت فعلی بگیر، بعد بازیابی کن.

**چه چیزی لازم داری:**

- کلید خصوصی `age` (در password manager، عنوان `Dofixo — Backup Encryption Key`)
- کلیدهای S3 صندوقچه‌ی بکاپ (در `ops/backup.env`، یا در password manager)
- دسترسی به سرور

⚠️ **بدون کلید خصوصی هیچ بکاپی قابل بازیابی نیست.** اگر گمش کرده‌ای، اینجا
پایان راه است.

## ۱. کدام بکاپ؟

```bash
cd ops
set -a && . ./backup.env && set +a
export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY"

for tier in daily weekly monthly; do
  echo "── $tier"
  aws s3 ls "s3://$S3_BUCKET/$S3_PREFIX/$tier/" --endpoint-url "$S3_ENDPOINT"
done
```

تاریخ در نام فایل **UTC** است، نه به وقت تهران — ۳ ساعت و ۳۰ دقیقه عقب‌تر.

## ۲. دانلود

```bash
aws s3 cp "s3://$S3_BUCKET/$S3_PREFIX/daily/<نام-فایل>" /tmp/restore.age \
  --endpoint-url "$S3_ENDPOINT"
```

## ۳. کلید خصوصی را موقتاً بگذار

```bash
cat > /tmp/age-key.txt << 'EOF'
<کل محتوای کلید خصوصی از password manager>
EOF
chmod 600 /tmp/age-key.txt
```

⚠️ در پایان حتماً `shred -u /tmp/age-key.txt`. کلید خصوصی نباید روی سرور بماند.

## ۴. رمزگشایی

```bash
age -d -i /tmp/age-key.txt /tmp/restore.age | gunzip > /tmp/restore.sql
head -5 /tmp/restore.sql
```

باید هدر `PostgreSQL database dump` را ببینی. اگر خطای رمزگشایی گرفتی، کلید
اشتباه است یا فایل خراب — بکاپ قدیمی‌تر را امتحان کن.

## ۵. اول روی یک دیتابیس موقت

**هرگز مستقیم روی دیتابیس اصلی بازیابی نکن.** اول اینجا امتحان کن:

```bash
docker compose exec postgres psql -U dofixo -d postgres \
  -c "DROP DATABASE IF EXISTS restore_test;" \
  -c "CREATE DATABASE restore_test OWNER dofixo;"

docker compose exec -T postgres psql -U dofixo -d restore_test < /tmp/restore.sql
```

چند خطای `does not exist` طبیعی است — از `--clean --if-exists` روی دیتابیس
خالی می‌آید.

## ۶. تأیید — این قدم را رد نکن

```bash
docker compose exec postgres psql -U dofixo -d restore_test -c "
  SELECT (SELECT count(*) FROM workspaces) AS workspaces,
         (SELECT count(*) FROM users) AS users,
         (SELECT count(*) FROM devices) AS devices;"

docker compose exec postgres psql -U dofixo -d restore_test \
  -c "SELECT count(*) AS policies FROM pg_policies WHERE schemaname='public';"

docker compose exec postgres psql -U dofixo -d restore_test \
  -c "SELECT proname FROM pg_proc WHERE proname LIKE 'app_%' ORDER BY proname;"
```

**سه چیز باید درست باشد:**

| بررسی         | انتظار                                                 |
| ------------- | ------------------------------------------------------ |
| تعداد ردیف‌ها | معقول به نظر برسد                                      |
| تعداد policy  | **به تعداد جدول‌های `workspace_id` دار + ۱** (الان ۲۰) |
| توابع `app_*` | **۴ تا**                                               |

⚠️ اگر policyها کم باشند، دیتابیس بازیابی‌شده **هیچ ایزولاسیونی بین کارگاه‌ها
ندارد** و نباید سرو شود. اگر توابع نباشند، لاگین و ثبت‌نام کار نمی‌کنند.

## ۷. جابه‌جایی به دیتابیس اصلی

فقط بعد از اینکه قدم ۶ سبز بود:

```bash
docker compose stop backend frontend

docker compose exec postgres psql -U dofixo -d postgres \
  -c "ALTER DATABASE dofixo_prod RENAME TO dofixo_broken_$(date +%Y%m%d);" \
  -c "ALTER DATABASE restore_test RENAME TO dofixo_prod;"

docker compose start backend frontend
```

تغییر نام به‌جای drop: دیتابیس خراب می‌ماند تا وقتی مطمئن شوی همه‌چیز درست
است. بعداً با آرامش پاکش کن.

## ۸. تأیید نهایی

- در مرورگر وارد شو
- یک کارگاه، یک مشتری و یک فاکتور را باز کن
- **با حساب یک کارگاه دیگر وارد شو و مطمئن شو داده‌ی اولی را نمی‌بیند**

## ۹. پاکسازی

```bash
shred -u /tmp/age-key.txt
rm -f /tmp/restore.age /tmp/restore.sql
```

---

## نکته‌ها

**نسخه‌ی psql باید با `pg_dump` بخواند.** dumpهای Postgres 17 دستور
`\restrict` دارند که psql قدیمی‌تر نمی‌شناسد. چون هر دو داخل همان کانتینر
اجرا می‌شوند، معمولاً مسئله‌ای نیست — مگر ایمیج را ارتقا داده باشی.

**عکس‌ها در این بکاپ نیستند.** روی ArvanCloud Object Storage زندگی می‌کنند و
مستقل از دیتابیس‌اند. اگر صندوقچه سالم باشد، عکس‌ها بعد از بازیابی خودبه‌خود
برمی‌گردند — چون `device_images.filepath` کلید شیء را نگه می‌دارد.

**بازیابی یک کارگاه از میان بقیه** در این سند نیست. عمداً: جایگزین کردن
ردیف‌های یک مستأجر در اسکیمای مشترک، در حالی که بقیه زنده‌اند، خطرناک است.
تسک ۵.۵.

**این روال را سالی یک بار تمرین کن**، حتی وقتی مشکلی نیست. بکاپی که بازیابی‌اش
امتحان نشده، بکاپ نیست.
