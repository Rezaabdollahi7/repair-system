import express from "express";
import {
  deleteImage,
  getImages,
  upload,
  uploadImages,
} from "../controllers/imageController";
import { validate } from "../middleware/validate";
import { restoreWorkspaceContext } from "../lib/workspaceContext";
import { idParamSchema } from "../schemas/common";
import { imageParamsSchema } from "../schemas/image";

// mergeParams so :id from the parent device router is visible here.
const router = express.Router({ mergeParams: true });

router.get("/", validate({ params: idParamSchema }), getImages);

router.post(
  "/",
  validate({ params: idParamSchema }),
  upload.array("images", 20),
  // After multer, not before: reading the multipart body through busboy
  // detaches the request from the async context, so the workspace has to be
  // put back before any query runs.
  restoreWorkspaceContext,
  uploadImages,
);

router.delete(
  "/:imageId",
  validate({ params: imageParamsSchema }),
  deleteImage,
);

// `export =` rather than `export default`: routes/devices.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
