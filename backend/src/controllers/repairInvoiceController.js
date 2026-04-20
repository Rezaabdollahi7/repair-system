const { getDb, saveDb } = require("../config/database");

// Generate invoice number
function generateInvoiceNumber(db) {
  // Get prefix from settings
  const settingsResult = db.exec(
    `SELECT invoice_prefix FROM settings WHERE id = 1`,
  );
  const prefix = settingsResult[0]?.values[0][0] || "INV-";

  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, "");

  const result = db.exec(`
    SELECT COUNT(*) as count 
    FROM repair_invoices 
    WHERE date(invoice_date) = date('now')
  `);

  const count = (result[0]?.values[0][0] || 0) + 1;
  const paddedCount = count.toString().padStart(4, "0");

  return `${prefix}${dateStr}-${paddedCount}`;
}

// Calculate invoice totals
function calculateInvoiceTotals(items, discountType, discountValue, taxRate) {
  // Calculate subtotal (sum of all items after their individual discounts)
  const subtotal = items.reduce((sum, item) => {
    const itemTotal = item.quantity * item.unit_price;
    let itemDiscount = 0;

    if (item.discount_type === "percentage") {
      itemDiscount = itemTotal * (item.discount_value / 100);
    } else if (item.discount_type === "fixed") {
      itemDiscount = item.discount_value;
    }

    return sum + (itemTotal - itemDiscount);
  }, 0);

  // Calculate overall discount
  let discountAmount = 0;
  if (discountType === "percentage") {
    discountAmount = subtotal * (discountValue / 100);
  } else if (discountType === "fixed") {
    discountAmount = discountValue;
  }

  const afterDiscount = Math.max(0, subtotal - discountAmount);
  const taxAmount = afterDiscount * (taxRate / 100);
  const totalAmount = afterDiscount + taxAmount;

  return {
    subtotal,
    discount_amount: discountAmount,
    tax_amount: taxAmount,
    total_amount: totalAmount,
  };
}

// Update inventory stock when invoice is issued
function updateInventoryOnIssue(db, items) {
  for (const item of items) {
    if (item.item_type === "inventory" && item.item_id) {
      // Decrease stock
      db.run(
        `UPDATE items SET current_stock = current_stock - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [item.quantity, item.item_id],
      );

      // Log transaction
      db.run(
        `INSERT INTO inventory_transactions 
         (item_id, type, quantity, unit_price, reference_id, reference_type, note)
         VALUES (?, 'sale', ?, ?, ?, 'repair_invoice', ?)`,
        [
          item.item_id,
          -item.quantity,
          item.unit_price,
          null,
          "مصرف در فاکتور تعمیر",
        ],
      );
    }
  }
}

// Reverse inventory when invoice is cancelled/deleted
function reverseInventory(db, items) {
  for (const item of items) {
    if (item.item_type === "inventory" && item.item_id) {
      db.run(
        `UPDATE items SET current_stock = current_stock + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [item.quantity, item.item_id],
      );

      db.run(
        `INSERT INTO inventory_transactions 
         (item_id, type, quantity, reference_id, reference_type, note)
         VALUES (?, 'adjustment', ?, ?, 'repair_invoice', ?)`,
        [
          item.item_id,
          item.quantity,
          null,
          "ابطال فاکتور تعمیر - برگشت موجودی",
        ],
      );
    }
  }
}

// Helper: Get device with customer info
function getDeviceWithCustomer(db, deviceId) {
  const result = db.exec(
    `SELECT d.*, c.name as customer_name, c.phone as customer_phone
     FROM devices d
     LEFT JOIN customers c ON d.customer_id = c.id
     WHERE d.id = ?`,
    [deviceId],
  );

  if (!result[0] || result[0].values.length === 0) {
    return null;
  }

  const row = result[0].values[0];
  return {
    id: row[0],
    customer_id: row[1],
    device_name: row[3],
    brand: row[4],
    model: row[5],
    serial_number: row[6],
    customer_name: row[14],
    customer_phone: row[15],
  };
}

// ─────────────────────────────────────────────────────────────────

