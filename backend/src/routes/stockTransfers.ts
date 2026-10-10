import express from "express";
import * as ctrl from "../controllers/stockTransferController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  stockTransferCreateSchema,
  stockTransferListQuerySchema,
} from "../schemas/stockTransfer";

const router = express.Router();

router.use(authenticate);

// Admin and super admin: stock documents are theirs (14 decisions), and a
// technician sees no stock figures anywhere.
router.use(atLeast("admin"));

router.get(
  "/",
  validate({ query: stockTransferListQuerySchema }),
  ctrl.getAll,
);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: stockTransferCreateSchema }), ctrl.create);

// No PUT and no DELETE, as on an adjustment: a transfer is applied when it
// is saved and its ledger rows are append-only. One made by mistake is
// undone by another in the opposite direction.

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
