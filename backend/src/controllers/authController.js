const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { getDb, saveDb } = require("../config/database");
const { JWT_SECRET } = require("../middleware/auth");

// ── helpers ──────────────────────────────────────────────
function rowToUser(columns, values) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = values[i];
  });
  return obj;
}

function safeUser(user) {
  const { password, ...rest } = user;
  return rest;
}

// ── POST /api/auth/login ──────────────────────────────────
exports.login = async (req, res) => {
  try {
    const db = await getDb();
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "نام کاربری و رمز عبور الزامی است" });
    }

    const result = db.exec(
      `SELECT 
        u.id, u.full_name, u.username, u.password, u.phone, u.avatar,
        u.role_id, u.is_active, u.created_at, u.updated_at,
        r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = ?`,
      [username],
    );

    if (!result[0] || result[0].values.length === 0) {
      return res
        .status(401)
        .json({ error: "نام کاربری یا رمز عبور اشتباه است" });
    }

    const user = rowToUser(result[0].columns, result[0].values[0]);
    console.log("🔍 user from DB:", {
      ...user,
      password: user.password?.slice(0, 20) + "...",
    });

    const isMatch = await bcrypt.compare(password, user.password);
    console.log("🔍 password match:", isMatch);

    if (!isMatch) {
      return res
        .status(401)
        .json({ error: "نام کاربری یا رمز عبور اشتباه است" });
    }

    if (!user.is_active) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role_name,
        isActive: user.is_active === 1,
      },
      JWT_SECRET,
      { expiresIn: "72h" },
    );

    res.json({ token, user: safeUser(user) });
  } catch (error) {
    console.error("❌ login error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ── GET /api/auth/me ──────────────────────────────────────
exports.me = async (req, res) => {
  try {
    const db = await getDb();

    const result = db.exec(
      `SELECT 
        u.id, u.full_name, u.username, u.password, u.phone, u.avatar,
        u.role_id, u.is_active, u.created_at, u.updated_at,
        r.name AS role_name, r.label AS role_label
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = ?`,
      [req.user.id],
    );

    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "کاربر یافت نشد" });
    }

    const user = rowToUser(result[0].columns, result[0].values[0]);

    if (!user.is_active) {
      return res.status(403).json({ error: "حساب کاربری غیرفعال است" });
    }

    res.json(safeUser(user));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ── PUT /api/auth/change-password ─────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const db = await getDb();
    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: "رمز فعلی و جدید الزامی است" });
    }

    if (new_password.length < 6) {
      return res
        .status(400)
        .json({ error: "رمز جدید باید حداقل ۶ کاراکتر باشد" });
    }

    const result = db.exec(`SELECT password FROM users WHERE id = ?`, [
      req.user.id,
    ]);

    if (!result[0] || result[0].values.length === 0) {
      return res.status(404).json({ error: "کاربر یافت نشد" });
    }

    const currentHash = result[0].values[0][0];
    const isMatch = await bcrypt.compare(current_password, currentHash);

    if (!isMatch) {
      return res.status(401).json({ error: "رمز فعلی اشتباه است" });
    }

    const newHash = await bcrypt.hash(new_password, 10);

    db.run(
      `UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [newHash, req.user.id],
    );
    saveDb();

    res.json({ message: "رمز عبور با موفقیت تغییر کرد" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
