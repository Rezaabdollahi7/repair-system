import express from "express";
import * as ctrl from "../controllers/customerController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  customerBodySchema,
  customerListQuerySchema,
} from "../schemas/customer";

const router = express.Router();

router.use(authenticate);

router.get("/", validate({ query: customerListQuerySchema }), ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getOne);
router.get(
  "/:id/devices",
  validate({ params: idParamSchema }),
  ctrl.getDevices,
);
router.get("/:id/stats", validate({ params: idParamSchema }), ctrl.getStats);
router.post("/", validate({ body: customerBodySchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: customerBodySchema }),
  ctrl.update,
);
router.delete(
  "/:id",
  atLeast("admin"),
  validate({ params: idParamSchema }),
  ctrl.remove,
); // admin+

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would receive { default: router } from a default export.
// This compiles to module.exports = router, keeping runtime behaviour
// identical until the route files are all converted.
export = router;
