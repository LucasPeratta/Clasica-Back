import express from "express";
import { protect } from "../middlewares/protect";

const router = express.Router();

// Import all routers here
import paxRoutes from "./pax";
import fileRoutes from "./file";
import serviceRoutes from "./service";
import userRoutes from "./user";
import authRoutes from "./auth";

router.use("/", authRoutes);

// Add middleware to protect all routes
// router.use(protect);

// Link all routers to the main router
router.use("/pax", paxRoutes);
router.use("/file", fileRoutes);
router.use("/service", serviceRoutes);
router.use("/user", userRoutes);

export default router;
