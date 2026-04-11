const jwt = require("jsonwebtoken");

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

function authenticate(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: "توکن یافت نشد" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload; // { id, username, role, isActive }
    next();
  } catch (err) {
    return res.status(401).json({ error: "توکن نامعتبر یا منقضی شده" });
  }
}

module.exports = { authenticate, JWT_SECRET };
