import express from "express";
import * as ctrl from "../controllers/repairInvoiceController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  repairInvoiceCreateSchema,
  repairInvoiceListQuerySchema,
  repairInvoicePaymentSchema,
  repairInvoiceStatusSchema,
  repairInvoiceUpdateSchema,
} from "../schemas/repairInvoice";

const router = express.Router();

router.use(authenticate);

router.get("/", validate({ query: repairInvoiceListQuerySchema }), ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: repairInvoiceCreateSchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: repairInvoiceUpdateSchema }),
  ctrl.update,
);
router.put(
  "/:id/status",
  validate({ params: idParamSchema, body: repairInvoiceStatusSchema }),
  ctrl.changeStatus,
);
router.post(
  "/:id/payments",
  validate({ params: idParamSchema, body: repairInvoicePaymentSchema }),
  ctrl.addPayment,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
