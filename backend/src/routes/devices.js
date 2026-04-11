const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deviceController");
const imageRouter = require("./images");
const { authenticate } = require("../middleware/auth");
const { atLeast } = require("../middleware/authorize");

// همه روت‌ها نیاز به لاگین دارند
router.use(authenticate);

router.get("/", ctrl.getAll); // همه
router.get("/:id", ctrl.getOne); // همه
router.post("/", ctrl.create); // همه
router.put("/:id", ctrl.update); // همه
router.delete("/:id", atLeast("admin"), ctrl.remove); // admin+

router.use("/:id/images", imageRouter);

module.exports = router;
