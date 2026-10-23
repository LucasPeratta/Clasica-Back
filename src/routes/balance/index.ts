import express from "express";
import { getBalance } from "../../controllers/balanceController";

const router = express.Router();

// Invoiced to clients vs paid to wholesalers, per month
router.get("/", getBalance);

export default router;
