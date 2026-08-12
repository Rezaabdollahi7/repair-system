import express from "express";
import * as ctrl from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
} from "../schemas/auth";

const router = express.Router();

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
