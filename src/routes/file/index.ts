import express from "express";
const router = express.Router();

import {
  addFile,
  getAllFile,
  getFileById,
  updateFile,
  deleteFile,
  addPaxToFile,
  addServiceToFile,
} from "../../controllers/fileController";

router.get("/", getAllFile);
router.post("/", addFile);
router.post("/pax", addPaxToFile);
router.post("/service", addServiceToFile);
router.get("/:id", getFileById);
router.put("/:id", updateFile);
router.delete("/:id", deleteFile);

export default router;