// Get all repair invoices
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const {
      page = 1,
      limit = 10,
      search,
      status,
      from_date,
      to_date,
      device_id,
    } = req.query;

    let baseQuery = `
      FROM repair_invoices ri
      LEFT JOIN devices d ON ri.device_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      baseQuery += ` AND (ri.invoice_number LIKE ? OR ri.customer_name LIKE ? OR d.device_name LIKE ?)`;
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    if (status) {
      baseQuery += ` AND ri.status = ?`;
      params.push(status);
    }

    if (from_date) {
      baseQuery += ` AND date(ri.invoice_date) >= date(?)`;
      params.push(from_date);
    }

    if (to_date) {
      baseQuery += ` AND date(ri.invoice_date) <= date(?)`;
      params.push(to_date);
    }

    if (device_id) {
      baseQuery += ` AND ri.device_id = ?`;
      params.push(parseInt(device_id));
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
      `SELECT 
        ri.*,
        d.device_name,
        d.brand,
        d.model
       ${baseQuery} 
       ORDER BY ri.invoice_date DESC 
       LIMIT ? OFFSET ?`,
      [...params, limitNum, offset],
    );

    const invoices = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          invoice_number: row[1],
          device_id: row[2],
          customer_id: row[3],
          customer_name: row[4],
          customer_phone: row[5],
          invoice_date: row[6],
          due_date: row[7],
          status: row[8],
          subtotal: row[9],
          discount_amount: row[12],
          tax_amount: row[14],
          total_amount: row[15],
          paid_amount: row[16],
          payment_status: row[17],
          warranty_months: row[18],
          warranty_until: row[19],
          technician_id: row[20],
          notes: row[21],
          created_at: row[23],
          device_name: row[25],
          brand: row[26],
          model: row[27],
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

// Get single invoice with items and payments
exports.getById = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // Get invoice
    const invoiceResult = db.exec(
      `SELECT ri.*, d.device_name, d.brand, d.model, d.serial_number,
              u.full_name as technician_name
       FROM repair_invoices ri
       LEFT JOIN devices d ON ri.device_id = d.id
       LEFT JOIN users u ON ri.technician_id = u.id
       WHERE ri.id = ?`,
      [id],
    );

    if (!invoiceResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const row = invoiceResult[0].values[0];
    const invoice = {
      id: row[0],
      invoice_number: row[1],
      device_id: row[2],
      customer_id: row[3],
      customer_name: row[4],
      customer_phone: row[5],
      invoice_date: row[6],
      due_date: row[7],
      status: row[8],
      subtotal: row[9],
      discount_type: row[10],
      discount_value: row[11],
      discount_amount: row[12],
      tax_rate: row[13],
      tax_amount: row[14],
      total_amount: row[15],
      paid_amount: row[16],
      payment_status: row[17],
      warranty_months: row[18],
      warranty_until: row[19],
      technician_id: row[20],
      notes: row[21],
      created_by: row[22],
      created_at: row[23],
      updated_at: row[24],
      device_name: row[25],
      brand: row[26],
      model: row[27],
      serial_number: row[28],
      technician_name: row[29],
    };

    // Get items
    const itemsResult = db.exec(
      `SELECT 
        rii.*,
        i.code as item_code,
        i.unit as item_unit
       FROM repair_invoice_items rii
       LEFT JOIN items i ON rii.item_id = i.id
       WHERE rii.invoice_id = ?
       ORDER BY rii.sort_order, rii.id`,
      [id],
    );

    invoice.items = itemsResult[0]
      ? itemsResult[0].values.map((row) => ({
          id: row[0],
          invoice_id: row[1],
          item_type: row[2],
          item_id: row[3],
          name: row[4],
          description: row[5],
          quantity: row[6],
          unit: row[7],
          unit_price: row[8],
          discount_type: row[9],
          discount_value: row[10],
          discount_amount: row[11],
          total_price: row[12],
          sort_order: row[13],
          item_code: row[15],
          item_unit: row[16],
        }))
      : [];

    // Get payments
    const paymentsResult = db.exec(
      `SELECT * FROM repair_invoice_payments WHERE invoice_id = ? ORDER BY payment_date DESC`,
      [id],
    );

    invoice.payments = paymentsResult[0]
      ? paymentsResult[0].values.map((row) => ({
          id: row[0],
          invoice_id: row[1],
          amount: row[2],
          payment_method: row[3],
          reference_number: row[4],
          note: row[5],
          payment_date: row[6],
          created_by: row[7],
          created_at: row[8],
        }))
      : [];

    res.json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Create repair invoice
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const {
      device_id,
      customer_name,
      customer_phone,
      invoice_date,
      due_date,
      discount_type,
      discount_value,
      tax_rate,
      warranty_months,
      technician_id,
      notes,
      items,
    } = req.body;

    // Validation
    if (!device_id) {
      return res.status(400).json({ error: "دستگاه باید انتخاب شود" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "حداقل یک آیتم باید اضافه شود" });
    }

    // Get device and customer info
    const device = getDeviceWithCustomer(db, device_id);
    if (!device) {
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber(db);

    for (const item of items) {
      if (item.item_type === "inventory" && item.item_id && !item.unit_price) {
        const itemResult = db.exec(
          `SELECT sell_price, unit FROM items WHERE id = ?`,
          [item.item_id],
        );
        if (itemResult[0]?.values[0]) {
          item.unit_price = itemResult[0].values[0][0] || 0;
          if (!item.unit) {
            item.unit = itemResult[0].values[0][1];
          }
        }
      }

      item.unit_price = Number(item.unit_price) || 0;
      item.quantity = Number(item.quantity) || 1;
    }

    // Calculate totals
    const calculations = calculateInvoiceTotals(
      items,
      discount_type,
      discount_value,
      tax_rate || 0,
    );

    // Calculate warranty until
    let warrantyUntil = null;
    if (warranty_months > 0) {
      const date = invoice_date ? new Date(invoice_date) : new Date();
      date.setMonth(date.getMonth() + warranty_months);
      warrantyUntil = date.toISOString();
    }

    // Insert invoice
    db.run(
      `INSERT INTO repair_invoices 
       (invoice_number, device_id, customer_id, customer_name, customer_phone,
        invoice_date, due_date, status, subtotal, discount_type, discount_value,
        discount_amount, tax_rate, tax_amount, total_amount, warranty_months,
        warranty_until, technician_id, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        invoiceNumber,
        device_id,
        device.customer_id || null,
        customer_name || device.customer_name || "مشتری متفرقه",
        customer_phone || device.customer_phone || null,
        invoice_date || new Date().toISOString(),
        due_date || null,
        calculations.subtotal,
        discount_type || null,
        discount_value || 0,
        calculations.discount_amount,
        tax_rate || 0,
        calculations.tax_amount,
        calculations.total_amount,
        warranty_months || 0,
        warrantyUntil,
        technician_id || null,
        notes || null,
        req.user?.id || null,
      ],
    );

    const idResult = db.exec("SELECT last_insert_rowid() as id");
    const invoiceId = idResult[0].values[0][0];

    // Insert items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.item_type === "inventory" && item.item_id && !item.unit_price) {
        const itemResult = db.exec(
          `SELECT sell_price, unit FROM items WHERE id = ?`,
          [item.item_id],
        );
        if (itemResult[0]?.values[0]) {
          item.unit_price = itemResult[0].values[0][0] || 0;
          if (!item.unit) {
            item.unit = itemResult[0].values[0][1];
          }
        }
      }

      const itemTotal = item.quantity * item.unit_price;
      let itemDiscount = 0;

      if (item.discount_type === "percentage") {
        itemDiscount = itemTotal * (item.discount_value / 100);
      } else if (item.discount_type === "fixed") {
        itemDiscount = item.discount_value || 0;
      }

      const totalPrice = itemTotal - itemDiscount;

      db.run(
        `INSERT INTO repair_invoice_items 
         (invoice_id, item_type, item_id, name, description, quantity, unit,
          unit_price, discount_type, discount_value, discount_amount, total_price, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          item.item_type || "custom",
          item.item_id || null,
          item.name,
          item.description || null,
          item.quantity,
          item.unit || "عدد",
          item.unit_price,
          item.discount_type || null,
          item.discount_value || 0,
          itemDiscount,
          totalPrice,
          i,
        ],
      );
    }

    saveDb();

    res.status(201).json({
      id: invoiceId,
      invoice_number: invoiceNumber,
      total_amount: calculations.total_amount,
      status: "draft",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update invoice (only draft)
exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const {
      customer_name,
      customer_phone,
      invoice_date,
      due_date,
      discount_type,
      discount_value,
      tax_rate,
      warranty_months,
      technician_id,
      notes,
      items,
    } = req.body;

    // Check if invoice exists and is draft
    const checkResult = db.exec(
      `SELECT status FROM repair_invoices WHERE id = ?`,
      [id],
    );

    if (!checkResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const currentStatus = checkResult[0].values[0][0];
    if (currentStatus !== "draft") {
      return res
        .status(400)
        .json({ error: "فقط فاکتورهای پیش‌نویس قابل ویرایش هستند" });
    }

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "حداقل یک آیتم باید اضافه شود" });
    }

    for (const item of items) {
      if (item.item_type === "inventory" && item.item_id && !item.unit_price) {
        const itemResult = db.exec(
          `SELECT sell_price, unit FROM items WHERE id = ?`,
          [item.item_id],
        );
        if (itemResult[0]?.values[0]) {
          item.unit_price = itemResult[0].values[0][0] || 0;
          if (!item.unit) {
            item.unit = itemResult[0].values[0][1];
          }
        }
      }

      item.unit_price = Number(item.unit_price) || 0;
      item.quantity = Number(item.quantity) || 1;
    }
    
    // Calculate totals
    const calculations = calculateInvoiceTotals(
      items,
      discount_type,
      discount_value,
      tax_rate || 0,
    );

    // Calculate warranty until
    let warrantyUntil = null;
    if (warranty_months > 0) {
      const date = invoice_date ? new Date(invoice_date) : new Date();
      date.setMonth(date.getMonth() + warranty_months);
      warrantyUntil = date.toISOString();
    }

    // Update invoice
    db.run(
      `UPDATE repair_invoices SET
        customer_name = ?, customer_phone = ?, invoice_date = ?, due_date = ?,
        discount_type = ?, discount_value = ?, discount_amount = ?,
        tax_rate = ?, tax_amount = ?, total_amount = ?, subtotal = ?,
        warranty_months = ?, warranty_until = ?, technician_id = ?, notes = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        customer_name || null,
        customer_phone || null,
        invoice_date || null,
        due_date || null,
        discount_type || null,
        discount_value || 0,
        calculations.discount_amount,
        tax_rate || 0,
        calculations.tax_amount,
        calculations.total_amount,
        calculations.subtotal,
        warranty_months || 0,
        warrantyUntil,
        technician_id || null,
        notes || null,
        id,
      ],
    );

    // Delete old items
    db.run(`DELETE FROM repair_invoice_items WHERE invoice_id = ?`, [id]);

    // Insert new items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      if (item.item_type === "inventory" && item.item_id && !item.unit_price) {
        const itemResult = db.exec(
          `SELECT sell_price, unit FROM items WHERE id = ?`,
          [item.item_id],
        );
        if (itemResult[0]?.values[0]) {
          item.unit_price = itemResult[0].values[0][0] || 0;
          if (!item.unit) {
            item.unit = itemResult[0].values[0][1];
          }
        }
      }

      const itemTotal = item.quantity * item.unit_price;
      let itemDiscount = 0;

      if (item.discount_type === "percentage") {
        itemDiscount = itemTotal * (item.discount_value / 100);
      } else if (item.discount_type === "fixed") {
        itemDiscount = item.discount_value || 0;
      }

      const totalPrice = itemTotal - itemDiscount;

      db.run(
        `INSERT INTO repair_invoice_items 
         (invoice_id, item_type, item_id, name, description, quantity, unit,
          unit_price, discount_type, discount_value, discount_amount, total_price, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          item.item_type || "custom",
          item.item_id || null,
          item.name,
          item.description || null,
          item.quantity,
          item.unit || "عدد",
          item.unit_price,
          item.discount_type || null,
          item.discount_value || 0,
          itemDiscount,
          totalPrice,
          i,
        ],
      );
    }

    saveDb();

    res.json({ message: "فاکتور با موفقیت ویرایش شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Delete invoice
exports.delete = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // Check status
    const checkResult = db.exec(
      `SELECT status FROM repair_invoices WHERE id = ?`,
      [id],
    );

    if (!checkResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const status = checkResult[0].values[0][0];

    // If issued or paid, reverse inventory
    if (status === "issued" || status === "paid") {
      const itemsResult = db.exec(
        `SELECT item_type, item_id, quantity, unit_price FROM repair_invoice_items WHERE invoice_id = ?`,
        [id],
      );

      if (itemsResult[0]) {
        const items = itemsResult[0].values.map((row) => ({
          item_type: row[0],
          item_id: row[1],
          quantity: row[2],
          unit_price: row[3],
        }));
        reverseInventory(db, items);
      }
    }

    db.run(`DELETE FROM repair_invoices WHERE id = ?`, [id]);

    saveDb();

    res.json({ message: "فاکتور با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Change invoice status
exports.changeStatus = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ["draft", "issued", "paid", "cancelled"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "وضعیت نامعتبر است" });
    }

    // Get current invoice
    const invoiceResult = db.exec(
      `SELECT status, total_amount, paid_amount FROM repair_invoices WHERE id = ?`,
      [id],
    );

    if (!invoiceResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const currentStatus = invoiceResult[0].values[0][0];
    const totalAmount = invoiceResult[0].values[0][1];
    const paidAmount = invoiceResult[0].values[0][2];

    // Validate transition
    if (currentStatus === "cancelled") {
      return res
        .status(400)
        .json({ error: "فاکتور ابطال شده قابل تغییر نیست" });
    }

    if (currentStatus === "paid" && status !== "paid") {
      return res
        .status(400)
        .json({ error: "فاکتور پرداخت شده قابل تغییر نیست" });
    }

    if (status === "paid" && paidAmount < totalAmount) {
      return res.status(400).json({ error: "مبلغ پرداختی کافی نیست" });
    }

    // If changing to issued, update inventory
    if (status === "issued" && currentStatus === "draft") {
      const itemsResult = db.exec(
        `SELECT item_type, item_id, quantity, unit_price FROM repair_invoice_items WHERE invoice_id = ?`,
        [id],
      );

      if (itemsResult[0]) {
        const items = itemsResult[0].values.map((row) => ({
          item_type: row[0],
          item_id: row[1],
          quantity: row[2],
          unit_price: row[3],
        }));
        updateInventoryOnIssue(db, items);
      }
    }

    // If cancelling, reverse inventory
    if (
      status === "cancelled" &&
      (currentStatus === "issued" || currentStatus === "paid")
    ) {
      const itemsResult = db.exec(
        `SELECT item_type, item_id, quantity, unit_price FROM repair_invoice_items WHERE invoice_id = ?`,
        [id],
      );

      if (itemsResult[0]) {
        const items = itemsResult[0].values.map((row) => ({
          item_type: row[0],
          item_id: row[1],
          quantity: row[2],
          unit_price: row[3],
        }));
        reverseInventory(db, items);
      }
    }

    // Update payment status if needed
    let paymentStatus = null;
    if (status === "paid") {
      paymentStatus = "paid";
    } else if (paidAmount > 0 && paidAmount < totalAmount) {
      paymentStatus = "partial";
    } else if (paidAmount === 0) {
      paymentStatus = "pending";
    }

    const updateQuery = paymentStatus
      ? `UPDATE repair_invoices SET status = ?, payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      : `UPDATE repair_invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

    const updateParams = paymentStatus
      ? [status, paymentStatus, id]
      : [status, id];

    db.run(updateQuery, updateParams);

    saveDb();

    res.json({ message: `وضعیت فاکتور به ${status} تغییر کرد` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Add payment
exports.addPayment = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { amount, payment_method, reference_number, note } = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ error: "مبلغ پرداختی باید بیشتر از صفر باشد" });
    }

    // Get invoice
    const invoiceResult = db.exec(
      `SELECT total_amount, paid_amount, status FROM repair_invoices WHERE id = ?`,
      [id],
    );

    if (!invoiceResult[0]?.values[0]) {
      return res.status(404).json({ error: "فاکتور یافت نشد" });
    }

    const totalAmount = invoiceResult[0].values[0][0];
    const currentPaid = invoiceResult[0].values[0][1] || 0;
    const currentStatus = invoiceResult[0].values[0][2];

    if (currentStatus === "draft") {
      return res.status(400).json({ error: "ابتدا باید فاکتور صادر شود" });
    }

    if (currentStatus === "cancelled") {
      return res.status(400).json({ error: "فاکتور ابطال شده است" });
    }

    const newPaid = currentPaid + amount;
    if (newPaid > totalAmount) {
      return res
        .status(400)
        .json({ error: "مبلغ پرداختی بیشتر از مبلغ فاکتور است" });
    }

    // Add payment record
    db.run(
      `INSERT INTO repair_invoice_payments 
       (invoice_id, amount, payment_method, reference_number, note, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        id,
        amount,
        payment_method || "cash",
        reference_number || null,
        note || null,
        req.user?.id || null,
      ],
    );

    // Update invoice paid amount
    const newPaymentStatus = newPaid >= totalAmount ? "paid" : "partial";
    const newStatus = newPaid >= totalAmount ? "paid" : currentStatus;

    db.run(
      `UPDATE repair_invoices 
       SET paid_amount = ?, payment_status = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [newPaid, newPaymentStatus, newStatus, id],
    );

    saveDb();

    res.json({
      message: "پرداخت با موفقیت ثبت شد",
      paid_amount: newPaid,
      payment_status: newPaymentStatus,
      remaining: totalAmount - newPaid,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
