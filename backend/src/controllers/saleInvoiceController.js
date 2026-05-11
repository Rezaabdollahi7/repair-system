const { getDb, saveDb } = require("../config/database");
const persianToEnglish = require("../utils/persianToEnglish");

function generateInvoiceNumber(db) {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");
  const result = db.exec(`
    SELECT COUNT(*) as count 
    FROM sale_invoices 
    WHERE date(invoice_date) = date('now')
  `);
  const count = (result[0]?.values[0][0] || 0) + 1;
  const paddedCount = count.toString().padStart(3, "0");
  return `SAL-${dateStr}-${paddedCount}`;
}

function updateItemAfterSale(db, itemId, quantity, unitPrice) {
  const itemResult = db.exec(`SELECT current_stock FROM items WHERE id = ?`, [
    itemId,
  ]);
  if (!itemResult[0]?.values[0]) return;
  const currentStock = itemResult[0].values[0][0] || 0;
  const newStock = Math.max(0, currentStock - quantity);
  db.run(
    `UPDATE items SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [newStock, itemId],
  );
  db.run(
    `INSERT INTO inventory_transactions (item_id, type, quantity, unit_price, reference_id, reference_type, note) VALUES (?, 'sale', ?, ?, ?, 'sale_invoice', ?)`,
    [itemId, -quantity, unitPrice, null, "فروش از فاکتور"],
  );
}

exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const { page = 1, limit = 10, search, from_date, to_date } = req.query;
    let baseQuery = `FROM sale_invoices WHERE 1=1`;
    const params = [];
    if (search) {
      baseQuery += ` AND (customer_name LIKE ? OR customer_phone LIKE ? OR invoice_number LIKE ?)`;
      const term = `%${persianToEnglish(search)}%`;
      params.push(term, term, term);
    }
    if (from_date) {
      baseQuery += ` AND date(invoice_date) >= date(?)`;
      params.push(from_date);
    }
    if (to_date) {
      baseQuery += ` AND date(invoice_date) <= date(?)`;
      params.push(to_date);
    }
    const countResult = db.exec(`SELECT COUNT(*) ${baseQuery}`, params);
    const total = countResult[0]?.values[0][0] || 0;
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = parseInt(limit) || 10;
    const offset = (pageNum - 1) * limitNum;
    const result = db.exec(
      `SELECT * ${baseQuery} ORDER BY invoice_date DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );
    const invoices = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          invoice_number: row[1],
          customer_id: row[2],
          customer_name: row[3],
          customer_phone: row[4],
          invoice_date: row[5],
          total_amount: row[6],
          paid_amount: row[7],
          payment_status: row[8],
          note: row[9],
          created_by: row[10],
          created_at: row[11],
          updated_at: row[12],
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

exports.getById = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const invoiceResult = db.exec(`SELECT * FROM sale_invoices WHERE id = ?`, [
      id,
    ]);
    if (!invoiceResult[0]?.values[0])
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    const row = invoiceResult[0].values[0];
    const invoice = {
      id: row[0],
      invoice_number: row[1],
      customer_id: row[2],
      customer_name: row[3],
      customer_phone: row[4],
      invoice_date: row[5],
      total_amount: row[6],
      paid_amount: row[7],
      payment_status: row[8],
      note: row[9],
      created_by: row[10],
      created_at: row[11],
      updated_at: row[12],
    };
    const itemsResult = db.exec(
      `SELECT sii.*, i.code, i.name, i.unit, i.current_stock FROM sale_invoice_items sii JOIN items i ON sii.item_id = i.id WHERE sii.invoice_id = ? ORDER BY sii.id`,
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
          current_stock: row[10],
        }))
      : [];
    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const {
      customer_id,
      customer_name,
      customer_phone,
      invoice_date,
      paid_amount,
      note,
      items,
    } = req.body;
    if (!items || items.length === 0)
      return res.status(400).json({ error: "حداقل یک کالا باید انتخاب شود" });

    for (const item of items) {
      if (item.item_type === "inventory") {
        if (!item.item_id || !item.quantity || item.quantity <= 0)
          return res.status(400).json({ error: "مشخصات کالاها ناقص است" });
        const stockCheck = db.exec(
          `SELECT current_stock, name FROM items WHERE id = ?`,
          [item.item_id],
        );
        if (!stockCheck[0]?.values[0])
          return res
            .status(400)
            .json({ error: `کالا با شناسه ${item.item_id} یافت نشد` });
        const currentStock = stockCheck[0].values[0][0] || 0;
        const itemName = stockCheck[0].values[0][1];
        if (currentStock < item.quantity)
          return res.status(400).json({
            error: `موجودی کالای "${itemName}" کافی نیست. موجودی فعلی: ${currentStock}`,
          });
      } else {
        if (!item.name || !item.quantity || item.quantity <= 0)
          return res
            .status(400)
            .json({ error: "نام و تعداد آیتم دلخواه الزامی است" });
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

    db.run(
      `INSERT INTO sale_invoices (invoice_number, customer_id, customer_name, customer_phone, invoice_date, total_amount, paid_amount, payment_status, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        customer_id || null,
        customer_name || null,
        customer_phone || null,
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

    for (const item of items) {
      const totalPrice = item.quantity * item.unit_price;
      db.run(
        `INSERT INTO sale_invoice_items (invoice_id, item_id, quantity, unit_price, total_price) VALUES (?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.item_type === "inventory" ? item.item_id : null,
          item.quantity,
          item.unit_price,
          totalPrice,
        ],
      );
      if (item.item_type === "inventory" && item.item_id) {
        updateItemAfterSale(db, item.item_id, item.quantity, item.unit_price);
      }
    }

    saveDb();
    res.status(201).json({
      id: invoiceId,
      invoice_number: invoiceNumber,
      total_amount: totalAmount,
      payment_status: paymentStatus,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updatePayment = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { paid_amount } = req.body;
    const invoiceResult = db.exec(
      `SELECT total_amount FROM sale_invoices WHERE id = ?`,
      [id],
    );
    if (!invoiceResult[0]?.values[0])
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    const totalAmount = invoiceResult[0].values[0][0];
    const paymentStatus =
      paid_amount >= totalAmount
        ? "paid"
        : paid_amount > 0
          ? "partial"
          : "pending";
    db.run(
      `UPDATE sale_invoices SET paid_amount = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
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

exports.delete = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const itemsResult = db.exec(
      `SELECT item_id, quantity FROM sale_invoice_items WHERE invoice_id = ?`,
      [id],
    );
    if (!itemsResult[0]?.values.length)
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    for (const row of itemsResult[0].values) {
      const itemId = row[0];
      const quantity = row[1];
      if (itemId) {
        const stockResult = db.exec(
          `SELECT current_stock FROM items WHERE id = ?`,
          [itemId],
        );
        const currentStock = stockResult[0]?.values[0][0] || 0;
        const newStock = currentStock + quantity;
        db.run(
          `UPDATE items SET current_stock = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newStock, itemId],
        );
        db.run(
          `INSERT INTO inventory_transactions (item_id, type, quantity, reference_id, reference_type, note) VALUES (?, 'adjustment', ?, ?, 'sale_invoice', ?)`,
          [itemId, quantity, id, "ابطال فاکتور فروش"],
        );
      }
    }
    db.run(`DELETE FROM sale_invoices WHERE id = ?`, [id]);
    saveDb();
    res.json({ message: "فاکتور فروش حذف و موجودی کالاها بازگردانده شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
