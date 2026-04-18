const express = require("express");
const router = express.Router();
const purchaseInvoiceController = require("../controllers/purchaseInvoiceController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", purchaseInvoiceController.getAll);
router.get("/:id", purchaseInvoiceController.getById);
router.post("/", purchaseInvoiceController.create);
router.put("/:id/payment", purchaseInvoiceController.updatePayment);
router.delete("/:id", purchaseInvoiceController.delete);

module.exports = router;
