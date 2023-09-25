import express from "express";
const router = express.Router();

import {
  addFile,
  getAllFile,
  getFileById,
  updateFile,
  deleteFile,
} from "../../controllers/fileController";

router.get("/", getAllFile);
router.post("/create", addFile);
router.get("/:id", getFileById);
router.put("/update/:id", updateFile);
router.delete("/:id", deleteFile);
router.patch("/soft-delete/:id", deleteFile);

export default router;
