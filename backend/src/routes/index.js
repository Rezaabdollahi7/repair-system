const express = require("express");
const router = express.Router();

const deviceRoutes = require("./devices");
const customerRoutes = require("./customers");
const authRoutes = require("./auth");
const personnelRoutes = require("./personnel");

router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/customers", customerRoutes);
router.use("/personnel", personnelRoutes);

module.exports = router;
