import express from "express";
import * as ctrl from "../controllers/purchaseInvoiceController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  purchaseInvoiceCreateSchema,
  purchaseInvoiceListQuerySchema,
  purchaseInvoicePaymentSchema,
} from "../schemas/purchaseInvoice";

const router = express.Router();

router.use(authenticate);

router.get(
  "/",
  validate({ query: purchaseInvoiceListQuerySchema }),
  ctrl.getAll,
);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: purchaseInvoiceCreateSchema }), ctrl.create);
router.put(
  "/:id/payment",
  validate({ params: idParamSchema, body: purchaseInvoicePaymentSchema }),
  ctrl.updatePayment,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
