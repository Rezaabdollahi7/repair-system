import express from "express";
import {
  deleteImage,
  getImages,
  upload,
  uploadImages,
} from "../controllers/imageController";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import { imageParamsSchema } from "../schemas/image";

// mergeParams so :id from the parent device router is visible here.
const router = express.Router({ mergeParams: true });

router.get("/", validate({ params: idParamSchema }), getImages);

router.post(
  "/",
  validate({ params: idParamSchema }),
  upload.array("images", 20),
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
