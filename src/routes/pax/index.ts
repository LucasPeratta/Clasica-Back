import express from "express";
const router = express.Router();

import {
  addPax,
  getAllPax,
  getPaxById,
  updatePax,
  deletePax,
  addPhotoToPax,
  deletePhotoFromPax,
  getPaxPhotos,
  addPdfToPax,
  deletePdfFromPax,
  getPaxPdfs,
  getPaxPdfUrl,
  getPaxFiles,
} from "../../controllers/paxController";
import { upload, uploadPdfs } from "../../middlewares/upload";

router.get("/", getAllPax);
router.post("/create", upload.any() as any, addPax);
router.get("/:id", getPaxById);
router.put("/update/:id", upload.any() as any, updatePax);
router.delete("/:id", deletePax);
router.get("/:id/files", getPaxFiles);

// Photo management routes
router.get("/:id/photos", getPaxPhotos);
router.post("/:id/photos", upload.any() as any, addPhotoToPax);
router.delete("/:paxId/photos/:photoId", deletePhotoFromPax);

// PDF management routes
router.get("/:id/pdfs", getPaxPdfs);
router.post("/:id/pdfs", uploadPdfs, addPdfToPax);
router.get("/:paxId/pdfs/:pdfId/url", getPaxPdfUrl);
router.delete("/:paxId/pdfs/:pdfId", deletePdfFromPax);

export default router;
