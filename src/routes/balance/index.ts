import express from "express";
import { getBalance, searchFilesToInvoice } from "../../controllers/balanceController";

const router = express.Router();

// Invoiced to clients vs paid to wholesalers, per month
router.get("/", getBalance);
// Find a file to mark it as invoiced
router.get("/files", searchFilesToInvoice);

export default router;
