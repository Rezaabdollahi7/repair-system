const bcrypt = require("bcryptjs");
const { getDb, saveDb } = require("../config/database");

function rowToObj(columns, values) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj;
}

// ── GET /api/personnel ────────────────────────────────────
exports.getAll = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT u.id, u.full_name, u.username, u.phone, u.avatar,
              u.role_id, u.is_active, u.created_at, u.updated_at,
              r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at DESC`,
    );
    if (!result[0]) return res.json([]);
    res.json(result[0].values.map((row) => rowToObj(result[0].columns, row)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── GET /api/personnel/:id ────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const db = await getDb();
    const result = db.exec(
      `SELECT u.id, u.full_name, u.username, u.phone, u.avatar,
              u.role_id, u.is_active, u.created_at, u.updated_at,
              r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [req.params.id],
    );
    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }
    res.json(rowToObj(result[0].columns, result[0].values[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── helper: get role name by id ───────────────────────────
function getRoleName(db, role_id) {
  const result = db.exec(`SELECT name FROM roles WHERE id = ?`, [role_id]);
  if (!result[0] || result[0].values.length === 0) return null;
  return result[0].values[0][0];
}

// ── POST /api/personnel ───────────────────────────────────
exports.create = async (req, res) => {
  try {
    const db = await getDb();
    const { full_name, username, password, phone, role_id } = req.body;

    if (!full_name || !username || !password || !role_id) {
      return res
        .status(400)
        .json({ error: "نام، نام کاربری، رمز و نقش الزامی است" });
    }
    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" });
    }

    // چک نقش هدف
    const targetRoleName = getRoleName(db, role_id);
    if (!targetRoleName) {
      return res.status(400).json({ error: "نقش انتخاب‌شده معتبر نیست" });
    }
    if (req.user.role === "admin" && targetRoleName !== "technician") {
      return res
        .status(403)
        .json({ error: "ادمین فقط می‌تواند تکنسین ایجاد کند" });
    }

    // بررسی تکراری نبودن username
    const existing = db.exec(`SELECT id FROM users WHERE username = ?`, [
      username,
    ]);
    if (existing[0] && existing[0].values.length > 0) {
      return res
        .status(409)
        .json({ error: "این نام کاربری قبلاً ثبت شده است" });
    }

    const hash = await bcrypt.hash(password, 10);
    db.run(
      `INSERT INTO users (full_name, username, password, phone, role_id, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [full_name, username, hash, phone || null, role_id],
    );
    saveDb();

    const newUser = db.exec(
      `SELECT u.id, u.full_name, u.username, u.phone, u.avatar,
              u.role_id, u.is_active, u.created_at, u.updated_at,
              r.name AS role_name, r.label AS role_label
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.username = ?`,
      [username],
    );
    res.status(201).json(rowToObj(newUser[0].columns, newUser[0].values[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── PUT /api/personnel/:id ────────────────────────────────
exports.update = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;
    const { full_name, username, phone, role_id, password } = req.body;

    // بررسی وجود کاربر
    const existing = db.exec(`SELECT id FROM users WHERE id = ?`, [id]);
    if (!existing[0] || existing[0].values.length === 0) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    // بررسی تکراری نبودن username
    if (username) {
      const dupCheck = db.exec(
        `SELECT id FROM users WHERE username = ? AND id != ?`,
        [username, id],
      );
      if (dupCheck[0] && dupCheck[0].values.length > 0) {
        return res
          .status(409)
          .json({ error: "این نام کاربری قبلاً ثبت شده است" });
      }
    }

    // چک نقش هدف در صورت تغییر
    if (role_id) {
      const targetRoleName = getRoleName(db, role_id);
      if (!targetRoleName) {
        return res.status(400).json({ error: "نقش انتخاب‌شده معتبر نیست" });
      }
      if (req.user.role === "admin" && targetRoleName !== "technician") {
        return res
          .status(403)
          .json({ error: "ادمین فقط می‌تواند نقش تکنسین را تخصیص دهد" });
      }
    }

    // ساخت query پویا
    const fields = [];
    const values = [];

    if (full_name) {
      fields.push("full_name = ?");
      values.push(full_name);
    }
    if (username) {
      fields.push("username = ?");
      values.push(username);
    }
    if (phone !== undefined) {
      fields.push("phone = ?");
      values.push(phone || null);
    }
    if (role_id) {
      fields.push("role_id = ?");
      values.push(role_id);
    }

    if (password) {
      if (password.length < 6) {
        return res
          .status(400)
          .json({ error: "رمز عبور باید حداقل ۶ کاراکتر باشد" });
      }
      const hash = await bcrypt.hash(password, 10);
      fields.push("password = ?");
      values.push(hash);
    }

    if (fields.length === 0) {
      return res
        .status(400)
        .json({ error: "هیچ فیلدی برای ویرایش ارسال نشده" });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(id);

    db.run(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, values);
    saveDb();

    const updated = db.exec(
      `SELECT u.id, u.full_name, u.username, u.phone, u.avatar,
              u.role_id, u.is_active, u.created_at, u.updated_at,
              r.name AS role_name, r.label AS role_label
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [id],
    );
    res.json(rowToObj(updated[0].columns, updated[0].values[0]));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── PUT /api/personnel/:id/toggle-active ──────────────────
exports.toggleActive = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    // جلوگیری از غیرفعال کردن خود
    if (parseInt(id) === req.user.id) {
      return res
        .status(400)
        .json({ error: "نمی‌توانید حساب خود را غیرفعال کنید" });
    }

    // بررسی وجود کاربر و نقش او
    const targetResult = db.exec(
      `SELECT u.id, u.is_active, r.name AS role_name
       FROM users u JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [id],
    );
    if (!targetResult[0] || targetResult[0].values.length === 0) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    const target = rowToObj(targetResult[0].columns, targetResult[0].values[0]);

    // ادمین نمی‌تواند super_admin را غیرفعال کند
    if (req.user.role === "admin" && target.role_name === "super_admin") {
      return res
        .status(403)
        .json({ error: "ادمین نمی‌تواند سوپر ادمین را غیرفعال کند" });
    }

    const newStatus = target.is_active === 1 ? 0 : 1;
    db.run(
      `UPDATE users SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newStatus, id],
    );
    saveDb();

    res.json({
      message: newStatus === 1 ? "حساب فعال شد" : "حساب غیرفعال شد",
      is_active: newStatus,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── DELETE /api/personnel/:id ─────────────────────────────
exports.remove = async (req, res) => {
  try {
    const db = await getDb();
    const { id } = req.params;

    if (parseInt(id) === req.user.id) {
      return res.status(400).json({ error: "نمی‌توانید حساب خود را حذف کنید" });
    }

    const existing = db.exec(`SELECT id FROM users WHERE id = ?`, [id]);
    if (!existing[0] || existing[0].values.length === 0) {
      return res.status(404).json({ error: "پرسنل یافت نشد" });
    }

    db.run(`DELETE FROM users WHERE id = ?`, [id]);
    saveDb();

    res.json({ message: "پرسنل با موفقیت حذف شد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
