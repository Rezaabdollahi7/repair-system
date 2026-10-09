import express from "express";
import * as ctrl from "../controllers/itemController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  invoiceSearchQuerySchema,
  itemCreateSchema,
  itemListQuerySchema,
  itemSearchQuerySchema,
  itemTransactionsQuerySchema,
  itemUpdateSchema,
  quickPurchaseSchema,
  quickSaleSchema,
} from "../schemas/item";

const router = express.Router();

router.use(authenticate);

// Purchase prices and stock levels are the owner's commercial data, not a
// technician's working data — so reads are guarded too, not just writes.
// On the router rather than per-route: five unguarded paths here is what the
// per-route style produced in the first place.
router.use(atLeast("admin"));

// Literal paths are declared before /:id so they aren't captured by it.
router.get("/", validate({ query: itemListQuerySchema }), ctrl.getAll);
router.get("/search", validate({ query: itemSearchQuerySchema }), ctrl.search);
router.get(
  "/search/for-invoice",
  validate({ query: invoiceSearchQuerySchema }),
  ctrl.searchForInvoice,
);
router.get("/low-stock", ctrl.getLowStock);

router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.get(
  "/:id/transactions",
  validate({ params: idParamSchema, query: itemTransactionsQuerySchema }),
  ctrl.getTransactions,
);

router.post("/", validate({ body: itemCreateSchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: itemUpdateSchema }),
  ctrl.update,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

router.post(
  "/:id/quick-purchase",
  validate({ params: idParamSchema, body: quickPurchaseSchema }),
  ctrl.quickPurchase,
);
router.post(
  "/:id/quick-sale",
  validate({ params: idParamSchema, body: quickSaleSchema }),
  ctrl.quickSale,
);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
