import express from "express";
import { getCobranzas } from "../../controllers/paymentsController";

const router = express.Router();

// Files that still owe money, by next due date
router.get("/", getCobranzas);

export default router;
