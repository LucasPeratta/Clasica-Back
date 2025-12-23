import express from "express";
import { protect } from "../middlewares/protect";

const router = express.Router();

// Welcome route
router.get("/", (req, res) => {
  res.json({ 
    message: "Clasica Moderna API", 
    version: "1.0.0",
    endpoints: {
      auth: "/api/login, /api/register, /api/logout",
      pax: "/api/pax",
      file: "/api/file",
      service: "/api/service",
      user: "/api/user"
    }
  });
});

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
router.use("/", authRoutes);

export default router;
