import express from "express";
const router = express.Router();

import {
  addPax,
  getAllPax,
  getpaxById,
  updatepax,
  deletepax,
} from "../../controllers/paxControllers";

router.get("/", getAllPax);
router.post("/", addPax);
router.get("/:id", getpaxById);
router.put("/:id", updatepax);
router.delete("/:id", deletepax);

export default router;
