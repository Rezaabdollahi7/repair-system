const express = require("express");
const router = express.Router();

const deviceRoutes = require("./devices");
const customerRoutes = require("./customers");

router.use("/devices", deviceRoutes);
router.use("/customers", customerRoutes);

module.exports = router;
