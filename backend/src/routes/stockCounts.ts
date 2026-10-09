import express from "express";
import * as ctrl from "../controllers/stockCountController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  stockCountAddLineSchema,
  stockCountApplySchema,
  stockCountCreateSchema,
  stockCountLineParamsSchema,
  stockCountLineUpdateSchema,
  stockCountListQuerySchema,
} from "../schemas/stockCount";

const router = express.Router();

router.use(authenticate);

// Admin and super admin, like every stock document (14 decisions).
router.use(atLeast("admin"));

router.get("/", validate({ query: stockCountListQuerySchema }), ctrl.getAll);
router.post("/", validate({ body: stockCountCreateSchema }), ctrl.create);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.get("/:id/review", validate({ params: idParamSchema }), ctrl.review);
router.post(
  "/:id/lines",
  validate({ params: idParamSchema, body: stockCountAddLineSchema }),
  ctrl.addLine,
);
router.put(
  "/:id/lines/:lineId",
  validate({
    params: stockCountLineParamsSchema,
    body: stockCountLineUpdateSchema,
  }),
  ctrl.updateLine,
);
router.post(
  "/:id/apply",
  validate({ params: idParamSchema, body: stockCountApplySchema }),
  ctrl.apply,
);
router.post("/:id/cancel", validate({ params: idParamSchema }), ctrl.cancel);

// No DELETE: a count that will not be applied is cancelled, and keeps its
// number — the sequence is gap-free.

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
