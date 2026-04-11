// routes/personnel.js
const express = require("express");
const router = express.Router();
const personnelController = require("../controllers/personnelController");
const { authenticate } = require("../middleware/auth");
const { atLeast, authorize } = require("../middleware/authorize");

// همه روت‌ها نیاز به احراز هویت دارند
router.use(authenticate);

// خواندن - همه نقش‌ها
router.get("/", personnelController.getAll);
router.get("/:id", personnelController.getOne);

// ایجاد و ویرایش - فقط admin و بالاتر
router.post("/", atLeast("admin"), personnelController.create);
router.put("/:id", atLeast("admin"), personnelController.update);
router.put(
  "/:id/toggle-active",
  atLeast("admin"),
  personnelController.toggleActive,
);

// حذف - فقط super_admin
router.delete("/:id", authorize("super_admin"), personnelController.remove);

module.exports = router;
