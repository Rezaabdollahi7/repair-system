const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deviceController");
const imageRouter = require("./images");
const { authenticate } = require("../middleware/auth");
const { atLeast } = require("../middleware/authorize");

router.use(authenticate);

router.get("/", ctrl.getAll); 
router.get("/:id", ctrl.getOne); 
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", atLeast("admin"), ctrl.remove); // admin+

router.use("/:id/images", imageRouter);

module.exports = router;
