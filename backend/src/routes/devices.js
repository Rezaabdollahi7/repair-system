const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deviceController");
const assignCtrl = require("../controllers/assignmentController");
const imageRouter = require("./images");
const { authenticate } = require("../middleware/auth");
const { atLeast } = require("../middleware/authorize");

router.use(authenticate);

// ─── Device CRUD ──────────────────────────────────────────────
router.get("/", ctrl.getAll);
router.get("/:id", ctrl.getOne);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", atLeast("admin"), ctrl.remove);

// ─── Assignment Routes (جدید) ──────────────────────────────────
router.get("/:id/assignments", assignCtrl.getAssignments);
router.put("/:id/assignments", assignCtrl.setAssignments);
router.post("/:id/assignments", assignCtrl.addAssignment);
router.delete("/:id/assignments/:personnelId", assignCtrl.removeAssignment);

// ─── Images ───────────────────────────────────────────────────
router.use("/:id/images", imageRouter);

module.exports = router;
