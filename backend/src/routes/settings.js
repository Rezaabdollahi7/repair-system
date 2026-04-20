const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const settingsController = require("../controllers/settingsController");
const { authenticate } = require("../middleware/auth");

// Multer setup for file uploads
const uploadDir = path.join(__dirname, "../uploads/settings");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.type}-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("فقط فایل‌های تصویری مجاز هستند"), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// Middleware to check if user is super_admin
const requireSuperAdmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "احراز هویت نشده" });
  }
  if (req.user.role !== "super_admin") {
    return res
      .status(403)
      .json({ error: "دسترسی غیرمجاز. فقط سوپر ادمین مجاز است" });
  }
  next();
};

// Public route (no auth required for invoice display)
router.get("/", settingsController.getSettings);

// Protected routes (super_admin only)
router.put(
  "/",
  authenticate,
  requireSuperAdmin,
  settingsController.updateSettings,
);
router.post(
  "/upload/:type",
  authenticate,
  requireSuperAdmin,
  upload.single("image"),
  settingsController.uploadImage,
);

// Serve static files
router.use("/uploads", express.static(uploadDir));

module.exports = router;
