import express from "express";
import * as ctrl from "../controllers/settingsController";
import { authenticate } from "../middleware/auth";
import { authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import {
  settingsUpdateSchema,
  uploadTypeParamSchema,
} from "../schemas/settings";

const router = express.Router();

// Unauthenticated, so an invoice can render the shop's header. Worth
// revisiting in phase 2, when settings become per-workspace.
router.get("/", ctrl.getSettings);

router.put(
  "/",
  authenticate,
  // Replaces a locally defined requireSuperAdmin that duplicated this, minus
  // its isActive check.
  authorize("super_admin"),
  validate({ body: settingsUpdateSchema }),
  ctrl.updateSettings,
);

router.post(
  "/upload/:type",
  authenticate,
  authorize("super_admin"),
  validate({ params: uploadTypeParamSchema }),
  ctrl.upload.single("image"),
  ctrl.uploadImage,
);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
