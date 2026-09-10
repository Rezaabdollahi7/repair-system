import express from "express";
import * as ctrl from "../controllers/customerController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  customerBodySchema,
  customerListQuerySchema,
  customerNotesSchema,
} from "../schemas/customer";

const router = express.Router();

router.use(authenticate);

router.get("/", validate({ query: customerListQuerySchema }), ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getOne);
// Everything the customer page shows, in one request: the page is one
// screen, and four round trips to fill it would each pay the RLS
// transaction's two hops.
router.get(
  "/:id/overview",
  validate({ params: idParamSchema }),
  ctrl.getOverview,
);
router.post("/", validate({ body: customerBodySchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: customerBodySchema }),
  ctrl.update,
);
router.put(
  "/:id/notes",
  validate({ params: idParamSchema, body: customerNotesSchema }),
  ctrl.updateNotes,
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
