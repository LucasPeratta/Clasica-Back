import express from "express";
import { getClientPaymentsHistory, getCobranzas } from "../../controllers/paymentsController";

const router = express.Router();

// Files that still owe money, by next due date
router.get("/", getCobranzas);
// History of all client payments received
router.get("/pagos", getClientPaymentsHistory);

export default router;
