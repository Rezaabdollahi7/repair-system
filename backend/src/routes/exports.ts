import express from "express";
import * as ctrl from "../controllers/exportController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import { exportCreateSchema } from "../schemas/export";

const router = express.Router();

router.use(authenticate);
// An export is the whole workspace in one file; a technician has no business
// downloading it.
router.use(atLeast("admin"));

router.get("/", ctrl.list);
router.post("/", validate({ body: exportCreateSchema }), ctrl.create);
router.get(
  "/:id/download",
  validate({ params: idParamSchema }),
  ctrl.download,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
