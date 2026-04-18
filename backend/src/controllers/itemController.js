const { getDb, saveDb } = require("../config/database");

// Helper: تبدیل row به object
function rowToItem(row) {
  return {
    id: row[0],
    categoryId: row[1],
    name: row[2],
    code: row[3],
    unit: row[4],
    minStock: row[5],
    currentStock: row[6],
    avgPurchasePrice: row[7],
    description: row[8],
    isActive: row[9],
    createdAt: row[10],
    updatedAt: row[11],
  };
}
// لیست همه کالاها (با اطلاعات دسته‌بندی)
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`
      SELECT 
        i.*,
        c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      ORDER BY i.code
    `);

    const items = result[0]
      ? result[0].values.map((row) => ({
          ...rowToItem(row.slice(0, 12)),
          categoryName: row[12],
        }))
      : [];

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// دریافت یک کالا
exports.getById = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const result = db.exec(
      `
      SELECT 
        i.*,
        c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.id = ?
    `,
      [id],
    );

    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const row = result[0].values[0];
    res.json({
      ...rowToItem(row.slice(0, 12)),
      categoryName: row[12],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ایجاد کالای جدید
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { code, name, categoryId, unit, minStock, description } = req.body;

    // Validation
    if (!code || !code.trim()) {
      return res.status(400).json({ error: "کد کالا الزامی است" });
    }
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "نام کالا الزامی است" });
    }
    if (!unit || !unit.trim()) {
      return res.status(400).json({ error: "واحد کالا الزامی است" });
    }

    db.run(
      `INSERT INTO items 
       (code, name, category_id, unit, min_stock, description) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        code.trim(),
        name.trim(),
        categoryId || null,
        unit.trim(),
        minStock || 0,
        description || null,
      ],
    );

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const newId = idResult[0].values[0][0];

    const result = db.exec(
      `
      SELECT 
        i.*,
        c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.id = ?
    `,
      [newId],
    );

    saveDb();

    const row = result[0].values[0];
    res.status(201).json({
      ...rowToItem(row.slice(0, 12)),
      categoryName: row[12],
    });
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "این کد کالا قبلاً ثبت شده است" });
    }
    res.status(500).json({ error: error.message });
  }
};

// ویرایش کالا
exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { code, name, categoryId, unit, minStock, description } = req.body;

    // اول کالای فعلی رو بگیر
    const existing = db.exec(
      `SELECT i.*, c.name as category_name
       FROM items i
       LEFT JOIN categories c ON i.category_id = c.id
       WHERE i.id = ?`,
      [id],
    );
    if (!existing[0] || existing[0].values.length === 0)
      return res.status(404).json({ error: "کالا یافت نشد" });

    const cur = existing[0].values[0];
    // مقادیر جدید یا همون قبلی
    const newCode = code !== undefined ? code.trim() : cur[3];
    const newName = name !== undefined ? name.trim() : cur[2];
    const newUnit = unit !== undefined ? unit.trim() : cur[4];
    const newMinStock = minStock !== undefined ? minStock : cur[5];
    const newDesc = description !== undefined ? description : cur[8];
    const newCategoryId = categoryId !== undefined ? categoryId : cur[1];

    if (!newCode) return res.status(400).json({ error: "کد کالا الزامی است" });
    if (!newName) return res.status(400).json({ error: "نام کالا الزامی است" });
    if (!newUnit)
      return res.status(400).json({ error: "واحد کالا الزامی است" });

    db.run(
      `UPDATE items 
       SET code = ?, name = ?, category_id = ?, unit = ?, min_stock = ?, description = ?, 
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        newCode,
        newName,
        newCategoryId,
        newUnit,
        newMinStock ?? 0,
        newDesc ?? null,
        id,
      ],
    );

    const result = db.exec(
      `SELECT i.*, c.name as category_name
       FROM items i
       LEFT JOIN categories c ON i.category_id = c.id
       WHERE i.id = ?`,
      [id],
    );

    saveDb();

    const row = result[0].values[0];
    res.json({ ...rowToItem(row.slice(0, 12)), categoryName: row[12] });
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed"))
      return res.status(400).json({ error: "این کد کالا قبلاً ثبت شده است" });
    res.status(500).json({ error: error.message });
  }
};

// جستجو در کالاها
exports.search = async (req, res) => {
  try {
    const db = await getDb();
    const { q, categoryId } = req.query;

    let query = `
      SELECT i.*, c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE 1=1
    `;

    const params = [];

    if (q) {
      const searchTerm = q.trim().replace(/\s+/g, " ");
      query += ` AND (i.code LIKE ? OR i.name LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    if (categoryId) {
      query += ` AND i.category_id = ?`;
      params.push(parseInt(categoryId));
    }

    query += ` ORDER BY i.code`;

    const stmt = db.prepare(query);
    stmt.bind(params);

    const items = [];
    while (stmt.step()) {
      const row = stmt.get();
      items.push({
        ...rowToItem(Object.values(row).slice(0, 12)),
        categoryName: row[12],
      });
    }
    stmt.free();

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// حذف کالا
exports.delete = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // چک کنیم آیا این کالا در تراکنش‌ها استفاده شده
    const txCheck = db.exec(
      "SELECT COUNT(*) as count FROM inventory_transactions WHERE item_id = ?",
      [id],
    );
    const txCount = txCheck[0].values[0][0];

    if (txCount > 0) {
      return res.status(400).json({
        error: "این کالا در تراکنش‌ها استفاده شده و قابل حذف نیست",
      });
    }

    db.run("DELETE FROM items WHERE id = ?", [id]);
    saveDb();

    res.json({ message: "کالا با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// کالاهای کم‌موجود
exports.getLowStock = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`
      SELECT 
        i.*,
        c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.current_stock <= i.min_stock
      ORDER BY (i.min_stock - i.current_stock) DESC
    `);

    const items = result[0]
      ? result[0].values.map((row) => ({
          ...rowToItem(row.slice(0, 12)),
          categoryName: row[12],
        }))
      : [];

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
