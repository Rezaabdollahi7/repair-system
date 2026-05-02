// backend/src/routes/backups.js
const express = require("express");
const router = express.Router();
const backupController = require("../controllers/backupController");
const { authenticate } = require("../middleware/auth");

// Admin and super_admin only
const requireAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ error: "احراز هویت نشده" });
  if (req.user.role !== "super_admin" && req.user.role !== "admin") {
    return res.status(403).json({ error: "دسترسی غیرمجاز" });
  }
  next();
};

router.use(authenticate);
router.use(requireAdmin);

router.get("/", backupController.list);
router.post("/", backupController.create);
router.get("/:id/download", backupController.download);
router.post("/:id/restore", backupController.restore);
router.delete("/:id", backupController.remove);

module.exports = router;
