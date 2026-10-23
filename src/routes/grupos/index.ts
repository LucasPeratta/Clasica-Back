import express from "express";
import {
  addGroup,
  addGroupPdfs,
  addGroupService,
  addPlan,
  addReservation,
  addRoom,
  deleteGroup,
  deleteGroupPdf,
  deleteGroupService,
  deletePlan,
  deleteRoom,
  getGroup,
  getGroupPdfs,
  getGroupPdfUrl,
  getGroups,
  updateGroup,
  updateGroupService,
  updatePlan,
  updateReservation,
  updateRoom,
} from "../../controllers/grupoController";
import { uploadPdfs } from "../../middlewares/upload";

const router = express.Router();

// Group departures
router.get("/", getGroups);
router.post("/", addGroup);
router.get("/:id", getGroup);
router.put("/:id", updateGroup);
router.delete("/:id", deleteGroup);

// Itinerary with list prices per passenger
router.post("/:id/servicios", addGroupService);
router.put("/:id/servicios/:servicioId", updateGroupService);
router.delete("/:id/servicios/:servicioId", deleteGroupService);

// Reservations (each one is a File of the group)
router.post("/:id/reservas", addReservation);
router.put("/:id/reservas/:fileId", updateReservation);

// Payment plans
router.post("/:id/planes", addPlan);
router.put("/:id/planes/:planId", updatePlan);
router.delete("/:id/planes/:planId", deletePlan);

// Rooming
router.post("/:id/habitaciones", addRoom);
router.put("/:id/habitaciones/:roomId", updateRoom);
router.delete("/:id/habitaciones/:roomId", deleteRoom);

// Documents
router.get("/:id/pdfs", getGroupPdfs);
router.post("/:id/pdfs", uploadPdfs, addGroupPdfs);
router.get("/:id/pdfs/:pdfId/url", getGroupPdfUrl);
router.delete("/:id/pdfs/:pdfId", deleteGroupPdf);

export default router;
