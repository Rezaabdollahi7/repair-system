import express from "express";
import * as ctrl from "../controllers/reportController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  dateRangeQuerySchema,
  stockReportQuerySchema,
} from "../schemas/report";

const router = express.Router();

router.use(authenticate);

// Includes /dashboard, which aggregates revenue and margin. AUTH.3 makes the
// dashboard page admin-only to match — the two have to ship together or a
// technician lands on an error page instead of a redirect.
router.use(atLeast("admin"));

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
