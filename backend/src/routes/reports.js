const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/stock", reportController.getStockReport);
router.get("/purchases", reportController.getPurchaseReport);
router.get("/sales", reportController.getSaleReport);
router.get("/profit", reportController.getProfitReport);
router.get("/dashboard", reportController.getDashboardStats);

module.exports = router;
