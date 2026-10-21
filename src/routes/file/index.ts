import express from "express";
const router = express.Router();

import {
  addFile,
  getAllFile,
  getFileById,
  updateFile,
  deleteFile,
  addPdfToFile,
  deletePdfFromFile,
  getFilePdfs,
  getFilePdfUrl,
} from "../../controllers/fileController";
import {
  addPago,
  deletePago,
  getFilePayments,
  resetPlan,
  savePlan,
  updatePago,
} from "../../controllers/paymentsController";
import { uploadPdfs } from "../../middlewares/upload";

router.get("/", getAllFile);
router.post("/create", addFile);
router.get("/:id", getFileById);
router.put("/update/:id", updateFile);
router.delete("/:id", deleteFile);
router.patch("/soft-delete/:id", deleteFile);

// PDF management routes
router.get("/:id/pdfs", getFilePdfs);
router.post("/:id/pdfs", uploadPdfs, addPdfToFile);
router.get("/:fileId/pdfs/:pdfId/url", getFilePdfUrl);
router.delete("/:fileId/pdfs/:pdfId", deletePdfFromFile);

// Client payments: plan (automatic or the administrator's own) and payments received
router.get("/:id/pagos", getFilePayments);
router.post("/:id/pagos", addPago);
router.put("/:id/pagos/:pagoId", updatePago);
router.delete("/:id/pagos/:pagoId", deletePago);
router.put("/:id/plan", savePlan);
router.delete("/:id/plan", resetPlan);

export default router;
