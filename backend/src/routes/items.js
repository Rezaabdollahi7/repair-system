// routes/items.js
const express = require("express");
const router = express.Router();
const itemController = require("../controllers/itemController");
const { authenticate } = require("../middleware/auth");
router.use(authenticate);
router.get("/", itemController.getAll);
router.get("/search", itemController.search);
router.get("/low-stock", itemController.getLowStock);
router.get("/:id", itemController.getById);
router.post("/", itemController.create);
router.put("/:id", itemController.update);
router.delete("/:id", itemController.delete);

// TODO: Replace with proper stock management in Sprint 7
router.put("/:id/stock", itemController.updateStock);
module.exports = router;
