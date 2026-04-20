const { getDb, saveDb } = require("../config/database");

// Get all services
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    
    // Create table if not exists
    db.run(`
      CREATE TABLE IF NOT EXISTS services (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        default_price REAL DEFAULT 0,
        unit TEXT DEFAULT 'خدمت',
        is_active INTEGER DEFAULT 1,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert default services if empty
    const countResult = db.exec(`SELECT COUNT(*) as count FROM services`);
    const count = countResult[0]?.values[0][0] || 0;
    
    if (count === 0) {
      const defaultServices = [
        ["دستمزد تعمیر", "هزینه تعمیر دستگاه", 0, "خدمت"],
        ["هزینه تست و عیب‌یابی", "بررسی اولیه دستگاه", 0, "خدمت"],
        ["هزینه نصب قطعه", "نصب قطعات روی برد", 0, "خدمت"],
        ["هزینه برنامه‌ریزی", "برنامه‌ریزی آی‌سی و میکروکنترلر", 0, "خدمت"],
      ];
      
      for (const [name, desc, price, unit] of defaultServices) {
        db.run(
          `INSERT INTO services (name, description, default_price, unit) VALUES (?, ?, ?, ?)`,
          [name, desc, price, unit]
        );
      }
      saveDb();
    }
    
    const result = db.exec(
      `SELECT * FROM services WHERE is_active = 1 ORDER BY sort_order, name`
    );
    
    const services = result[0] ? result[0].values.map(row => ({
      id: row[0],
      name: row[1],
      description: row[2],
      default_price: row[3],
      unit: row[4],
      is_active: row[5],
      sort_order: row[6]
    })) : [];
    
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create service
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { name, description, default_price, unit } = req.body;
    
    if (!name?.trim()) {
      return res.status(400).json({ error: "نام خدمت الزامی است" });
    }
    
    db.run(
      `INSERT INTO services (name, description, default_price, unit) VALUES (?, ?, ?, ?)`,
      [name.trim(), description || null, default_price || 0, unit || 'خدمت']
    );
    
    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const newId = idResult[0].values[0][0];
    
    saveDb();
    
    res.status(201).json({ id: newId, name: name.trim() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update service
exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { name, description, default_price, unit, is_active, sort_order } = req.body;
    
    db.run(
      `UPDATE services SET 
        name = ?, description = ?, default_price = ?, unit = ?, 
        is_active = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [name, description, default_price, unit, is_active, sort_order, id]
    );
    
    saveDb();
    
    res.json({ message: "خدمت با موفقیت ویرایش شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete service
exports.delete = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    
    db.run(`DELETE FROM services WHERE id = ?`, [id]);
    
    saveDb();
    
    res.json({ message: "خدمت با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};