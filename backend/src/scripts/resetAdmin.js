const bcrypt = require("bcryptjs");
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../repair_system.db");

async function resetAdmin() {
  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.error("❌ فایل DB پیدا نشد:", DB_PATH);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  // بررسی وضعیت فعلی
  const roles = db.exec("SELECT * FROM roles");
  console.log("📋 نقش‌های موجود:", roles[0]?.values);

  const users = db.exec("SELECT id, username, role_id, is_active FROM users");
  console.log("👥 کاربران موجود:", users[0]?.values);

  // ساخت هش جدید
  const hash = await bcrypt.hash("Admin@1234", 10);
  console.log("🔑 هش جدید:", hash);

  // آپدیت یا insert سوپر ادمین
  const existingUser = db.exec(
    "SELECT id FROM users WHERE username = 'superadmin'",
  );

  if (existingUser[0] && existingUser[0].values.length > 0) {
    // آپدیت رمز
    db.run(
      "UPDATE users SET password = ?, is_active = 1 WHERE username = 'superadmin'",
      [hash],
    );
    console.log("✅ رمز superadmin آپدیت شد");
  } else {
    // پیدا کردن role_id سوپر ادمین
    const roleResult = db.exec(
      "SELECT id FROM roles WHERE name = 'super_admin'",
    );

    if (!roleResult[0]) {
      console.error("❌ نقش super_admin پیدا نشد!");
      process.exit(1);
    }

    const roleId = roleResult[0].values[0][0];

    db.run(
      `INSERT INTO users (full_name, username, password, role_id, is_active)
       VALUES ('سوپر ادمین', 'superadmin', ?, ?, 1)`,
      [hash, roleId],
    );
    console.log("✅ superadmin ایجاد شد");
  }

  // ذخیره DB
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  console.log("💾 DB ذخیره شد");

  // تست نهایی
  const verify = db.exec(
    "SELECT id, username, is_active FROM users WHERE username = 'superadmin'",
  );
  console.log("🔍 نتیجه نهایی:", verify[0]?.values);
}

resetAdmin().catch(console.error);
