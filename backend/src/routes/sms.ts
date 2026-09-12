import express from "express";
import * as ctrl from "../controllers/smsController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  smsListQuerySchema,
  smsSettingsSchema,
  topupSchema,
  walletVerifySchema,
} from "../schemas/sms";

const router = express.Router();

router.use(authenticate);

// ⚠️ Before the role guard, and the only route here that is.
//
// A technician's device modal needs to know whether the SMS checkbox works,
// and the wallet endpoint below is the wrong way to tell them — it carries a
// balance, which is money, and 12.10 decided a technician does not see the
// figure. This one answers can-I-send as flags and a reason with no amount
// in it at all, so opening it gives nothing away.
router.get("/capability", ctrl.capability);

// Everything past this line is admins and super admins. A technician has no
// business seeing what the shop spends, exactly as with /subscription.
router.use(atLeast("admin"));

router.get("/wallet", ctrl.wallet);
router.post("/wallet/topup", validate({ body: topupSchema }), ctrl.topup);
router.post(
  "/wallet/verify",
  validate({ body: walletVerifySchema }),
  ctrl.verify,
);
router.get(
  "/wallet/transactions",
  validate({ query: smsListQuerySchema }),
  ctrl.transactions,
);
router.get("/topups", validate({ query: smsListQuerySchema }), ctrl.topups);
router.get("/messages", validate({ query: smsListQuerySchema }), ctrl.messages);

router.get("/settings", ctrl.settings);
router.patch(
  "/settings",
  validate({ body: smsSettingsSchema }),
  ctrl.updateSettings,
);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
