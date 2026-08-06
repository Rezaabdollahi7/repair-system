const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/deviceController");
const assignCtrl = require("../controllers/assignmentController");
const imageRouter = require("./images");
const { authenticate } = require("../middleware/auth");
const { atLeast } = require("../middleware/authorize");
const { validate } = require("../middleware/validate");
const { idParamSchema } = require("../schemas/common");
const {
  assignmentParamsSchema,
  setAssignmentsBodySchema,
  addAssignmentBodySchema,
} = require("../schemas/assignment");

router.use(authenticate);

// ─── Device CRUD ──────────────────────────────────────────────
// Still on sql.js; validation lands here when the controller moves to Prisma.
router.get("/", ctrl.getAll);
router.get("/:id", ctrl.getOne);
router.post("/", ctrl.create);
router.put("/:id", ctrl.update);
router.delete("/:id", atLeast("admin"), ctrl.remove);

// ─── Assignments ──────────────────────────────────────────────
router.get(
  "/:id/assignments",
  validate({ params: idParamSchema }),
  assignCtrl.getAssignments,
);
router.put(
  "/:id/assignments",
  validate({ params: idParamSchema, body: setAssignmentsBodySchema }),
  assignCtrl.setAssignments,
);
router.post(
  "/:id/assignments",
  validate({ params: idParamSchema, body: addAssignmentBodySchema }),
  assignCtrl.addAssignment,
);
router.delete(
  "/:id/assignments/:personnelId",
  validate({ params: assignmentParamsSchema }),
  assignCtrl.removeAssignment,
);

// ─── Images ───────────────────────────────────────────────────
router.use("/:id/images", imageRouter);

module.exports = router;
