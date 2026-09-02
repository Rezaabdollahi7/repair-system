import express from "express";
import * as ctrl from "../controllers/saleInvoiceController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  saleInvoiceCreateSchema,
  saleInvoiceListQuerySchema,
  saleInvoicePaymentSchema,
  saleInvoiceUpdateSchema,
} from "../schemas/saleInvoice";

const router = express.Router();

router.use(authenticate);

router.get("/", validate({ query: saleInvoiceListQuerySchema }), ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: saleInvoiceCreateSchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: saleInvoiceUpdateSchema }),
  ctrl.update,
);
router.put(
  "/:id/payment",
  validate({ params: idParamSchema, body: saleInvoicePaymentSchema }),
  ctrl.updatePayment,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
