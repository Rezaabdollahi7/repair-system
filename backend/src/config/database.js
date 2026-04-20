const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.join(__dirname, "../repair_system.db");
const UPLOADS_DIR = path.join(__dirname, "../uploads/devices");

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  initSchema();
  saveDb();

  return db;
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      phone TEXT,
      avatar TEXT,
      role_id INTEGER NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      personnel_id INTEGER,
      device_name TEXT NOT NULL,
      brand TEXT,
      model TEXT,
      serial_number TEXT,
      entry_date DATETIME,
      exit_date DATETIME,
      status TEXT DEFAULT 'received',
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (personnel_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS device_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS device_assignments (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id    INTEGER NOT NULL,
      personnel_id INTEGER NOT NULL,
      assigned_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      assigned_by  INTEGER,
      FOREIGN KEY (device_id)    REFERENCES devices(id)   ON DELETE CASCADE,
      FOREIGN KEY (personnel_id) REFERENCES users(id)     ON DELETE CASCADE,
      FOREIGN KEY (assigned_by)  REFERENCES users(id),
      UNIQUE(device_id, personnel_id)
    )
  `);

  db.run(`
    INSERT OR IGNORE INTO roles (name, label) VALUES
      ('super_admin', 'سوپر ادمین'),
      ('admin', 'ادمین'),
      ('technician', 'تکنسین')
  `);

  db.run(`
    INSERT OR IGNORE INTO users (full_name, username, password, role_id)
    SELECT 
      'سوپر ادمین',
      'superadmin',
      '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
      r.id
    FROM roles r WHERE r.name = 'super_admin'
  `);
  //  Inventory Base ─────────────────────────────────
  db.run(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER,
    name TEXT NOT NULL,
    code TEXT UNIQUE,
    unit TEXT NOT NULL DEFAULT 'عدد',
    min_stock INTEGER DEFAULT 0,
    current_stock INTEGER DEFAULT 0,
    avg_purchase_price REAL DEFAULT 0,
    description TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  )
`);

  try {
    db.run(`ALTER TABLE items ADD COLUMN sell_price REAL DEFAULT 0`);
  } catch (e) {}

  db.run(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('purchase', 'sale', 'adjustment')),
      quantity INTEGER NOT NULL,
      unit_price REAL DEFAULT 0,
      reference_id INTEGER,
      reference_type TEXT,
      note TEXT,
      created_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id)
    )
  `);

  db.run(`
  CREATE TABLE IF NOT EXISTS purchase_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    supplier_name TEXT,
    invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',
    note TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

  db.run(`
  CREATE TABLE IF NOT EXISTS purchase_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES purchase_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`);

  db.run(`
  CREATE INDEX IF NOT EXISTS idx_purchase_invoices_date ON purchase_invoices(invoice_date);
  CREATE INDEX IF NOT EXISTS idx_purchase_invoice_items_invoice ON purchase_invoice_items(invoice_id);
`);

  // Sale Invoices
  db.run(`
  CREATE TABLE IF NOT EXISTS sale_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    customer_id INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',
    note TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

  // Sale Invoice Items
  db.run(`
  CREATE TABLE IF NOT EXISTS sale_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    item_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    total_price REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES sale_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`);

  // Indexes
  db.run(`
  CREATE INDEX IF NOT EXISTS idx_sale_invoices_date ON sale_invoices(invoice_date);
  CREATE INDEX IF NOT EXISTS idx_sale_invoice_items_invoice ON sale_invoice_items(invoice_id);
`);

  // Settings table
  db.run(`
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_name TEXT,
    company_address TEXT,
    company_phone TEXT,
    company_email TEXT,
    company_website TEXT,
    company_logo TEXT,
    stamp_image TEXT,
    signature_image TEXT,
    default_tax_rate REAL DEFAULT 0,
    default_warranty_months INTEGER DEFAULT 3,
    invoice_prefix TEXT DEFAULT 'INV-',
    invoice_footer_text TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

  // Insert default settings if not exists
  db.run(`
  INSERT OR IGNORE INTO settings (id, company_name, default_tax_rate, default_warranty_months, invoice_prefix)
  VALUES (1, 'تعمیرگاه', 0, 3, 'INV-')
`);

  // Repair Invoices
  db.run(`
  CREATE TABLE IF NOT EXISTS repair_invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number TEXT NOT NULL UNIQUE,
    device_id INTEGER NOT NULL,
    customer_id INTEGER,
    customer_name TEXT,
    customer_phone TEXT,
    invoice_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    due_date DATETIME,
    status TEXT DEFAULT 'draft',
    subtotal REAL DEFAULT 0,
    discount_type TEXT,
    discount_value REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    tax_rate REAL DEFAULT 0,
    tax_amount REAL DEFAULT 0,
    total_amount REAL DEFAULT 0,
    paid_amount REAL DEFAULT 0,
    payment_status TEXT DEFAULT 'pending',
    warranty_months INTEGER DEFAULT 0,
    warranty_until DATETIME,
    technician_id INTEGER,
    notes TEXT,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id),
    FOREIGN KEY (customer_id) REFERENCES customers(id),
    FOREIGN KEY (technician_id) REFERENCES users(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

  // Repair Invoice Items
  db.run(`
  CREATE TABLE IF NOT EXISTS repair_invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    item_type TEXT NOT NULL,
    item_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    quantity REAL DEFAULT 1,
    unit TEXT,
    unit_price REAL DEFAULT 0,
    discount_type TEXT,
    discount_value REAL DEFAULT 0,
    discount_amount REAL DEFAULT 0,
    total_price REAL DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES repair_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id)
  )
`);

  // Repair Invoice Payments
  db.run(`
  CREATE TABLE IF NOT EXISTS repair_invoice_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    payment_method TEXT DEFAULT 'cash',
    reference_number TEXT,
    note TEXT,
    payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (invoice_id) REFERENCES repair_invoices(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  )
`);

  // Indexes
  db.run(`
  CREATE INDEX IF NOT EXISTS idx_repair_invoices_device ON repair_invoices(device_id);
  CREATE INDEX IF NOT EXISTS idx_repair_invoices_status ON repair_invoices(status);
  CREATE INDEX IF NOT EXISTS idx_repair_invoices_date ON repair_invoices(invoice_date);
  CREATE INDEX IF NOT EXISTS idx_repair_invoice_items_invoice ON repair_invoice_items(invoice_id);
`);
}

function saveDb() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

module.exports = { getDb, saveDb, UPLOADS_DIR };
