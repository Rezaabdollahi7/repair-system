const { getDb, saveDb } = require("../config/database");

// Helper: تبدیل row به object
function rowToCategory(row) {
  return {
    id: row[0],
    name: row[1],
    description: row[2],
    createdAt: row[3],
    updatedAt: row[4],
  };
}

// لیست همه دسته‌بندی‌ها
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec("SELECT * FROM categories ORDER BY name");
    const categories = result[0] ? result[0].values.map(rowToCategory) : [];
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// دریافت یک دسته‌بندی
exports.getById = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const result = db.exec("SELECT * FROM categories WHERE id = ?", [id]);

    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "دسته‌بندی یافت نشد" });
    }

    res.json(rowToCategory(result[0].values[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};


// ایجاد دسته‌بندی جدید
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "نام دسته‌بندی الزامی است" });
    }

    db.run("INSERT INTO categories (name, description) VALUES (?, ?)", [
      name.trim(),
      description || null,
    ]);

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const newId = idResult[0].values[0][0];

    const result = db.exec("SELECT * FROM categories WHERE id = ?", [newId]);

    saveDb();

    res.status(201).json(rowToCategory(result[0].values[0]));
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "این نام قبلاً ثبت شده است" });
    }
    res.status(500).json({ error: error.message });
  }
};

// ویرایش دسته‌بندی
exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "نام دسته‌بندی الزامی است" });
    }

    db.run(
      "UPDATE categories SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [name.trim(), description || null, id],
    );
    saveDb();

    const result = db.exec("SELECT * FROM categories WHERE id = ?", [id]);
    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "دسته‌بندی یافت نشد" });
    }

    res.json(rowToCategory(result[0].values[0]));
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      return res.status(400).json({ error: "این نام قبلاً ثبت شده است" });
    }
    res.status(500).json({ error: error.message });
  }
};

// حذف دسته‌بندی
exports.delete = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // چک کنیم کالایی با این دسته‌بندی وجود داره یا نه
    const itemCheck = db.exec(
      "SELECT COUNT(*) as count FROM items WHERE category_id = ?",
      [id],
    );
    const itemCount = itemCheck[0].values[0][0];

    if (itemCount > 0) {
      return res.status(400).json({
        error: `این دسته‌بندی دارای ${itemCount} کالا است و قابل حذف نیست`,
      });
    }

    db.run("DELETE FROM categories WHERE id = ?", [id]);
    saveDb();

    res.json({ message: "دسته‌بندی با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
