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

export default router;
