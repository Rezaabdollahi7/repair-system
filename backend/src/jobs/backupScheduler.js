// backend/src/jobs/backupScheduler.js
const cron = require("node-cron");
const { getDb, saveDb } = require("../config/database");
const { createBackup } = require("../utils/backupHelper");

function startBackupScheduler() {
  // هر شنبه ساعت ۳ صبح
  cron.schedule(
    "0 3 * * 6",
    async () => {
      console.log("[Backup Scheduler] Starting weekly backup...");
      try {
        const db = await getDb();
        const { filename, size } = await createBackup(true);

        db.run(
          `INSERT INTO backups (filename, size_bytes, includes_uploads, created_by) VALUES (?, ?, ?, ?)`,
          [filename, size, 1, null], // created_by = null برای خودکار
        );
        saveDb();

        console.log(
          `[Backup Scheduler] Backup created: ${filename} (${size} bytes)`,
        );
      } catch (error) {
        console.error("[Backup Scheduler] Error:", error.message);
      }
    },
    {
      timezone: "Asia/Tehran",
    },
  );

  console.log("[Backup Scheduler] Weekly backup scheduled (Saturday 3:00 AM)");
}

module.exports = { startBackupScheduler };
