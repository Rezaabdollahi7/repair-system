import express from "express";
import * as ctrl from "../controllers/authController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { changePasswordSchema, loginSchema } from "../schemas/auth";

const router = express.Router();

router.post("/login", validate({ body: loginSchema }), ctrl.login);
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
