// backend/src/utils/backupHelper.js
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

const BACKUP_DIR = path.join(__dirname, "../../backups");
const DB_PATH = path.join(__dirname, "../repair_system.db");
const UPLOADS_DIR = path.join(__dirname, "../uploads");

// Ensure backup directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

/**
 * Create a backup zip file
 * @param {boolean} includeUploads - Whether to include uploads folder
 * @returns {Promise<{filename: string, size: number}>}
 */
function createBackup(includeUploads = false) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const filename = `backup-${timestamp}.zip`;
    const filepath = path.join(BACKUP_DIR, filename);

    const output = fs.createWriteStream(filepath);
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      const size = archive.pointer();
      resolve({ filename, size });
    });

    archive.on("error", reject);
    archive.pipe(output);

    // Always include database
    archive.file(DB_PATH, { name: "repair_system.db" });

    // Optionally include uploads
    if (includeUploads) {
      archive.directory(UPLOADS_DIR, "uploads");
    }

    archive.finalize();
  });
}

/**
 * Get all backup files with metadata
 */
function listBackups(db) {
  const result = db.exec(
    `SELECT b.*, u.full_name as created_by_name 
     FROM backups b 
     LEFT JOIN users u ON b.created_by = u.id 
     ORDER BY b.created_at DESC`,
  );

  return result[0]
    ? result[0].values.map((row) => ({
        id: row[0],
        filename: row[1],
        size_bytes: row[2],
        includes_uploads: row[3],
        created_by: row[4],
        created_at: row[5],
        created_by_name: row[6],
      }))
    : [];
}

/**
 * Delete a backup file
 */
function deleteBackupFile(filename) {
  const filepath = path.join(BACKUP_DIR, filename);
  if (fs.existsSync(filepath)) {
    fs.unlinkSync(filepath);
  }
}

module.exports = { createBackup, listBackups, deleteBackupFile, BACKUP_DIR };
