import express from "express";
import {
  addSupplierPayment,
  deleteSupplierPayment,
  getPendingSupplierPayments,
  getSupplierPayments,
  searchServicesToPay,
} from "../../controllers/supplierPaymentsController";

const router = express.Router();

// Payments to wholesalers
router.get("/servicios", searchServicesToPay);
router.get("/pendientes", getPendingSupplierPayments);
router.get("/pagos", getSupplierPayments);
router.post("/pagos", addSupplierPayment);
router.delete("/pagos/:id", deleteSupplierPayment);

export default router;
