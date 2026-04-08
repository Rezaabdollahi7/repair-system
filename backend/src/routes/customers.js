const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/customerController");

router.get("/", ctrl.getAll);
router.get("/:id", ctrl.getOne);
router.get("/:id/devices", ctrl.getDevices);
router.get("/:id/stats", ctrl.getStats);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);

module.exports = router;
