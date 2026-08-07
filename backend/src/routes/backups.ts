import express from "express";
import * as ctrl from "../controllers/backupController";
import { authenticate } from "../middleware/auth";
import { atLeast } from "../middleware/authorize";

const router = express.Router();

router.use(authenticate);
// Replaces a locally defined requireAdmin that duplicated this, minus its
// isActive check.
router.use(atLeast("admin"));

router.get("/", ctrl.list);
router.post("/", ctrl.create);
router.get("/:id/download", ctrl.download);
router.post("/:id/restore", ctrl.restore);
router.delete("/:id", ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
