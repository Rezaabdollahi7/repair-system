import express from "express";
import * as ctrl from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  sendOtpSchema,
} from "../schemas/auth";

const router = express.Router();

// No authenticate: the caller has no account yet, or cannot get into the one
// they have. Its own rate limiter is mounted in app.ts — a separate bucket
// from login, because this one guards a bank balance rather than a password.
router.post("/send-otp", validate({ body: sendOtpSchema }), ctrl.sendOtp);
router.post(
  "/reset-password",
  validate({ body: resetPasswordSchema }),
  ctrl.resetPassword,
);
router.post("/register", validate({ body: registerSchema }), ctrl.register);
router.post("/login", validate({ body: loginSchema }), ctrl.login);
// No authenticate on either: both are reached with an expired access token,
// or none at all. The cookie is the credential.
router.post("/refresh", ctrl.refresh);
router.post("/logout", ctrl.logout);
router.get("/me", authenticate, ctrl.me);
router.put(
  "/change-password",
  authenticate,
  validate({ body: changePasswordSchema }),
  ctrl.changePassword,
);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
