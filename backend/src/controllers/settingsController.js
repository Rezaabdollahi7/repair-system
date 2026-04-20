const { getDb, saveDb } = require("../config/database");
const fs = require("fs");
const path = require("path");

const UPLOADS_DIR = path.join(__dirname, "../uploads/settings");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Get settings (public - no auth required for invoice display)
exports.getSettings = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(`SELECT * FROM settings WHERE id = 1`);

    if (!result[0] || result[0].values.length === 0) {
      return res.json({
        company_name: "تعمیرگاه",
        default_tax_rate: 0,
        default_warranty_months: 3,
        invoice_prefix: "INV-",
      });
    }

    const row = result[0].values[0];
    const settings = {
      id: row[0],
      company_name: row[1],
      company_address: row[2],
      company_phone: row[3],
      company_email: row[4],
      company_website: row[5],
      company_logo: row[6],
      stamp_image: row[7],
      signature_image: row[8],
      default_tax_rate: row[9],
      default_warranty_months: row[10],
      invoice_prefix: row[11],
      invoice_footer_text: row[12],
      created_at: row[13],
      updated_at: row[14],
    };

    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update settings (super_admin only)
exports.updateSettings = async (req, res) => {
  try {
    const db = await getDb();
    const {
      company_name,
      company_address,
      company_phone,
      company_email,
      company_website,
      default_tax_rate,
      default_warranty_months,
      invoice_prefix,
      invoice_footer_text,
    } = req.body;

    db.run(
      `UPDATE settings SET 
        company_name = ?,
        company_address = ?,
        company_phone = ?,
        company_email = ?,
        company_website = ?,
        default_tax_rate = ?,
        default_warranty_months = ?,
        invoice_prefix = ?,
        invoice_footer_text = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [
        company_name || null,
        company_address || null,
        company_phone || null,
        company_email || null,
        company_website || null,
        default_tax_rate || 0,
        default_warranty_months || 3,
        invoice_prefix || "INV-",
        invoice_footer_text || null,
      ],
    );

    saveDb();

    const result = db.exec(`SELECT * FROM settings WHERE id = 1`);
    const row = result[0].values[0];

    res.json({
      id: row[0],
      company_name: row[1],
      company_address: row[2],
      company_phone: row[3],
      company_email: row[4],
      company_website: row[5],
      company_logo: row[6],
      stamp_image: row[7],
      signature_image: row[8],
      default_tax_rate: row[9],
      default_warranty_months: row[10],
      invoice_prefix: row[11],
      invoice_footer_text: row[12],
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Upload image (logo, stamp, signature)
exports.uploadImage = async (req, res) => {
  try {
    const db = await getDb();
    const { type } = req.params; // 'logo', 'stamp', 'signature'
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "فایلی آپلود نشده است" });
    }

    if (!["logo", "stamp", "signature"].includes(type)) {
      return res.status(400).json({ error: "نوع تصویر نامعتبر است" });
    }

    const column =
      type === "logo"
        ? "company_logo"
        : type === "stamp"
          ? "stamp_image"
          : "signature_image";
    const filePath = `/uploads/settings/${file.filename}`;

    db.run(
      `UPDATE settings SET ${column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
      [filePath],
    );

    saveDb();

    res.json({ message: "تصویر با موفقیت آپلود شد", path: filePath });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
