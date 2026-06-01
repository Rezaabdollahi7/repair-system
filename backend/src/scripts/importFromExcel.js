const fs = require("fs");
const path = require("path");
const { parse } = require("csv-parse/sync");
const initSqlJs = require("sql.js");
const jalaali = require("jalaali-js");

const CSV_PATH = path.join(__dirname, "../../fintyBackup.csv");
const DB_PATH = path.join(__dirname, "../repair_system.db");

function persianToGregorian(dateStr) {
  if (!dateStr || dateStr.trim() === "") return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;

  const jy = parseInt(parts[0]);
  const jm = parseInt(parts[1]);
  const jd = parseInt(parts[2]);

  const gDate = jalaali.toGregorian(jy, jm, jd);

  return `${gDate.gy}-${String(gDate.gm).padStart(2, "0")}-${String(gDate.gd).padStart(2, "0")}`;
}

function mapStatus(acceptStatus, deviceStatus) {
  if (acceptStatus === "تحویل شده") return "delivered";
  if (acceptStatus === "آماده تحویل") return "ready_for_pickup";
  if (deviceStatus === "تعمیر شد") return "repaired";
  if (deviceStatus === "تعمیر نشد") return "not_repaired";
  if (deviceStatus === "غیرقابل تعمیر") return "unrepairable";
  return "pending";
}

async function main() {
  const SQL = await initSqlJs();
  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  // Parse CSV properly
  const csvContent = fs.readFileSync(CSV_PATH, "utf-8");
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
  });

  console.log(`Total rows to import: ${records.length}`);

  const customers = new Map();
  let newCustomerId = 1;
  let importedCount = 0;
  let skippedCount = 0;

  for (const record of records) {
    const customerName = record["نام و نام خانوادگی"]?.trim() || "";
    const phone = record["شماره همراه"]?.trim() || "";
    const deviceId = parseInt(record["ش پذیرش"]?.trim());
    const entryDate = record["تاریخ ورود"]?.trim() || "";
    const brand = (record["برند"] || "").trim().replace(/[()]/g, "");
    const modelRaw = (record["مدل"] || "").trim().replace(/[()]/g, "");
    // Remove extra quotes
    const model = modelRaw.replace(/"/g, "");
    const serial = (record["سریال"] || "").trim();
    const acceptStatus = record["وضعیت پذیرش"]?.trim() || "";
    const deviceStatus = record["وضعیت دستگاه"]?.trim() || "";
    const description = (record["توضیحات تعمیرکار"] || "").trim();

    if (!customerName || isNaN(deviceId)) {
      skippedCount++;
      continue;
    }

    const customerKey = `${customerName}__${phone}`;
    let customerId;

    if (customers.has(customerKey)) {
      customerId = customers.get(customerKey);
    } else {
      const existingCustomer = db.exec(
        `SELECT id FROM customers WHERE name = ? AND phone = ?`,
        [customerName, phone],
      );
      if (existingCustomer[0]?.values.length > 0) {
        customerId = existingCustomer[0].values[0][0];
        customers.set(customerKey, customerId);
      } else {
        db.run(`INSERT INTO customers (id, name, phone) VALUES (?, ?, ?)`, [
          newCustomerId,
          customerName,
          phone,
        ]);
        customers.set(customerKey, newCustomerId);
        customerId = newCustomerId;
        newCustomerId++;
      }
    }

    const gregorianDate = persianToGregorian(entryDate);
    const status = mapStatus(acceptStatus, deviceStatus);

    try {
      db.run(
        `INSERT OR REPLACE INTO devices (id, customer_id, device_name, brand, model, serial_number, entry_date, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          deviceId,
          customerId,
          model,
          brand,
          model,
          serial || null,
          gregorianDate,
          status,
          description || null,
        ],
      );
      importedCount++;
    } catch (error) {
      console.log(`Error on device #${deviceId}: ${error.message}`);
      skippedCount++;
    }
  }

  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);

  console.log("\n=== Migration Complete ===");
  console.log(`Total rows: ${records.length}`);
  console.log(`Imported: ${importedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Customers created: ${newCustomerId - 1}`);
}

main().catch(console.error);
