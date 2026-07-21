// backend/src/scripts/importDeviceImages.js

const fs = require("fs");
const path = require("path");
const { getDb, saveDb } = require("../config/database");

const UPLOADS_DIR = path.join(__dirname, "../uploads/devices");

async function importDeviceImages() {
  try {
    const db = await getDb();

    // خواندن تمام فایل‌های موجود در پوشه devices
    const files = fs.readdirSync(UPLOADS_DIR);

    // فیلتر کردن فقط فایل‌های تصویر
    const imageFiles = files.filter((file) =>
      /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file),
    );

    console.log(`📸 ${imageFiles.length} عکس پیدا شد`);

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const filename of imageFiles) {
      try {
        // استخراج device_id از نام فایل (قسمت قبل از خط تیره)
        // مثال: 1-1.jpg → device_id = 1
        const deviceId = parseInt(filename.split("-")[0]);

        if (isNaN(deviceId)) {
          console.log(`⚠️  نام فایل نامعتبر: ${filename} (دستگاه شناسایی نشد)`);
          skipped++;
          continue;
        }

        // بررسی اینکه دستگاه در دیتابیس وجود دارد یا نه
        const checkDevice = db.exec("SELECT id FROM devices WHERE id = ?", [
          deviceId,
        ]);

        if (!checkDevice[0] || checkDevice[0].values.length === 0) {
          console.log(
            `⚠️  دستگاه ${deviceId} در دیتابیس پیدا نشد — فایل: ${filename}`,
          );
          skipped++;
          continue;
        }

        // مسیر کامل فایل
        const filePath = path.join("uploads/devices", filename);

        // بررسی اینکه آیا این عکس قبلاً در دیتابیس ثبت شده؟
        const checkImage = db.exec(
          "SELECT id FROM device_images WHERE device_id = ? AND filename = ?",
          [deviceId, filename],
        );

        if (checkImage[0] && checkImage[0].values.length > 0) {
          console.log(`⏭️  عکس ${filename} قبلاً ثبت شده — رد شد`);
          skipped++;
          continue;
        }

        // پیدا کردن آخرین sort_order برای این دستگاه
        const sortResult = db.exec(
          "SELECT MAX(sort_order) as max_order FROM device_images WHERE device_id = ?",
          [deviceId],
        );

        let nextOrder = 0;
        if (sortResult[0] && sortResult[0].values[0][0] !== null) {
          nextOrder = sortResult[0].values[0][0] + 1;
        }

        // ثبت عکس در دیتابیس
        db.run(
          `INSERT INTO device_images (device_id, filename, filepath, sort_order, created_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [deviceId, filename, filePath, nextOrder],
        );

        console.log(`✅ عکس ${filename} به دستگاه ${deviceId} اضافه شد`);
        imported++;
      } catch (error) {
        console.error(`❌ خطا در پردازش ${filename}:`, error.message);
        errors++;
      }
    }

    // ذخیره تغییرات در دیتابیس
    saveDb();

    console.log("\n📊 خلاصه عملیات:");
    console.log(`   ✅ ${imported} عکس جدید اضافه شد`);
    console.log(`   ⏭️ ${skipped} عکس رد شد (دستگاه ناموجود یا تکراری)`);
    console.log(`   ❌ ${errors} خطا`);
    console.log(`   📸 ${imageFiles.length} عکس کل`);
  } catch (error) {
    console.error("❌ خطا در اجرای اسکریپت:", error);
  }
}

// اجرای اسکریپت
importDeviceImages();
