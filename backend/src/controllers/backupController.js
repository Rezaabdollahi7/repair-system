// backend/src/controllers/backupController.js
const { getDb, saveDb } = require("../config/database");
const {
  createBackup,
  listBackups,
  deleteBackupFile,
  BACKUP_DIR,
} = require("../utils/backupHelper");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");

// Create backup
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { include_uploads } = req.body;

    const { filename, size } = await createBackup(include_uploads || false);

    db.run(
      `INSERT INTO backups (filename, size_bytes, includes_uploads, created_by) VALUES (?, ?, ?, ?)`,
      [filename, size, include_uploads ? 1 : 0, req.user?.id || null],
    );
    saveDb();

    const result = db.exec(`SELECT * FROM backups WHERE filename = ?`, [
      filename,
    ]);
    const row = result[0].values[0];

    res.status(201).json({
      id: row[0],
      filename: row[1],
      size_bytes: row[2],
      includes_uploads: row[3] === 1,
      created_by: row[4],
      created_at: row[5],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// List all backups
exports.list = async (req, res) => {
  try {
    const db = await getDb();
    const backups = listBackups(db);
    res.json(backups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Download backup
exports.download = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const result = db.exec(`SELECT filename FROM backups WHERE id = ?`, [id]);
    if (!result[0]?.values[0]) {
      return res.status(404).json({ error: "بکاپ یافت نشد" });
    }

    const filename = result[0].values[0][0];
    const filepath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "فایل بکاپ موجود نیست" });
    }

    res.download(filepath, filename);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// restore
exports.restore = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const result = db.exec(
      `SELECT filename, includes_uploads FROM backups WHERE id = ?`,
      [id],
    );
    if (!result[0]?.values[0]) {
      return res.status(404).json({ error: "بکاپ یافت نشد" });
    }

    const filename = result[0].values[0][0];
    const includesUploads = result[0].values[0][1] === 1;
    const filepath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ error: "فایل بکاپ موجود نیست" });
    }

    // Auto-backup before restore
    const { filename: autoBackupFile, size: autoBackupSize } =
      await createBackup(true);
    db.run(
      `INSERT INTO backups (filename, size_bytes, includes_uploads, created_by) VALUES (?, ?, ?, ?)`,
      [autoBackupFile, autoBackupSize, 1, req.user?.id || null],
    );
    saveDb();

    // Extract zip directly
    const zip = new AdmZip(filepath);
    const DB_PATH = path.join(__dirname, "../repair_system.db");
    const UPLOADS_DIR = path.join(__dirname, "../uploads");

    // Extract database
    const dbEntry = zip
      .getEntries()
      .find((e) => e.entryName === "repair_system.db");
    if (dbEntry) {
      const dbData = dbEntry.getData();
      fs.writeFileSync(DB_PATH, dbData);
    }

    // Extract uploads if included
    if (includesUploads) {
      const uploadEntries = zip
        .getEntries()
        .filter((e) => e.entryName.startsWith("uploads/"));
      for (const entry of uploadEntries) {
        const targetPath = path.join(__dirname, "..", entry.entryName);
        const dir = path.dirname(targetPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!entry.isDirectory) {
          fs.writeFileSync(targetPath, entry.getData());
        }
      }
    }

    res.json({
      message:
        "فایل‌ها جایگزین شدند. لطفاً برنامه را ببندید و دوباره اجرا کنید.",
      auto_backup_filename: autoBackupFile,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete backup
exports.remove = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    const result = db.exec(`SELECT filename FROM backups WHERE id = ?`, [id]);
    if (!result[0]?.values[0]) {
      return res.status(404).json({ error: "بکاپ یافت نشد" });
    }

    const filename = result[0].values[0][0];
    deleteBackupFile(filename);

    db.run(`DELETE FROM backups WHERE id = ?`, [id]);
    saveDb();

    res.json({ message: "بکاپ با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
