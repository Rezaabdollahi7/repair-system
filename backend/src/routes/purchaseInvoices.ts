import express from "express";
import * as ctrl from "../controllers/purchaseInvoiceController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  purchaseInvoiceCreateSchema,
  purchaseInvoiceListQuerySchema,
  purchaseInvoicePaymentSchema,
  purchaseInvoiceUpdateSchema,
} from "../schemas/purchaseInvoice";

const router = express.Router();

router.use(authenticate);

// A purchase invoice is what the shop paid its suppliers. Guarded on the
// router so a path added later inherits it.
router.use(atLeast("admin"));

router.get(
  "/",
  validate({ query: purchaseInvoiceListQuerySchema }),
  ctrl.getAll,
);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: purchaseInvoiceCreateSchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: purchaseInvoiceUpdateSchema }),
  ctrl.update,
);
router.put(
  "/:id/payment",
  validate({ params: idParamSchema, body: purchaseInvoicePaymentSchema }),
  ctrl.updatePayment,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
