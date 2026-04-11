const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/customerController");
const { authenticate } = require("../middleware/auth");
const { atLeast } = require("../middleware/authorize");

router.use(authenticate);

router.get("/", ctrl.getAll); // همه
router.get("/:id", ctrl.getOne); // همه
router.get("/:id/devices", ctrl.getDevices); // همه
router.get("/:id/stats", ctrl.getStats); // همه
router.post("/", ctrl.create); // همه
router.put("/:id", ctrl.update); // همه
router.delete("/:id", atLeast("admin"), ctrl.remove); // admin+

module.exports = router;
