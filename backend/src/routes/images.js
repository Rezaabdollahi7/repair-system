const express = require("express");
const router = express.Router({ mergeParams: true });
const {
  upload,
  uploadImages,
  getImages,
  deleteImage,
} = require("../controllers/imageController");

// GET    /api/devices/:id/images
router.get("/", getImages);

// POST   /api/devices/:id/images
router.post("/", upload.array("images", 20), uploadImages);

// DELETE /api/devices/:id/images/:imageId
router.delete("/:imageId", deleteImage);

module.exports = router;
