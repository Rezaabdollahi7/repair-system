const express = require("express");
const router = express.Router();
const serviceController = require("../controllers/serviceController");
const { authenticate } = require("../middleware/auth");

router.use(authenticate);

router.get("/", serviceController.getAll);
router.post("/", serviceController.create);
router.put("/:id", serviceController.update);
router.delete("/:id", serviceController.delete);

module.exports = router;
