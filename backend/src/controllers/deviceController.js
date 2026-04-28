const { getDb, saveDb } = require("../config/database");
const { deleteDeviceImages } = require("./imageController");

function rowToDevice(row) {
  return {
    id: row[0],
    customer_id: row[1],
    device_name: row[3],
    brand: row[4],
    model: row[5],
    serial_number: row[6],
    entry_date: row[7],
    exit_date: row[8],
    status: row[9],
    description: row[10],
    created_at: row[11],
    updated_at: row[12],
    customer_name: row[13],
    customer_phone: row[14],
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
      personnel_ids,
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

    if (personnel_ids && personnel_ids.trim()) {
      const ids = personnel_ids
        .split(",")
        .map((id) => parseInt(id))
        .filter(Boolean);
      if (ids.length > 0) {
        const placeholders = ids.map(() => "?").join(",");
        baseQuery += ` AND d.id IN (
      SELECT device_id FROM device_assignments
      WHERE personnel_id IN (${placeholders})
    )`;
        params.push(...ids);
      }
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
      `INSERT INTO devices (customer_id, personnel_id, device_name, brand, model, serial_number, entry_date, exit_date, status, description, created_at, updated_at) 
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [
        customer_id || null,
        null, // personnel_id
        device_name || null,
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
    const { id } = req.params;

    const current = db.exec(`SELECT * FROM devices WHERE id = ?`, [id]);
    if (!current[0] || current[0].values.length === 0) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    const cur = current[0].values[0];

    const fields = [];
    const values = [];

    const fieldMap = {
      customer_id: 1,
      device_name: 2,
      brand: 3,
      model: 4,
      serial_number: 5,
      entry_date: 6,
      exit_date: 7,
      status: 8,
      description: 9,
    };

    Object.keys(fieldMap).forEach((field) => {
      if (req.body[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: "هیچ فیلدی برای آپدیت ارسال نشده" });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    const query = `UPDATE devices SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values);

    saveDb();

    const result = db.exec(
      `SELECT d.*, c.name as customer_name, c.phone as customer_phone
       FROM devices d
       LEFT JOIN customers c ON d.customer_id = c.id
       WHERE d.id = ?`,
      [id],
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
