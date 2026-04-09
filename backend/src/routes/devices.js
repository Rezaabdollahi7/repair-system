const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deviceController");
const imageRouter = require("./images");

router.get("/", ctrl.getAll);
router.get("/:id", ctrl.getOne);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", ctrl.remove);
router.use("/:id/images", imageRouter);
module.exports = router;
