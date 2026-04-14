// backend/controllers/assignmentController.js

const { getDb, saveDb } = require("../config/database");

// ─── GET /devices/:id/assignments ─────────────────────────────────────────────

exports.getAssignments = async (req, res) => {
  try {
    const db = await getDb();
    const deviceId = parseInt(req.params.id);

    const deviceCheck = db.exec(`SELECT id FROM devices WHERE id = ?`, [
      deviceId,
    ]);
    if (!deviceCheck[0] || deviceCheck[0].values.length === 0) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    const result = db.exec(
      `SELECT 
         da.id         AS assignment_id,
         da.assigned_at,
         u.id          AS id,
         u.full_name   AS name,
         u.username
       FROM device_assignments da
       JOIN users u ON da.personnel_id = u.id
       WHERE da.device_id = ?
       ORDER BY da.assigned_at ASC`,
      [deviceId],
    );

    const assignees = result[0]
      ? result[0].values.map((row) => ({
          assignment_id: row[0],
          assigned_at: row[1],
          id: row[2],
          name: row[3],
          username: row[4],
        }))
      : [];

    res.json(assignees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── PUT /devices/:id/assignments ─────────────────────────────────────────────

exports.setAssignments = async (req, res) => {
  try {
    const db = await getDb();
    const deviceId = parseInt(req.params.id);
    const assignedBy = req.user?.id ?? null;
    let { personnel_ids } = req.body;

    const deviceCheck = db.exec(`SELECT id FROM devices WHERE id = ?`, [
      deviceId,
    ]);
    if (!deviceCheck[0] || deviceCheck[0].values.length === 0) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    if (!Array.isArray(personnel_ids)) personnel_ids = [];

    for (const pid of personnel_ids) {
      const check = db.exec(
        `SELECT id FROM users WHERE id = ? AND is_active = 1`,
        [pid],
      );
      if (!check[0] || check[0].values.length === 0) {
        return res
          .status(400)
          .json({ error: `پرسنل با id=${pid} یافت نشد یا غیرفعال است` });
      }
    }

    db.run(`DELETE FROM device_assignments WHERE device_id = ?`, [deviceId]);

    for (const pid of personnel_ids) {
      db.run(
        `INSERT OR IGNORE INTO device_assignments (device_id, personnel_id, assigned_by)
         VALUES (?, ?, ?)`,
        [deviceId, pid, assignedBy],
      );
    }

    saveDb();

    const result = db.exec(
      `SELECT 
         da.id         AS assignment_id,
         da.assigned_at,
         u.id          AS id,
         u.full_name   AS name,
         u.username
       FROM device_assignments da
       JOIN users u ON da.personnel_id = u.id
       WHERE da.device_id = ?
       ORDER BY da.assigned_at ASC`,
      [deviceId],
    );

    const assignees = result[0]
      ? result[0].values.map((row) => ({
          assignment_id: row[0],
          assigned_at: row[1],
          id: row[2],
          name: row[3],
          username: row[4],
        }))
      : [];

    res.json(assignees);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── POST /devices/:id/assignments ────────────────────────────────────────────

exports.addAssignment = async (req, res) => {
  try {
    const db = await getDb();
    const deviceId = parseInt(req.params.id);
    const personnelId = parseInt(req.body.personnel_id);
    const assignedBy = req.user?.id ?? null;

    if (!personnelId) {
      return res.status(400).json({ error: "personnel_id الزامی است" });
    }

    const deviceCheck = db.exec(`SELECT id FROM devices WHERE id = ?`, [
      deviceId,
    ]);
    if (!deviceCheck[0] || deviceCheck[0].values.length === 0) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    const userCheck = db.exec(
      `SELECT id FROM users WHERE id = ? AND is_active = 1`,
      [personnelId],
    );
    if (!userCheck[0] || userCheck[0].values.length === 0) {
      return res.status(404).json({ error: "پرسنل یافت نشد یا غیرفعال است" });
    }

    db.run(
      `INSERT OR IGNORE INTO device_assignments (device_id, personnel_id, assigned_by)
       VALUES (?, ?, ?)`,
      [deviceId, personnelId, assignedBy],
    );

    saveDb();
    res.status(201).json({ message: "مسئول اضافه شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── DELETE /devices/:id/assignments/:personnelId ─────────────────────────────

exports.removeAssignment = async (req, res) => {
  try {
    const db = await getDb();
    const deviceId = parseInt(req.params.id);
    const personnelId = parseInt(req.params.personnelId);

    const check = db.exec(
      `SELECT id FROM device_assignments WHERE device_id = ? AND personnel_id = ?`,
      [deviceId, personnelId],
    );
    if (!check[0] || check[0].values.length === 0) {
      return res.status(404).json({ error: "اختصاص یافت نشد" });
    }

    db.run(
      `DELETE FROM device_assignments WHERE device_id = ? AND personnel_id = ?`,
      [deviceId, personnelId],
    );

    saveDb();
    res.json({ message: "مسئول حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
