import express from "express";
import * as ctrl from "../controllers/deviceController";
import * as assignCtrl from "../controllers/assignmentController";
import imageRouter from "./images";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  addAssignmentBodySchema,
  assignmentParamsSchema,
  setAssignmentsBodySchema,
} from "../schemas/assignment";
import {
  deviceCreateSchema,
  deviceListQuerySchema,
  deviceUpdateSchema,
} from "../schemas/device";

const router = express.Router();

router.use(authenticate);

// ─── Device CRUD ──────────────────────────────────────────────
router.get("/", validate({ query: deviceListQuerySchema }), ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getOne);
router.post("/", validate({ body: deviceCreateSchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: deviceUpdateSchema }),
  ctrl.update,
);
router.delete(
  "/:id",
  atLeast("admin"),
  validate({ params: idParamSchema }),
  ctrl.remove,
);

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

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
