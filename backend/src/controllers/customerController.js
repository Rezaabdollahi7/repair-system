const { getDb, saveDb } = require("../config/database");

exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const { search, page = 1, limit = 10 } = req.query;

    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    let where = `WHERE 1=1`;
    let params = [];

    if (search?.trim()) {
      where += ` AND (c.name LIKE ? OR c.phone LIKE ?)`;
      params.push(`%${search.trim()}%`, `%${search.trim()}%`);
    }

    const countResult = db.exec(
      `SELECT COUNT(*) FROM customers c ${where}`,
      params,
    );
    const total = countResult[0]?.values[0][0] ?? 0;

    const dataResult = db.exec(
      `SELECT c.id, c.name, c.phone,
        (SELECT COUNT(*) FROM devices d WHERE d.customer_id = c.id) AS device_count
       FROM customers c ${where}
       ORDER BY c.name ASC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const customers = dataResult[0]
      ? dataResult[0].values.map((row) => ({
          id: row[0],
          name: row[1],
          phone: row[2],
          device_count: row[3],
        }))
      : [];

    res.json({
      data: customers,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM customers WHERE id = ?`, [
      req.params.id,
    ]);

    if (!result[0]) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const row = result[0].values[0];
    res.json({
      id: row[0],
      name: row[1],
      phone: row[2],
      created_at: row[3],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDevices = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `
      SELECT 
        id, customer_id, device_name, brand, model, 
        serial_number, entry_date, exit_date, status, 
        description, image_path, created_at, updated_at
      FROM devices 
      WHERE customer_id = ? 
      ORDER BY entry_date DESC, created_at DESC
    `,
      [req.params.id],
    );

    const devices = result[0]
      ? result[0].values.map((row) => ({
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
          image_path: row[10],
          created_at: row[11],
          updated_at: row[12],
        }))
      : [];

    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getStats = async (req, res) => {
  try {
    const db = await getDb();
    const customerId = req.params.id;

    const result = db.exec(
      `
      SELECT 
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'done' OR status = 'delivered' THEN 1 ELSE 0 END) AS success,
        AVG(
          CASE 
            WHEN exit_date IS NOT NULL AND entry_date IS NOT NULL 
            THEN JULIANDAY(exit_date) - JULIANDAY(entry_date)
            ELSE NULL
          END
        ) AS avg_days
      FROM devices
      WHERE customer_id = ?
    `,
      [customerId],
    );

    if (!result[0]) {
      return res.json({
        total: 0,
        success: 0,
        avg_days: null,
      });
    }

    const row = result[0].values[0];

    res.json({
      total_devices: row[0] || 0,
      successful_repairs: row[1] || 0,
      avg_repair_days: row[2] ? Number(row[2]).toFixed(1) : null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { name, phone } = req.body;

    db.run(`INSERT INTO customers (name, phone) VALUES (?, ?)`, [name, phone]);
    saveDb();

    const result = db.exec(
      `SELECT * FROM customers WHERE name = ? AND phone = ? ORDER BY id DESC LIMIT 1`,
      [name, phone],
    );
    const row = result[0].values[0];

    res.status(201).json({
      id: row[0],
      name: row[1],
      phone: row[2],
      created_at: row[3],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const { name, phone } = req.body;

    db.run(`UPDATE customers SET name = ?, phone = ? WHERE id = ?`, [
      name,
      phone,
      req.params.id,
    ]);
    saveDb();

    const result = db.exec(`SELECT * FROM customers WHERE id = ?`, [
      req.params.id,
    ]);
    if (!result[0]) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const row = result[0].values[0];
    res.json({
      id: row[0],
      name: row[1],
      phone: row[2],
      created_at: row[3],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const db = await getDb();
    db.run(`UPDATE devices SET customer_id = NULL WHERE customer_id = ?`, [
      req.params.id,
    ]);
    db.run(`DELETE FROM customers WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
