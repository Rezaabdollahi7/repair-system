const express = require("express");
const router = express.Router();
const repairInvoiceController = require("../controllers/repairInvoiceController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", repairInvoiceController.getAll);
router.get("/:id", repairInvoiceController.getById);
router.post("/", repairInvoiceController.create);
router.put("/:id", repairInvoiceController.update);
router.delete("/:id", repairInvoiceController.delete);
router.put("/:id/status", repairInvoiceController.changeStatus);
router.post("/:id/payments", repairInvoiceController.addPayment);

module.exports = router;
