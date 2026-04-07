const { getDb, saveDb } = require("../config/database");

exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT id, name, phone FROM customers ORDER BY name`,
    );
    const customers = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          name: row[1],
          phone: row[2],
        }))
      : [];
    res.json(customers);
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
      SELECT * FROM devices 
      WHERE customer_id = ? 
      ORDER BY created_at DESC
    `,
      [req.params.id],
    );

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
        }))
      : [];

    res.json(devices);
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
