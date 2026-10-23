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
  getServiceAdjuntos,
  addServiceAdjuntos,
  getServiceAdjuntoUrl,
  deleteServiceAdjunto,
} from "../../controllers/serviceController";
import { uploadAttachments } from "../../middlewares/upload";

router.get("/", getAllService);
// Before "/:id" so "proveedores" is not taken as an id
router.get("/proveedores", getProviders);
router.post("/create", addService);
router.get("/:id", getServiceById);
router.put("/:id", updateService);
router.delete("/:id", softDeleteService);
router.patch("/:id/liquidado", setServiceLiquidado);

// Photos or documents of the service (e.g. the flight itinerary)
router.get("/:id/adjuntos", getServiceAdjuntos);
router.post("/:id/adjuntos", uploadAttachments, addServiceAdjuntos);
router.get("/:id/adjuntos/:adjuntoId/url", getServiceAdjuntoUrl);
router.delete("/:id/adjuntos/:adjuntoId", deleteServiceAdjunto);

export default router;
