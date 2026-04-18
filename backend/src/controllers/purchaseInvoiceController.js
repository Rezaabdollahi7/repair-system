const { getDb, saveDb } = require("../config/database");

// Helper: Generate invoice number (YYYYMMDD-XXX)
function generateInvoiceNumber(db) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const result = db.exec(`
    SELECT COUNT(*) as count 
    FROM purchase_invoices 
    WHERE date(invoice_date) = date('now')
  `);

  const count = (result[0]?.values[0][0] || 0) + 1;
  const paddedCount = count.toString().padStart(3, "0");

  return `PUR-${dateStr}-${paddedCount}`;
}

// Helper: Update item stock and avg price
function updateItemAfterPurchase(db, itemId, quantity, unitPrice) {
  // Get current item
  const itemResult = db.exec(
    `SELECT current_stock, avg_purchase_price FROM items WHERE id = ?`,
    [itemId],
  );

  if (!itemResult[0]?.values[0]) return;

  const currentStock = itemResult[0].values[0][0] || 0;
  const currentAvgPrice = itemResult[0].values[0][1] || 0;

  // Calculate new average price
  const totalCurrentValue = currentStock * currentAvgPrice;
  const newPurchaseValue = quantity * unitPrice;
  const newStock = currentStock + quantity;
  const newAvgPrice =
    newStock > 0
      ? (totalCurrentValue + newPurchaseValue) / newStock
      : unitPrice;

  // Update item
  db.run(
    `UPDATE items 
     SET current_stock = ?, avg_purchase_price = ?, updated_at = CURRENT_TIMESTAMP 
     WHERE id = ?`,
    [newStock, newAvgPrice, itemId],
  );

  // Log transaction
  db.run(
    `INSERT INTO inventory_transactions 
     (item_id, type, quantity, unit_price, reference_id, reference_type, note, created_by)
     VALUES (?, 'purchase', ?, ?, ?, 'purchase_invoice', ?, ?)`,
    [itemId, quantity, unitPrice, null, "خرید از فاکتور", null],
  );
}

// ────────────────────────────────────────────────────────────────

