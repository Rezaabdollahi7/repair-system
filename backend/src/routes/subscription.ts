import express from "express";
import * as ctrl from "../controllers/subscriptionController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { checkoutSchema, verifySchema } from "../schemas/subscription";

const router = express.Router();

router.use(authenticate);
// Admins and super admins. A technician has no business seeing what the shop
// pays, and the guard in 8.3 lets these routes through for a lapsed
// workspace — this is what stops that being a way in for everyone.
router.use(atLeast("admin"));

router.get("/", ctrl.status);
router.get("/payments", ctrl.payments);
router.post("/checkout", validate({ body: checkoutSchema }), ctrl.checkout);
router.post("/verify", validate({ body: verifySchema }), ctrl.verify);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
