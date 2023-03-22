import express from "express";
const router = express.Router();

import {
  addPax,
  getAllPax,
  getPaxById,
  updatePax,
  deletePax,
} from "../../controllers/paxController";

router.get("/", getAllPax);
router.post("/", addPax);
router.get("/:id", getPaxById);
router.put("/:id", updatePax);
router.delete("/:id", deletePax);

export default router;
