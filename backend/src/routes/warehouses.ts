import express from "express";
import * as ctrl from "../controllers/warehouseController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  warehouseBodySchema,
  warehouseStatusSchema,
} from "../schemas/warehouse";

const router = express.Router();

router.use(authenticate);

// Admin and super admin, like every other stock document (14 decisions). A
// technician sees no stock figures anywhere, and a warehouse list with
// values in it would be one.
router.use(atLeast("admin"));

router.get("/", ctrl.getAll);
router.post("/", validate({ body: warehouseBodySchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: warehouseBodySchema }),
  ctrl.update,
);
router.post(
  "/:id/default",
  validate({ params: idParamSchema }),
  ctrl.setDefault,
);
router.put(
  "/:id/status",
  validate({ params: idParamSchema, body: warehouseStatusSchema }),
  ctrl.setStatus,
);

// No DELETE, deliberately: the ledger and the invoices name their warehouse
// with RESTRICT foreign keys, and a warehouse that is no longer used is
// deactivated. (The application role does hold DELETE on the table — workspace
// deletion, 8.7, needs it — so it is this route list, not a grant, that
// keeps the API from offering it.)

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
