import express from "express";
const router = express.Router();

import {
  addService,
  getAllService,
  getServiceById,
  updateService,
  deleteService,
  softDeleteService,
} from "../../controllers/serviceController";

router.get("/", getAllService);
router.post("/create", addService);
router.get("/:id", getServiceById);
router.put("/:id", updateService);
router.delete("/:id", deleteService);
router.delete("/:id", softDeleteService);

export default router;
