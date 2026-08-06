import express from "express";
import * as ctrl from "../controllers/serviceController";
import { authenticate } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { idParamSchema } from "../schemas/common";
import { serviceCreateSchema, serviceUpdateSchema } from "../schemas/service";

const router = express.Router();

router.use(authenticate);

router.get("/", ctrl.getAll);
router.post("/", validate({ body: serviceCreateSchema }), ctrl.create);
router.put(
  "/:id",
  validate({ params: idParamSchema, body: serviceUpdateSchema }),
  ctrl.update,
);
router.delete("/:id", validate({ params: idParamSchema }), ctrl.remove);

// `export =` rather than `export default`: routes/index.js still uses
// require(), which would otherwise receive { default: router }.
export = router;
