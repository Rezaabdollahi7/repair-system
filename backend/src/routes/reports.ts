import express from "express";
import * as ctrl from "../controllers/reportController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  dateRangeQuerySchema,
  stockReportQuerySchema,
} from "../schemas/report";

const router = express.Router();

router.use(authenticate);

router.get(
  "/stock",
  validate({ query: stockReportQuerySchema }),
  ctrl.getStockReport,
);
router.get(
  "/purchases",
  validate({ query: dateRangeQuerySchema }),
  ctrl.getPurchaseReport,
);
router.get(
  "/sales",
  validate({ query: dateRangeQuerySchema }),
  ctrl.getSaleReport,
);
router.get(
  "/profit",
  validate({ query: dateRangeQuerySchema }),
  ctrl.getProfitReport,
);
router.get("/dashboard", ctrl.getDashboardStats);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
