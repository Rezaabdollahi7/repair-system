// routes/index.js
const express = require("express");
const router = express.Router();

const deviceRoutes = require("./devices");
const customerRoutes = require("./customers");
const authRoutes = require("./auth");
const personnelRoutes = require("./personnel");
const categoryRoutes = require("./categories");
const itemRoutes = require("./items");

router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/customers", customerRoutes);
router.use("/personnel", personnelRoutes);
router.use("/categories", categoryRoutes);
router.use("/items", itemRoutes);

module.exports = router;