// Get all purchase invoices
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const { page = 1, limit = 10, supplier, from_date, to_date } = req.query;

    let baseQuery = `FROM purchase_invoices WHERE 1=1`;
    const params = [];

    if (supplier) {
      baseQuery += ` AND supplier_name LIKE ?`;
      params.push(`%${supplier}%`);
    }
    if (from_date) {
      baseQuery += ` AND date(invoice_date) >= date(?)`;
      params.push(from_date);
    }
    if (to_date) {
      baseQuery += ` AND date(invoice_date) <= date(?)`;
      params.push(to_date);
    }

    // Count
    const countResult = db.exec(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = countResult[0]?.values[0][0] || 0;

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;

    // Get data
    const result = db.exec(
      `SELECT * ${baseQuery} ORDER BY invoice_date DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const invoices = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          invoice_number: row[1],
          supplier_name: row[2],
          invoice_date: row[3],
          total_amount: row[4],
          paid_amount: row[5],
          payment_status: row[6],
          note: row[7],
          created_by: row[8],
          created_at: row[9],
          updated_at: row[10],
        }))
      : [];

    res.json({
      data: invoices,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get single invoice with items
exports.getById = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // Get invoice
    const invoiceResult = db.exec(
      `SELECT * FROM purchase_invoices WHERE id = ?`,
      [id],
    );

    if (!invoiceResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const row = invoiceResult[0].values[0];
    const invoice = {
      id: row[0],
      invoice_number: row[1],
      supplier_name: row[2],
      invoice_date: row[3],
      total_amount: row[4],
      paid_amount: row[5],
      payment_status: row[6],
      note: row[7],
      created_by: row[8],
      created_at: row[9],
      updated_at: row[10],
    };

    // Get items
    const itemsResult = db.exec(
      `SELECT 
        pii.*,
        i.code,
        i.name,
        i.unit
       FROM purchase_invoice_items pii
       JOIN items i ON pii.item_id = i.id
       WHERE pii.invoice_id = ?
       ORDER BY pii.id`,
      [id],
    );

    invoice.items = itemsResult[0]
      ? itemsResult[0].values.map((row) => ({
          id: row[0],
          invoice_id: row[1],
          item_id: row[2],
          quantity: row[3],
          unit_price: row[4],
          total_price: row[5],
          created_at: row[6],
          item_code: row[7],
          item_name: row[8],
          item_unit: row[9],
        }))
      : [];

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create purchase invoice
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { supplier_name, invoice_date, paid_amount, note, items } = req.body;

    // Validation
    if (!items || items.length === 0) {
      return res.status(400).json({ error: "حداقل یک کالا باید انتخاب شود" });
    }

    // Validate each item
    for (const item of items) {
      if (!item.item_id || !item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: "مشخصات کالاها ناقص است" });
      }
      if (!item.unit_price || item.unit_price < 0) {
        return res.status(400).json({ error: "قیمت واحد باید مثبت باشد" });
      }

      // Check if item exists
      const itemCheck = db.exec(`SELECT id FROM items WHERE id = ?`, [
        item.item_id,
      ]);
      if (!itemCheck[0]?.values[0]) {
        return res
          .status(400)
          .json({ error: `کالا با شناسه ${item.item_id} یافت نشد` });
      }
    }

    const invoiceNumber = generateInvoiceNumber(db);
    const totalAmount = items.reduce(
      (sum, item) => sum + item.quantity * item.unit_price,
      0,
    );
    const paymentStatus =
      paid_amount >= totalAmount
        ? "paid"
        : paid_amount > 0
          ? "partial"
          : "pending";

    // Insert invoice
    db.run(
      `INSERT INTO purchase_invoices 
       (invoice_number, supplier_name, invoice_date, total_amount, paid_amount, payment_status, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        supplier_name || null,
        invoice_date || new Date().toISOString(),
        totalAmount,
        paid_amount || 0,
        paymentStatus,
        note || null,
        req.user?.id || null,
      ],
    );

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const invoiceId = idResult[0].values[0][0];

    // Insert items and update stock
    for (const item of items) {
      const totalPrice = item.quantity * item.unit_price;

      db.run(
        `INSERT INTO purchase_invoice_items 
         (invoice_id, item_id, quantity, unit_price, total_price)
         VALUES (?, ?, ?, ?, ?)`,
        [invoiceId, item.item_id, item.quantity, item.unit_price, totalPrice],
      );

      // Update item stock and avg price
      updateItemAfterPurchase(db, item.item_id, item.quantity, item.unit_price);
    }

    saveDb();

    // Return created invoice
    const result = db.exec(`SELECT * FROM purchase_invoices WHERE id = ?`, [
      invoiceId,
    ]);

    const row = result[0].values[0];
    res.status(201).json({
      id: row[0],
      invoice_number: row[1],
      supplier_name: row[2],
      invoice_date: row[3],
      total_amount: row[4],
      paid_amount: row[5],
      payment_status: row[6],
      note: row[7],
      created_by: row[8],
      created_at: row[9],
      updated_at: row[10],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update payment status
exports.updatePayment = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { paid_amount } = req.body;

    const invoiceResult = db.exec(
      `SELECT total_amount FROM purchase_invoices WHERE id = ?`,
      [id],
    );

    if (!invoiceResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const totalAmount = invoiceResult[0].values[0][0];
    const paymentStatus =
      paid_amount >= totalAmount
        ? "paid"
        : paid_amount > 0
          ? "partial"
          : "pending";

    db.run(
      `UPDATE purchase_invoices 
       SET paid_amount = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [paid_amount, paymentStatus, id],
    );

    saveDb();

    res.json({
      message: "وضعیت پرداخت بروز شد",
      payment_status: paymentStatus,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete invoice (with stock reversal)
exports.delete = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // Get invoice items
    const itemsResult = db.exec(
      `SELECT item_id, quantity, unit_price FROM purchase_invoice_items WHERE invoice_id = ?`,
      [id],
    );

    if (!itemsResult[0]?.values.length) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    // Reverse stock updates
    for (const row of itemsResult[0].values) {
      const itemId = row[0];
      const quantity = row[1];

      // Get current stock
      const stockResult = db.exec(
        `SELECT current_stock FROM items WHERE id = ?`,
        [itemId],
      );

      const currentStock = stockResult[0]?.values[0][0] || 0;
      const newStock = Math.max(0, currentStock - quantity);

      db.run(
        `UPDATE items SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newStock, itemId],
      );

      // Add reversal transaction
      db.run(
        `INSERT INTO inventory_transactions 
         (item_id, type, quantity, reference_id, reference_type, note)
         VALUES (?, 'adjustment', ?, ?, 'purchase_invoice', ?)`,
        [itemId, -quantity, id, "حذف فاکتور خرید"],
      );
    }

    // Delete invoice (cascade deletes items)
    db.run(`DELETE FROM purchase_invoices WHERE id = ?`, [id]);

    saveDb();

    res.json({ message: "فاکتور و تراکنش‌های مربوطه حذف شدند" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
