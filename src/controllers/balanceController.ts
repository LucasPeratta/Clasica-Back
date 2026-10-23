import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Currency } from "@prisma/client";
import { filePaymentsInclude, getPaymentsSummary } from "../utils/payments";

// Balance: what we invoiced to clients (files marked as invoiced) against what we paid to
// wholesalers (what they invoice us), per month and currency. No currency conversion.

const round2 = (n: number) => Math.round(n * 100) / 100;
const MONTHS_BY_DEFAULT = 12;

// "2026-10" -> first day of that month (local time); invalid -> null
const parseMonth = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  return new Date(year, month - 1, 1);
};
const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

// PUT /file/:id/facturacion { fecha, importe, moneda, numero? } — the whole file is invoiced at once
export const setInvoice = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const fecha = new Date(String(body.fecha));
  const importe = round2(Number(body.importe));
  const moneda = body.moneda as Currency;
  if (isNaN(fecha.getTime())) return res.status(400).json({ msg: "Falta la fecha de la factura." });
  if (!(importe > 0)) return res.status(400).json({ msg: "El importe tiene que ser mayor a cero." });
  if (!Object.values(Currency).includes(moneda)) return res.status(400).json({ msg: "Moneda inválida." });

  try {
    const result = await prisma.file.updateMany({
      where: { id: req.params.id },
      data: {
        facturadoAt: fecha,
        facturaImporte: importe,
        facturaMoneda: moneda,
        facturaNumero: String(body.numero ?? "").trim().slice(0, 50) || null,
      },
    });
    if (result.count === 0) return res.status(404).json({ msg: "File no encontrado" });
    res.json({ msg: "File facturado" });
  } catch (error) {
    res.status(500).json({ msg: "Error al guardar la facturación", error });
    console.log(error);
  }
};

// DELETE /file/:id/facturacion — e.g. marked by mistake
export const removeInvoice = async (req: Request, res: Response) => {
  try {
    const result = await prisma.file.updateMany({
      where: { id: req.params.id },
      data: { facturadoAt: null, facturaImporte: null, facturaMoneda: null, facturaNumero: null },
    });
    if (result.count === 0) return res.status(404).json({ msg: "File no encontrado" });
    res.json({ msg: "Facturación quitada" });
  } catch (error) {
    res.status(500).json({ msg: "Error al quitar la facturación", error });
    console.log(error);
  }
};

// GET /balance?desde=2026-01&hasta=2026-10 (months, both included; by default the last 12).
// meses: invoiced and paid per currency each month; porFacturar: files fully paid by the
// client that are not invoiced yet
export const getBalance = async (req: Request, res: Response) => {
  const now = new Date();
  const hastaMonth = parseMonth(req.query.hasta) ?? new Date(now.getFullYear(), now.getMonth(), 1);
  const desdeMonth =
    parseMonth(req.query.desde) ?? new Date(hastaMonth.getFullYear(), hastaMonth.getMonth() - (MONTHS_BY_DEFAULT - 1), 1);
  if (desdeMonth > hastaMonth) return res.status(400).json({ msg: "El período está al revés." });
  const end = new Date(hastaMonth.getFullYear(), hastaMonth.getMonth() + 1, 1);

  try {
    const [invoiced, supplierPayments, notInvoiced] = await Promise.all([
      prisma.file.findMany({
        where: { facturadoAt: { gte: desdeMonth, lt: end } },
        select: { facturadoAt: true, facturaImporte: true, facturaMoneda: true },
      }),
      prisma.pagoMayorista.findMany({
        where: { fecha: { gte: desdeMonth, lt: end } },
        select: { fecha: true, importe: true, moneda: true },
      }),
      prisma.file.findMany({
        where: { facturadoAt: null },
        include: { ...filePaymentsInclude, clients: { select: { firstname: true, lastname: true }, take: 1 } },
      }),
    ]);

    // Every month of the period, also the empty ones
    const meses: { mes: string; facturado: Record<string, number>; pagado: Record<string, number> }[] = [];
    for (let d = new Date(desdeMonth); d < end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      meses.push({ mes: monthKey(d), facturado: {}, pagado: {} });
    }
    const byMonth = new Map(meses.map((m) => [m.mes, m]));
    const add = (bucket: Record<string, number>, currency: string, amount: number) => {
      bucket[currency] = round2((bucket[currency] ?? 0) + amount);
    };
    for (const f of invoiced) {
      const month = byMonth.get(monthKey(f.facturadoAt!));
      if (month && f.facturaMoneda) add(month.facturado, f.facturaMoneda, Number(f.facturaImporte ?? 0));
    }
    for (const p of supplierPayments) {
      const month = byMonth.get(monthKey(p.fecha));
      if (month) add(month.pagado, p.moneda, Number(p.importe));
    }

    const porFacturar = notInvoiced
      .map((file) => ({ file, summary: getPaymentsSummary(file) }))
      .filter(({ summary }) => summary.estado === "PAGADO" && summary.total > 0)
      .sort((a, b) => a.file.fechaSalida.getTime() - b.file.fechaSalida.getTime())
      .map(({ file, summary }) => ({
        id: file.id,
        numero: file.numero,
        anio: file.anio,
        destino: file.destino,
        fechaSalida: file.fechaSalida,
        pasajero: file.clients[0] ?? null,
        moneda: summary.moneda,
        total: summary.total,
      }));

    res.json({ meses, porFacturar });
  } catch (error) {
    res.status(500).json({ msg: "Error al armar el balance", error });
    console.log(error);
  }
};

