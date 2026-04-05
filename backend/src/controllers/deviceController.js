const { getDb, saveDb } = require("../config/database");

exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`
      SELECT d.*, c.name as customer_name, c.phone as customer_phone
      FROM devices d
      LEFT JOIN customers c ON d.customer_id = c.id
      ORDER BY d.created_at DESC
    `);

    const devices = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          reception_number: row[1],
          customer_id: row[2],
          device_name: row[3],
          brand: row[4],
          model: row[5],
          serial_number: row[6],
          entry_date: row[7],
          exit_date: row[8],
          status: row[9],
          description: row[10],
          image_path: row[11],
          created_at: row[12],
          updated_at: row[13],
          customer_name: row[14],
          customer_phone: row[15],
        }))
      : [];

    res.json(devices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getOne = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `
      SELECT d.*, c.name as customer_name, c.phone as customer_phone
      FROM devices d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.id = ?
    `,
      [req.params.id],
    );

    if (!result[0]) {
      return res.status(404).json({ error: "Device not found" });
    }

    const row = result[0].values[0];
    const device = {
      id: row[0],
      reception_number: row[1],
      customer_id: row[2],
      device_name: row[3],
      brand: row[4],
      model: row[5],
      serial_number: row[6],
      entry_date: row[7],
      exit_date: row[8],
      status: row[9],
      description: row[10],
      image_path: row[11],
      created_at: row[12],
      updated_at: row[13],
      customer_name: row[14],
      customer_phone: row[15],
    };

    res.json(device);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const {
      reception_number,
      customer_id,
      device_name,
      brand,
      model,
      serial_number,
      entry_date,
      status,
      description,
    } = req.body;

    db.run(
      `INSERT INTO devices (reception_number, customer_id, device_name, brand, model, serial_number, entry_date, status, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reception_number,
        customer_id || null,
        device_name,
        brand || null,
        model || null,
        serial_number || null,
        entry_date,
        status || "در انتظار",
        description || null,
      ],
    );

    // باید قبل از saveDb بخونیم
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

    if (!deviceResult[0]) {
      return res
        .status(500)
        .json({ error: "Failed to retrieve created device" });
    }

    const row = deviceResult[0].values[0];
    res.status(201).json({
      id: row[0],
      reception_number: row[1],
      customer_id: row[2],
      device_name: row[3],
      brand: row[4],
      model: row[5],
      serial_number: row[6],
      entry_date: row[7],
      exit_date: row[8],
      status: row[9],
      description: row[10],
      image_path: row[11],
      created_at: row[12],
      updated_at: row[13],
      customer_name: row[14],
      customer_phone: row[15],
    });
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
      `
      UPDATE devices 
      SET device_name = ?, brand = ?, model = ?, serial_number = ?, 
          exit_date = ?, status = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
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
      `
      SELECT d.*, c.name as customer_name, c.phone as customer_phone
      FROM devices d
      LEFT JOIN customers c ON d.customer_id = c.id
      WHERE d.id = ?
    `,
      [req.params.id],
    );

    const row = result[0].values[0];
    res.json({
      id: row[0],
      reception_number: row[1],
      customer_id: row[2],
      device_name: row[3],
      brand: row[4],
      model: row[5],
      serial_number: row[6],
      entry_date: row[7],
      exit_date: row[8],
      status: row[9],
      description: row[10],
      image_path: row[11],
      created_at: row[12],
      updated_at: row[13],
      customer_name: row[14],
      customer_phone: row[15],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const db = await getDb();
    db.run(`DELETE FROM devices WHERE id = ?`, [req.params.id]);
    saveDb();
    res.json({ message: "Device deleted" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
