const { getDb, saveDb } = require("../config/database");
const { deleteDeviceImages } = require("./imageController");

function rowToDevice(row) {
  return {
    id: row[0],
    customer_id: row[1],
    device_name: row[2],
    brand: row[3],
    model: row[4],
    serial_number: row[5],
    entry_date: row[6],
    exit_date: row[7],
    status: row[8],
    description: row[9],
    created_at: row[10],
    updated_at: row[11],
    customer_name: row[12],
    customer_phone: row[13],
  };
}

function getAssigneesForDevice(db, deviceId) {
  const result = db.exec(
    `SELECT u.id, u.full_name AS name, u.username
     FROM device_assignments da
     JOIN users u ON da.personnel_id = u.id
     WHERE da.device_id = ?
     ORDER BY da.assigned_at ASC`,
    [deviceId],
  );
  return result[0]
    ? result[0].values.map((r) => ({ id: r[0], name: r[1], username: r[2] }))
    : [];
}

exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const {
      search,
      status,
      model,
      customer_id,
      entry_from,
      entry_to,
      exit_from,
      exit_to,
      page = 1,
      limit = 10,
    } = req.query;

    let baseQuery = `
      FROM devices d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (search && search.trim()) {
      const term = `%${search.trim()}%`;
      baseQuery += ` AND (
        CAST(d.id AS TEXT) LIKE ? OR
        d.device_name LIKE ? OR
        d.brand LIKE ? OR
        d.model LIKE ? OR
        d.serial_number LIKE ? OR
        c.name LIKE ? OR
        c.phone LIKE ?
      )`;
      params.push(term, term, term, term, term, term, term);
    }

    if (status && status.trim()) {
      const statuses = status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (statuses.length > 0) {
        const placeholders = statuses.map(() => "?").join(",");
        baseQuery += ` AND d.status IN (${placeholders})`;
        params.push(...statuses);
      }
    }

    if (model && model.trim()) {
      baseQuery += ` AND d.model LIKE ?`;
      params.push(`%${model.trim()}%`);
    }

    if (customer_id && customer_id.trim()) {
      baseQuery += ` AND d.customer_id = ?`;
      params.push(customer_id.trim());
    }

    if (entry_from) {
      baseQuery += ` AND d.entry_date >= ?`;
      params.push(entry_from);
    }
    if (entry_to) {
      baseQuery += ` AND d.entry_date <= ?`;
      params.push(entry_to);
    }
    if (exit_from) {
      baseQuery += ` AND d.exit_date >= ?`;
      params.push(exit_from);
    }
    if (exit_to) {
      baseQuery += ` AND d.exit_date <= ?`;
      params.push(exit_to);
    }

    // count
    const countResult = db.exec(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = countResult[0]?.values[0][0] ?? 0;

    // pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    const dataResult = db.exec(
      `SELECT d.*, c.name as customer_name, c.phone as customer_phone
       ${baseQuery} ORDER BY d.id DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const devices = dataResult[0] ? dataResult[0].values.map(rowToDevice) : [];

    const devicesWithAssignees = devices.map((device) => ({
      ...device,
      assignees: getAssigneesForDevice(db, device.id),
    }));

    res.json({
      data: devicesWithAssignees,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT d.*, c.name as customer_name, c.phone as customer_phone
       FROM devices d
       LEFT JOIN customers c ON d.customer_id = c.id
       WHERE d.id = ?`,
      [req.params.id],
    );

    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    const device = rowToDevice(result[0].values[0]);
    device.assignees = getAssigneesForDevice(db, device.id);
    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const {
      customer_id,
      device_name,
      brand,
      model,
      serial_number,
      entry_date,
      exit_date,
      status,
      description,
    } = req.body;

    db.run(
      `INSERT INTO devices (customer_id, device_name, brand, model, serial_number, entry_date, exit_date, status, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ? , ?)`,
      [
        customer_id || null,
        device_name,
        brand || null,
        model || null,
        serial_number || null,
        entry_date || null,
        exit_date || null,
        status || "pending",
        description || null,
      ],
    );

    const idResult = db.exec(`SELECT last_insert_rowid() as id`);
    const newId = idResult[0].values[0][0];
    saveDb();

    const deviceResult = db.exec(
      `SELECT d.*, c.name as customer_name, c.phone as customer_phone
       FROM devices d
       LEFT JOIN customers c ON d.customer_id = c.id
       WHERE d.id = ?`,
      [newId],
    );

    if (!deviceResult[0] || deviceResult[0].values.length === 0) {
      return res
        .status(500)
        .json({ error: "Failed to retrieve created device" });
    }

    res.status(201).json(rowToDevice(deviceResult[0].values[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const {
      device_name,
      brand,
      model,
      serial_number,
      exit_date,
      status,
      description,
    } = req.body;

    const check = db.exec(`SELECT id FROM devices WHERE id = ?`, [
      req.params.id,
    ]);
    if (!check[0] || check[0].values.length === 0) {
      return res.status(404).json({ error: "Device not found" });
    }

    db.run(
      `UPDATE devices 
       SET device_name = ?, brand = ?, model = ?, serial_number = ?,
           exit_date = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        device_name,
        brand,
        model,
        serial_number,
        exit_date || null,
        status,
        description,
        req.params.id,
      ],
    );

    saveDb();

    const result = db.exec(
      `SELECT d.*, c.name as customer_name, c.phone as customer_phone
       FROM devices d
       LEFT JOIN customers c ON d.customer_id = c.id
       WHERE d.id = ?`,
      [req.params.id],
    );

    res.json(rowToDevice(result[0].values[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const db = await getDb();
    const id = parseInt(req.params.id);

    const check = db.exec(`SELECT id FROM devices WHERE id = ?`, [id]);
    if (!check[0] || check[0].values.length === 0) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    await deleteDeviceImages(id);

    db.run(`DELETE FROM devices WHERE id = ?`, [id]);
    saveDb();

    res.json({ message: "دستگاه و عکس‌های آن حذف شد" });
  } catch (error) {
    res.status(500).json({ error: "خطا در حذف دستگاه" });
  }
};
