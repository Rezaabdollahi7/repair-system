const { getDb } = require("../config/database");

// گزارش موجودی فعلی همه کالاها
exports.getStockReport = async (req, res) => {
  try {
    const db = await getDb();
    const { categoryId, lowStockOnly } = req.query;

    let query = `
      SELECT 
        i.id,
        i.code,
        i.name,
        i.unit,
        i.current_stock,
        i.min_stock,
        i.avg_purchase_price,
        c.name as category_name,
        CASE 
          WHEN i.current_stock = 0 THEN 'critical'
          WHEN i.current_stock <= i.min_stock THEN 'low'
          ELSE 'good'
        END as stock_status
      FROM items i
      LEFT JOIN categories c ON i.category_id = c.id
      WHERE i.is_active = 1
    `;

    const params = [];

    if (categoryId) {
      query += ` AND i.category_id = ?`;
      params.push(parseInt(categoryId));
    }

    if (lowStockOnly === "true") {
      query += ` AND i.current_stock <= i.min_stock`;
    }

    query += ` ORDER BY i.current_stock ASC, i.name ASC`;

    const result = db.exec(query, params);

    const items = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          code: row[1],
          name: row[2],
          unit: row[3],
          current_stock: row[4],
          min_stock: row[5],
          avg_purchase_price: row[6],
          category_name: row[7],
          stock_status: row[8],
        }))
      : [];

    // Summary statistics
    const totalItems = items.length;
    const lowStockCount = items.filter((i) => i.stock_status === "low").length;
    const criticalCount = items.filter(
      (i) => i.stock_status === "critical",
    ).length;
    const totalValue = items.reduce(
      (sum, i) => sum + i.current_stock * i.avg_purchase_price,
      0,
    );

    res.json({
      data: items,
      summary: {
        total_items: totalItems,
        low_stock_count: lowStockCount,
        critical_count: criticalCount,
        total_inventory_value: totalValue,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// گزارش خرید در بازه زمانی
exports.getPurchaseReport = async (req, res) => {
  try {
    const db = await getDb();
    const { from_date, to_date } = req.query;

    let query = `
      SELECT 
        pi.id,
        pi.invoice_number,
        pi.supplier_name,
        pi.invoice_date,
        pi.total_amount,
        pi.paid_amount,
        pi.payment_status,
        COUNT(pii.id) as item_count,
        SUM(pii.quantity) as total_quantity
      FROM purchase_invoices pi
      LEFT JOIN purchase_invoice_items pii ON pi.id = pii.invoice_id
      WHERE 1=1
    `;

    const params = [];

    if (from_date) {
      query += ` AND date(pi.invoice_date) >= date(?)`;
      params.push(from_date);
    }
    if (to_date) {
      query += ` AND date(pi.invoice_date) <= date(?)`;
      params.push(to_date);
    }

    query += ` GROUP BY pi.id ORDER BY pi.invoice_date DESC`;

    const result = db.exec(query, params);

    const invoices = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          invoice_number: row[1],
          supplier_name: row[2],
          invoice_date: row[3],
          total_amount: row[4],
          paid_amount: row[5],
          payment_status: row[6],
          item_count: row[7],
          total_quantity: row[8],
        }))
      : [];

    // Summary
    const totalPurchase = invoices.reduce(
      (sum, inv) => sum + inv.total_amount,
      0,
    );
    const totalPaid = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);

    res.json({
      data: invoices,
      summary: {
        total_invoices: invoices.length,
        total_purchase_amount: totalPurchase,
        total_paid_amount: totalPaid,
        total_remaining: totalPurchase - totalPaid,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// گزارش فروش در بازه زمانی
exports.getSaleReport = async (req, res) => {
  try {
    const db = await getDb();
    const { from_date, to_date } = req.query;

    let query = `
      SELECT 
        si.id,
        si.invoice_number,
        si.customer_name,
        si.customer_phone,
        si.invoice_date,
        si.total_amount,
        si.paid_amount,
        si.payment_status,
        COUNT(sii.id) as item_count,
        SUM(sii.quantity) as total_quantity
      FROM sale_invoices si
      LEFT JOIN sale_invoice_items sii ON si.id = sii.invoice_id
      WHERE 1=1
    `;

    const params = [];

    if (from_date) {
      query += ` AND date(si.invoice_date) >= date(?)`;
      params.push(from_date);
    }
    if (to_date) {
      query += ` AND date(si.invoice_date) <= date(?)`;
      params.push(to_date);
    }

    query += ` GROUP BY si.id ORDER BY si.invoice_date DESC`;

    const result = db.exec(query, params);

    const invoices = result[0]
      ? result[0].values.map((row) => ({
          id: row[0],
          invoice_number: row[1],
          customer_name: row[2],
          customer_phone: row[3],
          invoice_date: row[4],
          total_amount: row[5],
          paid_amount: row[6],
          payment_status: row[7],
          item_count: row[8],
          total_quantity: row[9],
        }))
      : [];

    // Summary
    const totalSales = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
    const totalReceived = invoices.reduce(
      (sum, inv) => sum + inv.paid_amount,
      0,
    );

    res.json({
      data: invoices,
      summary: {
        total_invoices: invoices.length,
        total_sales_amount: totalSales,
        total_received_amount: totalReceived,
        total_remaining: totalSales - totalReceived,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// گزارش سود/زیان
exports.getProfitReport = async (req, res) => {
  try {
    const db = await getDb();
    const { from_date, to_date } = req.query;

    // Get all sale items with their purchase cost
    let query = `
      SELECT 
        sii.item_id,
        i.name as item_name,
        i.code as item_code,
        SUM(sii.quantity) as total_quantity,
        SUM(sii.total_price) as total_revenue,
        SUM(sii.quantity * i.avg_purchase_price) as total_cost
      FROM sale_invoice_items sii
      JOIN items i ON sii.item_id = i.id
      JOIN sale_invoices si ON sii.invoice_id = si.id
      WHERE 1=1
    `;

    const params = [];

    if (from_date) {
      query += ` AND date(si.invoice_date) >= date(?)`;
      params.push(from_date);
    }
    if (to_date) {
      query += ` AND date(si.invoice_date) <= date(?)`;
      params.push(to_date);
    }

    query += ` GROUP BY sii.item_id ORDER BY (total_revenue - total_cost) DESC`;

    const result = db.exec(query, params);

    const items = result[0]
      ? result[0].values.map((row) => ({
          item_id: row[0],
          item_name: row[1],
          item_code: row[2],
          total_quantity: row[3],
          total_revenue: row[4],
          total_cost: row[5] || 0,
          profit: row[4] - (row[5] || 0),
          profit_margin:
            row[4] > 0 ? ((row[4] - (row[5] || 0)) / row[4]) * 100 : 0,
        }))
      : [];

    // Summary
    const totalRevenue = items.reduce((sum, i) => sum + i.total_revenue, 0);
    const totalCost = items.reduce((sum, i) => sum + i.total_cost, 0);
    const totalProfit = totalRevenue - totalCost;
    const overallMargin =
      totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

    res.json({
      data: items,
      summary: {
        total_revenue: totalRevenue,
        total_cost: totalCost,
        total_profit: totalProfit,
        profit_margin: overallMargin,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// آمار کلی برای داشبورد
exports.getDashboardStats = async (req, res) => {
  try {
    const db = await getDb();

    // Today's date
    const today = new Date().toISOString().split("T")[0];

    // Items count
    const itemsResult = db.exec(
      `SELECT COUNT(*) as count FROM items WHERE is_active = 1`,
    );
    const totalItems = itemsResult[0]?.values[0][0] || 0;

    // Low stock count
    const lowStockResult = db.exec(`
      SELECT COUNT(*) as count FROM items 
      WHERE current_stock <= min_stock AND is_active = 1
    `);
    const lowStockCount = lowStockResult[0]?.values[0][0] || 0;

    // Today's purchases
    const todayPurchaseResult = db.exec(
      `
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM purchase_invoices 
      WHERE date(invoice_date) = date(?)
    `,
      [today],
    );
    const todayPurchase = todayPurchaseResult[0]?.values[0][0] || 0;

    // Today's sales
    const todaySaleResult = db.exec(
      `
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM sale_invoices 
      WHERE date(invoice_date) = date(?)
    `,
      [today],
    );
    const todaySale = todaySaleResult[0]?.values[0][0] || 0;

    // Month purchase
    const monthPurchaseResult = db.exec(`
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM purchase_invoices 
      WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')
    `);
    const monthPurchase = monthPurchaseResult[0]?.values[0][0] || 0;

    // Month sale
    const monthSaleResult = db.exec(`
      SELECT COALESCE(SUM(total_amount), 0) as total 
      FROM sale_invoices 
      WHERE strftime('%Y-%m', invoice_date) = strftime('%Y-%m', 'now')
    `);
    const monthSale = monthSaleResult[0]?.values[0][0] || 0;

    // Recent transactions (last 10)
    const recentResult = db.exec(`
      SELECT 
        it.*,
        i.name as item_name,
        i.code as item_code
      FROM inventory_transactions it
      JOIN items i ON it.item_id = i.id
      ORDER BY it.created_at DESC
      LIMIT 10
    `);

    const recentTransactions = recentResult[0]
      ? recentResult[0].values.map((row) => ({
          id: row[0],
          item_id: row[1],
          type: row[2],
          quantity: row[3],
          unit_price: row[4],
          created_at: row[9],
          item_name: row[10],
          item_code: row[11],
        }))
      : [];

    // Top selling items
    const topItemsResult = db.exec(`
      SELECT 
        i.id,
        i.name,
        i.code,
        SUM(sii.quantity) as sold_quantity,
        SUM(sii.total_price) as revenue
      FROM sale_invoice_items sii
      JOIN items i ON sii.item_id = i.id
      GROUP BY i.id
      ORDER BY revenue DESC
      LIMIT 5
    `);

    const topItems = topItemsResult[0]
      ? topItemsResult[0].values.map((row) => ({
          id: row[0],
          name: row[1],
          code: row[2],
          sold_quantity: row[3],
          revenue: row[4],
        }))
      : [];

    res.json({
      items: {
        total: totalItems,
        low_stock: lowStockCount,
      },
      today: {
        purchase: todayPurchase,
        sale: todaySale,
        net: todaySale - todayPurchase,
      },
      month: {
        purchase: monthPurchase,
        sale: monthSale,
        net: monthSale - monthPurchase,
      },
      recent_transactions: recentTransactions,
      top_items: topItems,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
