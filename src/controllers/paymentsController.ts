import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Currency, PaymentMethod } from "@prisma/client";
import {
  FileWithPayments,
  PaymentError,
  filePaymentsInclude,
  getAppliedAmount,
  getCharge,
  getPaymentsSummary,
} from "../utils/payments";
import { PAGE_SIZE, buildPage, getPaginationParams } from "../utils/pagination";

const CHARGE_PROBLEM_MESSAGES = {
  MIXED_CURRENCIES:
    "El file tiene servicios en distintas monedas: cargá la tarifa alternativa para definir en qué moneda se cobra.",
  NOTHING_TO_CHARGE: "El file todavía no tiene nada para cobrar (sin servicios ni tarifa alternativa).",
};

const loadFile = (fileId: string) =>
  prisma.file.findUnique({ where: { id: fileId }, include: filePaymentsInclude });

const paymentToJson = (pago: FileWithPayments["pagos"][number]) => ({
  ...pago,
  importe: Number(pago.importe),
  tipoCambio: pago.tipoCambio === null ? null : Number(pago.tipoCambio),
  importeAplicado: Number(pago.importeAplicado),
});

const summaryResponse = (file: FileWithPayments) => ({
  ...getPaymentsSummary(file),
  pagos: file.pagos.map(paymentToJson),
});

const parseDate = (value: unknown) => {
  const date = new Date(String(value));
  return isNaN(date.getTime()) ? null : date;
};

// GET /file/:id/pagos — plan, payments and status of a file
export const getFilePayments = async (req: Request, res: Response) => {
  try {
    const file = await loadFile(req.params.id);
    if (!file) return res.status(404).json({ msg: "File no encontrado" });
    res.json(summaryResponse(file));
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener los pagos", error });
    console.log(error);
  }
};

// PUT /file/:id/plan — the administrator's own plan: { cuotas: [{ concepto, importe, vencimiento }] }
export const savePlan = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  const cuotas = Array.isArray(req.body?.cuotas) ? req.body.cuotas : null;

  const parsed = (cuotas ?? []).map((c: Record<string, unknown>) => ({
    concepto: String(c.concepto ?? "").trim(),
    importe: Number(c.importe),
    vencimiento: parseDate(c.vencimiento),
  }));
  if (
    !cuotas ||
    parsed.some(
      (c: { concepto: string; importe: number; vencimiento: Date | null }) =>
        !c.concepto || !(c.importe > 0) || !c.vencimiento
    )
  ) {
    return res
      .status(400)
      .json({ msg: "Cada cuota necesita concepto, un importe mayor a cero y fecha de vencimiento." });
  }

  try {
    if (!(await prisma.file.findUnique({ where: { id: fileId } }))) {
      return res.status(404).json({ msg: "File no encontrado" });
    }
    await prisma.$transaction([
      prisma.fileCuota.deleteMany({ where: { fileId } }),
      prisma.fileCuota.createMany({
        data: parsed.map((c: { concepto: string; importe: number; vencimiento: Date }) => ({ ...c, fileId })),
      }),
      prisma.file.update({ where: { id: fileId }, data: { planPersonalizado: true } }),
    ]);
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    res.status(500).json({ msg: "Error al guardar el plan de pagos", error });
    console.log(error);
  }
};

// DELETE /file/:id/plan — back to the automatic plan
export const resetPlan = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  try {
    await prisma.$transaction([
      prisma.fileCuota.deleteMany({ where: { fileId } }),
      prisma.file.update({ where: { id: fileId }, data: { planPersonalizado: false } }),
    ]);
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    res.status(500).json({ msg: "Error al volver al plan automático", error });
    console.log(error);
  }
};

// Validates a payment and calculates how much it covers in the file's currency
const buildPayment = (file: FileWithPayments, body: Record<string, unknown>) => {
  const charge = getCharge(file);
  if (!charge.currency) {
    throw new PaymentError(CHARGE_PROBLEM_MESSAGES[charge.problem!]);
  }

  const fecha = parseDate(body.fecha);
  const importe = Number(body.importe);
  const moneda = body.moneda as Currency;
  const medio = body.medio as PaymentMethod;
  const tipoCambio = body.tipoCambio === null || body.tipoCambio === undefined || body.tipoCambio === ""
    ? null
    : Number(body.tipoCambio);

  if (!fecha) throw new PaymentError("Falta la fecha del pago.");
  if (!(importe > 0)) throw new PaymentError("El importe tiene que ser mayor a cero.");
  if (!Object.values(Currency).includes(moneda)) throw new PaymentError("Moneda inválida.");
  if (!Object.values(PaymentMethod).includes(medio)) throw new PaymentError("Medio de pago inválido.");

  const sameCurrency = moneda === charge.currency;
  return {
    fecha,
    importe,
    moneda,
    medio,
    tipoCambio: sameCurrency ? null : tipoCambio,
    importeAplicado: getAppliedAmount(importe, moneda, charge.currency, tipoCambio),
    nota: String(body.nota ?? "").trim().slice(0, 300) || null,
  };
};

