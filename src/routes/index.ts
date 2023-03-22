import express from "express";
const router = express.Router();

// Import all routers here
import paxRoutes from "./pax";
import fileRoutes from "./file";
import serviceRoutes from "./service";

// Link all routers to the main router
router.use("/pax", paxRoutes);
router.use("/file", fileRoutes);
router.use("/service", serviceRoutes);

export default router;
