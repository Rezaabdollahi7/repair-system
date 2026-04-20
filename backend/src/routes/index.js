// routes/index.js
const express = require("express");
const router = express.Router();

const deviceRoutes = require("./devices");
const customerRoutes = require("./customers");
const authRoutes = require("./auth");
const personnelRoutes = require("./personnel");
const categoryRoutes = require("./categories");
const itemRoutes = require("./items");
const purchaseInvoiceRoutes = require("./purchaseInvoices");
const saleInvoiceRoutes = require("./saleInvoices");
const reportRoutes = require("./reports");
const settingsRoutes = require("./settings");
const repairInvoiceRoutes = require("./repairInvoices");
const serviceRoutes = require("./services");

router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/customers", customerRoutes);
router.use("/personnel", personnelRoutes);
router.use("/categories", categoryRoutes);
router.use("/items", itemRoutes);
router.use("/purchase-invoices", purchaseInvoiceRoutes);
router.use("/sale-invoices", saleInvoiceRoutes);
router.use("/reports", reportRoutes);
router.use("/settings", settingsRoutes);
router.use("/repair-invoices", repairInvoiceRoutes);
router.use("/services", serviceRoutes);

module.exports = router;
