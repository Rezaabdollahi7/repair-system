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
        sale_invoice_paper_size: "A5",
        sale_invoice_show_logo: 1,
        sale_invoice_show_company_info: 1,
        sale_invoice_footer_text: "با تشکر از اعتماد شما",
      });
    }

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
      created_at: row[13],
      updated_at: row[14],
      sale_invoice_paper_size: row[15] || "A5",
      sale_invoice_show_logo: row[16] !== undefined ? row[16] : 1,
      sale_invoice_show_company_info: row[17] !== undefined ? row[17] : 1,
      sale_invoice_show_email: row[18] || 0,
      sale_invoice_show_website: row[19] || 0,
      sale_invoice_show_device_info: row[20] || 0,
      sale_invoice_show_customer_phone: row[21] || 0,
      sale_invoice_show_discount: row[22] || 0,
      sale_invoice_show_tax: row[23] || 0,
      sale_invoice_show_stamp: row[24] || 0,
      sale_invoice_show_signature: row[25] || 0,
      sale_invoice_show_warranty: row[26] || 0,
      sale_invoice_show_technician: row[27] || 0,
      sale_invoice_header_text: row[28] || "",
      sale_invoice_footer_text: row[29] || "با تشکر از اعتماد شما",
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update settings (super_admin only)
exports.updateSettings = async (req, res) => {
  try {
    const db = await getDb();

    const currentResult = db.exec(`SELECT * FROM settings WHERE id = 1`);
    const current = currentResult[0]?.values[0] || [];

    const fields = [];
    const values = [];

    const fieldMap = {
      company_name: 1,
      company_address: 2,
      company_phone: 3,
      company_email: 4,
      company_website: 5,
      default_tax_rate: 9,
      default_warranty_months: 10,
      invoice_prefix: 11,
      invoice_footer_text: 12,
      sale_invoice_paper_size: 15,
      sale_invoice_show_logo: 16,
      sale_invoice_show_company_info: 17,
      sale_invoice_show_email: 18,
      sale_invoice_show_website: 19,
      sale_invoice_show_device_info: 20,
      sale_invoice_show_customer_phone: 21,
      sale_invoice_show_discount: 22,
      sale_invoice_show_tax: 23,
      sale_invoice_show_stamp: 24,
      sale_invoice_show_signature: 25,
      sale_invoice_show_warranty: 26,
      sale_invoice_show_technician: 27,
      sale_invoice_header_text: 28,
      sale_invoice_footer_text: 29,
    };

    Object.keys(fieldMap).forEach((field) => {
      if (req.body[field] !== undefined) {
        fields.push(`${field} = ?`);
        values.push(req.body[field]);
      }
    });

    if (fields.length === 0) {
      return res.status(400).json({ error: "هیچ فیلدی برای آپدیت ارسال نشده" });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(1); // برای WHERE id = ?

    const query = `UPDATE settings SET ${fields.join(", ")} WHERE id = ?`;
    db.run(query, values);

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
      sale_invoice_paper_size: row[15],
      sale_invoice_show_logo: row[16],
      sale_invoice_show_company_info: row[17],
      sale_invoice_show_email: row[18],
      sale_invoice_show_website: row[19],
      sale_invoice_show_device_info: row[20],
      sale_invoice_show_customer_phone: row[21],
      sale_invoice_show_discount: row[22],
      sale_invoice_show_tax: row[23],
      sale_invoice_show_stamp: row[24],
      sale_invoice_show_signature: row[25],
      sale_invoice_show_warranty: row[26],
      sale_invoice_show_technician: row[27],
      sale_invoice_header_text: row[28],
      sale_invoice_footer_text: row[29],
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
