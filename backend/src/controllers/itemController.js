const { getDb, saveDb } = require("../config/database");
const persianToEnglish = require("../utils/persianToEnglish");

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
    sellPrice: row[12],
  };
}
// لیست همه کالاها (با اطلاعات دسته‌بندی)
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const { categoryId, page = 1, limit = 10 } = req.query;

    let baseQuery = `
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (categoryId) {
      baseQuery += ` AND i.category_id = ?`;
      params.push(parseInt(categoryId));
    }

    // Count total
    const countResult = db.exec(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = countResult[0]?.values[0][0] ?? 0;

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    // Get paginated data
    const dataResult = db.exec(
      `SELECT 
        i.*,
        c.name as category_name
       ${baseQuery} 
       ORDER BY i.code 
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const items = dataResult[0]
      ? dataResult[0].values.map((row) => ({
          ...rowToItem(row.slice(0, 13)),
          categoryName: row[13],
        }))
      : [];

    res.json({
      data: items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
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
      ...rowToItem(row.slice(0, 13)),
      categoryName: row[13],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ایجاد کالای جدید
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { code, name, categoryId, unit, minStock, description, sell_price } =
      req.body;

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
   (code, name, category_id, unit, min_stock, description, sell_price) 
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        code.trim(),
        name.trim(),
        categoryId || null,
        unit.trim(),
        minStock || 0,
        description || null,
        sell_price || 0,
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
      ...rowToItem(row.slice(0, 13)),
      categoryName: row[13],
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
    const { code, name, categoryId, unit, minStock, description, sell_price } =
      req.body;

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
    const newSellPrice = sell_price !== undefined ? sell_price : cur[12];

    if (!newCode) return res.status(400).json({ error: "کد کالا الزامی است" });
    if (!newName) return res.status(400).json({ error: "نام کالا الزامی است" });
    if (!newUnit)
      return res.status(400).json({ error: "واحد کالا الزامی است" });

    db.run(
      `UPDATE items 
   SET code = ?, name = ?, category_id = ?, unit = ?, min_stock = ?, 
       description = ?, sell_price = ?, updated_at = CURRENT_TIMESTAMP
   WHERE id = ?`,
      [
        newCode,
        newName,
        newCategoryId,
        newUnit,
        newMinStock,
        newDesc,
        newSellPrice,
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
    res.json({ ...rowToItem(row.slice(0, 13)), categoryName: row[13] });
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
    const { q, categoryId, page = 1, limit = 10 } = req.query;

    let baseQuery = `
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE 1=1
    `;
    const params = [];

    if (q && q.trim()) {
      const searchTerm = persianToEnglish(q.trim()).replace(/\s+/g, " ");
      baseQuery += ` AND (i.code LIKE ? OR i.name LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    if (categoryId) {
      baseQuery += ` AND i.category_id = ?`;
      params.push(parseInt(categoryId));
    }

    // Count total
    const countResult = db.exec(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = countResult[0]?.values[0][0] ?? 0;

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    // Get paginated data
    const dataResult = db.exec(
      `SELECT 
        i.*,
        c.name as category_name
       ${baseQuery} 
       ORDER BY i.code 
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const items = dataResult[0]
      ? dataResult[0].values.map((row) => ({
          ...rowToItem(row.slice(0, 13)),
          categoryName: row[13],
        }))
      : [];

    res.json({
      data: items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// دریافت تاریخچه تراکنش‌های یک کالا
exports.getTransactions = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    // Check if item exists
    const itemCheck = db.exec(`SELECT id FROM items WHERE id = ?`, [id]);
    if (!itemCheck[0] || itemCheck[0].values.length === 0) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    let baseQuery = `
      FROM inventory_transactions it
      LEFT JOIN purchase_invoices pi ON it.reference_id = pi.id AND it.reference_type = 'purchase_invoice'
      WHERE it.item_id = ?
    `;
    const params = [id];

    // Count total
    const countResult = db.exec(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = countResult[0]?.values[0][0] ?? 0;

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 20;
    const offset = (pageNum - 1) * limitNum;

    // Get data
    const dataResult = db.exec(
      `SELECT 
        it.*,
        pi.invoice_number as purchase_invoice_number
       ${baseQuery}
       ORDER BY it.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const transactions = dataResult[0]
      ? dataResult[0].values.map((row) => ({
          id: row[0],
          item_id: row[1],
          type: row[2],
          quantity: row[3],
          unit_price: row[4],
          reference_id: row[5],
          reference_type: row[6],
          note: row[7],
          created_by: row[8],
          created_at: row[9],
          purchase_invoice_number: row[10],
        }))
      : [];

    res.json({
      data: transactions,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
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
          ...rowToItem(row.slice(0, 13)),
          categoryName: row[13],
        }))
      : [];

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.quickPurchase = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { quantity, unit_price, note } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: "تعداد باید بیشتر از صفر باشد" });
    }
    if (!unit_price || unit_price < 0) {
      return res.status(400).json({ error: "قیمت باید مثبت باشد" });
    }

    // Generate invoice number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const countResult = db.exec(`
      SELECT COUNT(*) as count 
      FROM purchase_invoices 
      WHERE date(invoice_date) = date('now')
    `);
    const count = (countResult[0]?.values[0][0] || 0) + 1;
    const invoiceNumber = `PUR-${dateStr}-${count.toString().padStart(3, "0")}`;

    // Create invoice
    const totalAmount = quantity * unit_price;
    db.run(
      `INSERT INTO purchase_invoices 
       (invoice_number, supplier_name, total_amount, paid_amount, payment_status, note)
       VALUES (?, ?, ?, ?, 'paid', ?)`,
      [
        invoiceNumber,
        "خرید سریع",
        totalAmount,
        totalAmount,
        note || "خرید سریع از صفحه جزئیات کالا",
      ],
    );

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const invoiceId = idResult[0].values[0][0];

    // Add item
    db.run(
      `INSERT INTO purchase_invoice_items (invoice_id, item_id, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?)`,
      [invoiceId, id, quantity, unit_price, totalAmount],
    );

    // Update stock
    const itemResult = db.exec(
      `SELECT current_stock, avg_purchase_price FROM items WHERE id = ?`,
      [id],
    );
    const currentStock = itemResult[0].values[0][0] || 0;
    const currentAvgPrice = itemResult[0].values[0][1] || 0;

    const totalCurrentValue = currentStock * currentAvgPrice;
    const newStock = currentStock + quantity;
    const newAvgPrice = (totalCurrentValue + totalAmount) / newStock;

    db.run(
      `UPDATE items SET current_stock = ?, avg_purchase_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStock, newAvgPrice, id],
    );

    // Log transaction
    db.run(
      `INSERT INTO inventory_transactions 
       (item_id, type, quantity, unit_price, reference_id, reference_type, note)
       VALUES (?, 'purchase', ?, ?, ?, 'purchase_invoice', ?)`,
      [id, quantity, unit_price, invoiceId, "خرید سریع"],
    );

    saveDb();

    res.json({
      message: "خرید سریع با موفقیت ثبت شد",
      invoice_number: invoiceNumber,
      new_stock: newStock,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.quickSale = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { quantity, customer_name } = req.body;

    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: "تعداد باید بیشتر از صفر باشد" });
    }

    // Check stock
    const stockCheck = db.exec(
      `SELECT current_stock, name FROM items WHERE id = ?`,
      [id],
    );

    if (!stockCheck[0]?.values[0]) {
      return res.status(404).json({ error: "کالا یافت نشد" });
    }

    const currentStock = stockCheck[0].values[0][0] || 0;
    const itemName = stockCheck[0].values[0][1];

    if (currentStock < quantity) {
      return res.status(400).json({
        error: `موجودی کافی نیست. موجودی فعلی: ${currentStock}`,
      });
    }

    // Generate invoice number
    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
    const countResult = db.exec(`
      SELECT COUNT(*) as count 
      FROM sale_invoices 
      WHERE date(invoice_date) = date('now')
    `);
    const count = (countResult[0]?.values[0][0] || 0) + 1;
    const invoiceNumber = `SAL-${dateStr}-${count.toString().padStart(3, "0")}`;

    // Use a default unit price (you might want to get this from avg_purchase_price)
    const itemResult = db.exec(
      `SELECT avg_purchase_price FROM items WHERE id = ?`,
      [id],
    );
    const unitPrice = itemResult[0]?.values[0][0] || 0;
    const totalAmount = quantity * unitPrice;

    // Create invoice
    db.run(
      `INSERT INTO sale_invoices 
       (invoice_number, customer_name, total_amount, paid_amount, payment_status, note)
       VALUES (?, ?, ?, ?, 'paid', ?)`,
      [
        invoiceNumber,
        customer_name || "فروش سریع",
        totalAmount,
        totalAmount,
        "فروش سریع از صفحه جزئیات کالا",
      ],
    );

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const invoiceId = idResult[0].values[0][0];

    // Add item
    db.run(
      `INSERT INTO sale_invoice_items (invoice_id, item_id, quantity, unit_price, total_price)
       VALUES (?, ?, ?, ?, ?)`,
      [invoiceId, id, quantity, unitPrice, totalAmount],
    );

    // Update stock
    const newStock = currentStock - quantity;
    db.run(
      `UPDATE items SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStock, id],
    );

    // Log transaction
    db.run(
      `INSERT INTO inventory_transactions 
       (item_id, type, quantity, unit_price, reference_id, reference_type, note)
       VALUES (?, 'sale', ?, ?, ?, 'sale_invoice', ?)`,
      [id, -quantity, unitPrice, invoiceId, "فروش سریع"],
    );

    saveDb();

    res.json({
      message: "فروش سریع با موفقیت ثبت شد",
      invoice_number: invoiceNumber,
      new_stock: newStock,
    });
  } catch (error) {
    console.error("Quick sale error:", error);
    res.status(500).json({ error: error.message });
  }
};

// جستجوی کالاها برای استفاده در فاکتور (فقط کالاهای با موجودی > 0)
exports.searchForInvoice = async (req, res) => {
  try {
    const db = await getDb();
    const { q, limit = 20 } = req.query;

    let query = `
      SELECT 
        i.id,
        i.code,
        i.name,
        i.unit,
        i.current_stock,
        i.avg_purchase_price,
        i.sell_price,
        c.name as category_name
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.is_active = 1 AND i.current_stock > 0
    `;

    const params = [];

    if (q && q.trim()) {
      const searchTerm = persianToEnglish(q.trim()).replace(/\s+/g, " ");
      query += ` AND (i.code LIKE ? OR i.name LIKE ?)`;
      params.push(`%${searchTerm}%`, `%${searchTerm}%`);
    }

    query += ` ORDER BY i.name LIMIT ?`;
    params.push(parseInt(limit));

    const stmt = db.prepare(query);
    stmt.bind(params);

    const items = [];
    while (stmt.step()) {
      const row = stmt.get();
      items.push({
        id: row[0],
        code: row[1],
        name: row[2],
        unit: row[3],
        current_stock: row[4],
        avg_purchase_price: row[5],
        sell_price: row[6],
        category_name: row[7],
      });
    }
    stmt.free();

    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
