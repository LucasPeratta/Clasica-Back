import express from "express";
const router = express.Router();

import {
  addService,
  getAllService,
  getServiceById,
  updateService,
  softDeleteService,
  setServiceLiquidado,
  getProviders,
} from "../../controllers/serviceController";

router.get("/", getAllService);
// Before "/:id" so "proveedores" is not taken as an id
router.get("/proveedores", getProviders);
router.post("/create", addService);
router.get("/:id", getServiceById);
router.put("/:id", updateService);
router.delete("/:id", softDeleteService);
router.patch("/:id/liquidado", setServiceLiquidado);

export default router;
