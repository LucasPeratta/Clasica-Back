import express from "express";
const router = express.Router();

// Import all routers here
import paxRoutes from "./pax";

// Link all routers to the main router
router.use("/pax", paxRoutes);

export default router;
