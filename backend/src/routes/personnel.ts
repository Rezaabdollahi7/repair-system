import express from "express";
import * as ctrl from "../controllers/personnelController";
import { authenticate } from "../middleware/auth";
import { atLeast, authorize } from "../middleware/authorize";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import {
  personnelCreateSchema,
  personnelListQuerySchema,
  personnelUpdateSchema,
} from "../schemas/personnel";

const router = express.Router();

router.use(authenticate);

// خواندن - همه نقش‌ها
router.get("/", validate({ query: personnelListQuerySchema }), ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getOne);

// ایجاد و ویرایش - فقط admin و بالاتر
router.post(
  "/",
  atLeast("admin"),
  validate({ body: personnelCreateSchema }),
  ctrl.create,
);
router.put(
  "/:id",
  atLeast("admin"),
  validate({ params: idParamSchema, body: personnelUpdateSchema }),
  ctrl.update,
);
router.put(
  "/:id/toggle-active",
  atLeast("admin"),
  validate({ params: idParamSchema }),
  ctrl.toggleActive,
);

// حذف - فقط super_admin
router.delete(
  "/:id",
  authorize("super_admin"),
  validate({ params: idParamSchema }),
  ctrl.remove,
);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
