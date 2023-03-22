import express from "express";
const router = express.Router();

import {
  addService,
  getAllService,
  getServiceById,
  updateService,
  deleteService,
} from "../../controllers/serviceController";

router.get("/", getAllService);
router.post("/", addService);
router.get("/:id", getServiceById);
router.put("/:id", updateService);
router.delete("/:id", deleteService);

export default router;
