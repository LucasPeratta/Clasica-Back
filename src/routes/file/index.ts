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
} from "../../controllers/fileController";
import { upload } from "../../middlewares/upload";

router.get("/", getAllFile);
router.post("/create", addFile);
router.get("/:id", getFileById);
router.put("/update/:id", updateFile);
router.delete("/:id", deleteFile);
router.patch("/soft-delete/:id", deleteFile);

// PDF management routes
router.get("/:id/pdfs", getFilePdfs);
router.post("/:id/pdfs", upload.any() as any, addPdfToFile);
router.delete("/:fileId/pdfs/:pdfId", deletePdfFromFile);

export default router;