const handlePaymentError = (res: Response, error: unknown, msg: string) => {
  if (error instanceof PaymentError) return res.status(400).json({ msg: error.message });
  res.status(500).json({ msg, error });
  console.log(error);
};

// POST /file/:id/pagos — register a payment
export const addPago = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  try {
    const file = await loadFile(fileId);
    if (!file) return res.status(404).json({ msg: "File no encontrado" });
    await prisma.filePago.create({ data: { ...buildPayment(file, req.body ?? {}), fileId } });
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    handlePaymentError(res, error, "Error al registrar el pago");
  }
};

// PUT /file/:id/pagos/:pagoId — fix a payment
export const updatePago = async (req: Request, res: Response) => {
  const { id: fileId, pagoId } = req.params;
  try {
    const file = await loadFile(fileId);
    if (!file || !file.pagos.some((p) => p.id === pagoId)) {
      return res.status(404).json({ msg: "Pago no encontrado" });
    }
    await prisma.filePago.update({ where: { id: pagoId }, data: buildPayment(file, req.body ?? {}) });
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    handlePaymentError(res, error, "Error al modificar el pago");
  }
};

// DELETE /file/:id/pagos/:pagoId
export const deletePago = async (req: Request, res: Response) => {
  const { id: fileId, pagoId } = req.params;
  try {
    const result = await prisma.filePago.deleteMany({ where: { id: pagoId, fileId } });
    if (result.count === 0) return res.status(404).json({ msg: "Pago no encontrado" });
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    res.status(500).json({ msg: "Error al eliminar el pago", error });
    console.log(error);
  }
};

// GET /cobranzas?filtro=vencidos|semana|mes|todos&page=&search=
// Files that still owe money, by next due date. counts: how many in each filter
export const getCobranzas = async (req: Request, res: Response) => {
  try {
    const { page, skip, terms } = getPaginationParams(req);

    const files = await prisma.file.findMany({
      include: {
        ...filePaymentsInclude,
        clients: { select: { firstname: true, lastname: true }, take: 1 },
      },
    });

    const owing = files
      .map((file) => ({ file, summary: getPaymentsSummary(file) }))
      .filter(({ summary }) => summary.falta > 0 && summary.proximoVencimiento)
      .filter(({ file }) =>
        terms.every((term) => {
          const t = term.toLowerCase();
          const number = file.numero && file.anio ? `${file.numero}-${file.anio}` : "";
          const pax = file.clients[0] ? `${file.clients[0].lastname} ${file.clients[0].firstname}` : "";
          return [file.destino, pax, number, String(file.numero ?? "")].some((v) =>
            v.toLowerCase().includes(t)
          );
        })
      )
      .sort(
        (a, b) =>
          a.summary.proximoVencimiento!.vencimiento.getTime() -
          b.summary.proximoVencimiento!.vencimiento.getTime()
      );

    const days = (item: (typeof owing)[number]) => item.summary.proximoVencimiento!.diasParaVencer;
    const filters = {
      vencidos: owing.filter((i) => i.summary.estado === "VENCIDO"),
      semana: owing.filter((i) => days(i) >= 0 && days(i) <= 7),
      mes: owing.filter((i) => days(i) >= 0 && days(i) <= 30),
      todos: owing,
    };
    const requested = String(req.query.filtro ?? "todos");
    const filtro = (requested in filters ? requested : "todos") as keyof typeof filters;
    const selected = filters[filtro];

    const data = selected.slice(skip, skip + PAGE_SIZE).map(({ file, summary }) => ({
      id: file.id,
      numero: file.numero,
      anio: file.anio,
      destino: file.destino,
      fechaSalida: file.fechaSalida,
      pasajero: file.clients[0] ?? null,
      moneda: summary.moneda,
      total: summary.total,
      cobrado: summary.cobrado,
      falta: summary.falta,
      estado: summary.estado,
      proximoVencimiento: summary.proximoVencimiento,
    }));

    res.json({
      ...buildPage(data, selected.length, page),
      counts: Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v.length])),
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener las cobranzas", error });
    console.log(error);
  }
};
