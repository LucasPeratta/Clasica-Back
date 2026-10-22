import express from "express";
import { getHome } from "../../controllers/homeController";

const router = express.Router();

// Home page: what needs attention today
router.get("/", getHome);

export default router;
