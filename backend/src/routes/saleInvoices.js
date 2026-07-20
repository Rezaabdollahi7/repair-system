const express = require("express");
const router = express.Router();
const saleInvoiceController = require("../controllers/saleInvoiceController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", saleInvoiceController.getAll);
router.get("/:id", saleInvoiceController.getById);
router.post("/", saleInvoiceController.create);
router.put("/:id/payment", saleInvoiceController.updatePayment);
router.delete("/:id", saleInvoiceController.delete);
router.put("/:id", saleInvoiceController.update);

module.exports = router;
