import express from "express";
import * as ctrl from "../controllers/stockAdjustmentController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  stockAdjustmentCreateSchema,
  stockAdjustmentListQuerySchema,
} from "../schemas/stockAdjustment";

const router = express.Router();

router.use(authenticate);

// Admin and super admin: stock documents are theirs (14 decisions), and a
// technician sees no stock figures anywhere.
router.use(atLeast("admin"));

router.get(
  "/",
  validate({ query: stockAdjustmentListQuerySchema }),
  ctrl.getAll,
);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: stockAdjustmentCreateSchema }), ctrl.create);

// No PUT and no DELETE, deliberately: an adjustment is applied when it is
// saved and the ledger rows it wrote are append-only. A mistake is corrected
// by a second adjustment, and both stay on the record.

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
