const express = require("express");
const router = express.Router();

const deviceRoutes = require("./devices");
const customerRoutes = require("./customers");
const authRoutes = require("./auth");
router.use("/auth", authRoutes);
router.use("/devices", deviceRoutes);
router.use("/customers", customerRoutes);

module.exports = router;
