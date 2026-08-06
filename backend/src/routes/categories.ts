import express from "express";
import * as ctrl from "../controllers/categoryController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import { categoryBodySchema } from "../schemas/category";

const router = express.Router();

router.use(authenticate);

router.get("/", ctrl.getAll);
router.get("/:id", validate({ params: idParamSchema }), ctrl.getById);
router.post("/", validate({ body: categoryBodySchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: categoryBodySchema }),
  ctrl.update,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
