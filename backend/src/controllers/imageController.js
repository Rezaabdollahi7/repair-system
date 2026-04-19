const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { getDb, saveDb, UPLOADS_DIR } = require("../config/database");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// ─── Multer Config ────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const deviceId = req.params.id;
    const ext = path.extname(file.originalname).toLowerCase();
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    cb(null, `${deviceId}-temp-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

function queryOne(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    const result = stmt.getAsObject(params);
    if (Object.keys(result).length === 0) return null;
    return result;
  } catch {
    return null;
  }
}

function queryAll(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  } catch {
    return [];
  }
}

// ─── Upload Images ────────────────────────────────────────────────────────────

async function uploadImages(req, res) {
  try {
    const deviceId = parseInt(req.params.id);
    const db = await getDb();

    if (!fs.existsSync(UPLOADS_DIR)) {
      console.log("⚠️ Dir missing! Creating...");
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }

    const device = queryOne(db, "SELECT id FROM devices WHERE id = ?", [
      deviceId,
    ]);

    if (!device) {
      if (req.files) {
        req.files.forEach((f) => {
          if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
        });
      }
      return res.status(404).json({ error: "دستگاه یافت نشد" });
    }

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: "فایلی آپلود نشده" });
    }

    const lastImage = queryOne(
      db,
      "SELECT filename FROM device_images WHERE device_id = ? ORDER BY sort_order DESC LIMIT 1",
      [deviceId],
    );

    let nextNumber = 1;
    if (lastImage && lastImage.filename) {
      const match = lastImage.filename.match(/-(\d+)\.[^.]+$/);
      if (match) nextNumber = parseInt(match[1]) + 1;
    }

    const inserted = [];

    for (let idx = 0; idx < req.files.length; idx++) {
      const file = req.files[idx];
      const ext = path.extname(file.originalname).toLowerCase();
      const sortOrder = nextNumber + idx;
      const newFilename = `${deviceId}-${sortOrder}${ext}`;
      const newPath = path.join(UPLOADS_DIR, newFilename);

      if (!fs.existsSync(file.path)) {
        console.error("❌ Source file not found:", file.path);
        continue;
      }

      fs.mkdirSync(path.dirname(newPath), { recursive: true });

      fs.renameSync(file.path, newPath);

      db.run(
        `INSERT INTO device_images (device_id, filename, filepath, sort_order)
         VALUES (?, ?, ?, ?)`,
        [deviceId, newFilename, newPath, sortOrder],
      );

      const lastId = queryOne(db, "SELECT last_insert_rowid() as id", []);

      inserted.push({
        id: lastId ? lastId.id : null,
        device_id: deviceId,
        filename: newFilename,
        sort_order: sortOrder,
      });
    }

    saveDb();

    res.status(201).json({
      message: `${inserted.length} عکس آپلود شد`,
      images: inserted,
    });
  } catch (error) {
    console.error("Upload error:", error);

    if (req.files) {
      req.files.forEach((f) => {
        if (fs.existsSync(f.path)) fs.unlinkSync(f.path);
      });
    }
    res.status(500).json({ error: "خطا در آپلود عکس" });
  }
}

// ─── Get Images ───────────────────────────────────────────────────────────────

async function getImages(req, res) {
  try {
    const deviceId = parseInt(req.params.id);
    const db = await getDb();

    const images = queryAll(
      db,
      `SELECT id, filename, sort_order, created_at 
       FROM device_images 
       WHERE device_id = ? 
       ORDER BY sort_order ASC`,
      [deviceId],
    );

    res.json(images);
  } catch (error) {
    console.error("Get images error:", error);
    res.status(500).json({ error: "خطا در دریافت عکس‌ها" });
  }
}

// ─── Delete Image ─────────────────────────────────────────────────────────────

async function deleteImage(req, res) {
  try {
    const imageId = parseInt(req.params.imageId);
    const db = await getDb();

    const image = queryOne(db, "SELECT * FROM device_images WHERE id = ?", [
      imageId,
    ]);

    if (!image) {
      return res.status(404).json({ error: "عکس یافت نشد" });
    }

    if (image.filepath && fs.existsSync(image.filepath)) {
      fs.unlinkSync(image.filepath);
    }

    db.run("DELETE FROM device_images WHERE id = ?", [imageId]);
    saveDb();

    res.json({ message: "عکس حذف شد" });
  } catch (error) {
    console.error("Delete image error:", error);
    res.status(500).json({ error: "خطا در حذف عکس" });
  }
}

// ─── Delete All Images of a Device (internal use) ────────────────────────────

async function deleteDeviceImages(deviceId) {
  try {
    const db = await getDb();

    const images = queryAll(
      db,
      "SELECT filepath FROM device_images WHERE device_id = ?",
      [deviceId],
    );

    images.forEach((img) => {
      if (img.filepath && fs.existsSync(img.filepath)) {
        fs.unlinkSync(img.filepath);
      }
    });

    db.run("DELETE FROM device_images WHERE device_id = ?", [deviceId]);
    saveDb();
  } catch (error) {
    console.error("Delete device images error:", error);
  }
}


exports.quickSale = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { quantity, unit_price, customer_name } = req.body;

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

    const totalAmount = quantity * (unit_price || 0);

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
      [invoiceId, id, quantity, unit_price || 0, totalAmount],
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
      [id, -quantity, unit_price || 0, invoiceId, "فروش سریع"],
    );

    saveDb();

    res.json({
      message: "فروش سریع با موفقیت ثبت شد",
      invoice_number: invoiceNumber,
      new_stock: newStock,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  upload,
  uploadImages,
  getImages,
  deleteImage,
  deleteDeviceImages,
};
