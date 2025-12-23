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
} from "../../controllers/paxController";
import { upload } from "../../middlewares/upload";

router.get("/", getAllPax);
router.post("/create", upload.any() as any, addPax);
router.get("/:id", getPaxById);
router.put("/update/:id", upload.any() as any, updatePax);
router.delete("/:id", deletePax);

// Photo management routes
router.get("/:id/photos", getPaxPhotos);
router.post("/:id/photos", upload.any() as any, addPhotoToPax);
router.delete("/:paxId/photos/:photoId", deletePhotoFromPax);

export default router;
