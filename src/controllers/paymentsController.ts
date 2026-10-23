import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Currency, PaymentMethod, Prisma } from "@prisma/client";
import { fileNumberConditions } from "../utils/fileNumber";
import {
  FileWithPayments,
  PaymentError,
  filePaymentsInclude,
  getAppliedAmount,
  getCharge,
  getPaymentsSummary,
} from "../utils/payments";
import { getFileBalances } from "../utils/fileBalances";
import { PAGE_SIZE, buildPage, getDateRange, getPaginationParams } from "../utils/pagination";

const CHARGE_PROBLEM_MESSAGES = {
  MIXED_CURRENCIES:
    "El file tiene servicios en distintas monedas: cargá la tarifa alternativa para definir en qué moneda se cobra.",
  NOTHING_TO_CHARGE: "El file todavía no tiene nada para cobrar (sin servicios ni tarifa alternativa).",
};

const loadFile = (fileId: string) =>
  prisma.file.findUnique({ where: { id: fileId }, include: filePaymentsInclude });

const paymentToJson = ({ recibo, ...pago }: FileWithPayments["pagos"][number]) => ({
  ...pago,
  importe: Number(pago.importe),
  tipoCambio: pago.tipoCambio === null ? null : Number(pago.tipoCambio),
  importeAplicado: Number(pago.importeAplicado),
  reciboNumero: recibo?.numero ?? null,
});

// Who paid: must be one of the file's pax (or nobody)
const getPayerId = async (fileId: string, value: unknown) => {
  if (!value) return null;
  const pax = await prisma.pax.findFirst({
    where: { id: String(value), File: { some: { id: fileId } } },
    select: { id: true },
  });
  if (!pax) throw new PaymentError("El pasajero que pagó no está en este file.");
  return pax.id;
};

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
    const pagadorId = await getPayerId(fileId, req.body?.pagadorId);
    // Each payment gets the next receipt number
    await prisma.filePago.create({
      data: { ...buildPayment(file, req.body ?? {}), fileId, pagadorId, recibo: { create: {} } },
    });
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
    const pagadorId = await getPayerId(fileId, req.body?.pagadorId);
    await prisma.filePago.update({ where: { id: pagoId }, data: { ...buildPayment(file, req.body ?? {}), pagadorId } });
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    handlePaymentError(res, error, "Error al modificar el pago");
  }
};

// DELETE /file/:id/pagos/:pagoId
export const deletePago = async (req: Request, res: Response) => {
  const { id: fileId, pagoId } = req.params;
  try {
    // Once invoiced, its payments are kept (AFIP)
    const invoiced = await prisma.file.findFirst({ where: { id: fileId, facturadoAt: { not: null } }, select: { id: true } });
    if (invoiced) {
      return res.status(400).json({ msg: "El file está facturado: sus pagos no se pueden eliminar. Si hace falta, primero quitá la facturación." });
    }

    const result = await prisma.filePago.deleteMany({ where: { id: pagoId, fileId } });
    if (result.count === 0) return res.status(404).json({ msg: "Pago no encontrado" });
    res.json(summaryResponse((await loadFile(fileId))!));
  } catch (error) {
    res.status(500).json({ msg: "Error al eliminar el pago", error });
    console.log(error);
  }
};

// GET /file/:id/pagos/:pagoId/recibo — data for the payment's receipt (the PDF is made in the
// front). Payments registered before receipts existed get their number now
export const getReceipt = async (req: Request, res: Response) => {
  const { id: fileId, pagoId } = req.params;
  try {
    const pago = await prisma.filePago.findFirst({
      where: { id: pagoId, fileId },
      include: {
        pagador: { select: { firstname: true, lastname: true, dni: true, passport: true } },
        recibo: { select: { numero: true } },
        file: {
          select: {
            numero: true,
            anio: true,
            destino: true,
            clients: { select: { firstname: true, lastname: true, dni: true, passport: true }, take: 1 },
          },
        },
      },
    });
    if (!pago) return res.status(404).json({ msg: "Pago no encontrado" });

    const numero =
      pago.recibo?.numero ??
      (await prisma.recibo.upsert({ where: { pagoId }, update: {}, create: { pagoId } })).numero;
    const pax = pago.pagador ?? pago.file.clients[0] ?? null;

    res.json({
      numero,
      fecha: pago.fecha,
      importe: Number(pago.importe),
      moneda: pago.moneda,
      tipoCambio: pago.tipoCambio === null ? null : Number(pago.tipoCambio),
      medio: pago.medio,
      nota: pago.nota,
      pasajero: pax
        ? { nombre: `${pax.firstname} ${pax.lastname}`, documento: pax.dni || pax.passport || null }
        : null,
      file: { numero: pago.file.numero, anio: pago.file.anio, destino: pago.file.destino },
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al armar el recibo", error });
    console.log(error);
  }
};

// Amount paid per currency (as paid) of the payments matching the filter
const sumByCurrency = async (where: Prisma.FilePagoWhereInput) => {
  const groups = await prisma.filePago.groupBy({ by: ["moneda"], where, _sum: { importe: true } });
  return Object.fromEntries(groups.map((g) => [g.moneda, Number(g._sum.importe ?? 0)]));
};

// GET /cobranzas/pagos?page=&search=&desde=&hasta= — history of all client payments, latest
// first. Search by pax name, destination or file number ("55" / "55-2026"); optional date
// range (both days included). totals: amount paid per currency of everything found
export const getClientPaymentsHistory = async (req: Request, res: Response) => {
  try {
    const { page, skip, take, terms } = getPaginationParams(req);

    const where: Prisma.FilePagoWhereInput = {
      fecha: getDateRange(req),
      AND: terms.map((term) => ({
        file: {
          OR: [
            { destino: { contains: term } },
            ...fileNumberConditions(term),
            {
              clients: {
                some: {
                  OR: [{ firstname: { contains: term } }, { lastname: { contains: term } }],
                },
              },
            },
          ],
        },
      })),
    };

    const [pagos, total] = await prisma.$transaction([
      prisma.filePago.findMany({
        where,
        include: {
          file: {
            select: {
              id: true,
              numero: true,
              anio: true,
              destino: true,
              clients: { select: { firstname: true, lastname: true }, take: 1 },
            },
          },
          pagador: { select: { id: true, firstname: true, lastname: true } },
          recibo: { select: { numero: true } },
        },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.filePago.count({ where }),
    ]);
    const totals = await sumByCurrency(where);

    res.json({
      ...buildPage(
        pagos.map(({ file, ...pago }) => ({
          ...paymentToJson({ ...pago, fileId: file.id }),
          file: { id: file.id, numero: file.numero, anio: file.anio, destino: file.destino },
          // Who paid; if not recorded, the file's first pax
          pasajero: pago.pagador ?? file.clients[0] ?? null,
        })),
        total,
        page
      ),
      totals,
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener los pagos recibidos", error });
    console.log(error);
  }
};

// GET /cobranzas?filtro=vencidos|semana|mes|todos&page=&search=
// Files that still owe money, by next due date. counts: how many in each filter
// Files that still owe money, by next due date (optionally filtered by search terms).
// Also used by the home page
export const listOwingFiles = async (terms: string[] = []) => {
  // Only files that may owe something get the full calculation (old paid trips are skipped)
  const candidates = (await getFileBalances()).filter((f) => f.chargeable && f.target - f.paid > 0.009);
  const files = await prisma.file.findMany({
    where: { id: { in: candidates.map((f) => f.id) } },
    include: {
      ...filePaymentsInclude,
      clients: { select: { id: true, firstname: true, lastname: true } },
    },
  });

  return files
    .map((file) => ({ file, summary: getPaymentsSummary(file) }))
    .filter(({ summary }) => summary.falta > 0 && summary.proximoVencimiento)
    .filter(({ file }) =>
      terms.every((term) => {
        const t = term.toLowerCase();
        const number = file.numero && file.anio ? `${file.numero}-${file.anio}` : "";
        // Any of the file's pax
        const paxs = file.clients.map((c) => `${c.lastname} ${c.firstname}`);
        return [file.destino, ...paxs, number, String(file.numero ?? "")].some((v) =>
          v.toLowerCase().includes(t)
        );
      })
    )
    .sort(
      (a, b) =>
        a.summary.proximoVencimiento!.vencimiento.getTime() -
        b.summary.proximoVencimiento!.vencimiento.getTime()
    );
};

type OwingFile = Awaited<ReturnType<typeof listOwingFiles>>[number];

export const owingFileToJson = ({ file, summary }: OwingFile) => ({
  id: file.id,
  numero: file.numero,
  anio: file.anio,
  destino: file.destino,
  fechaSalida: file.fechaSalida,
  pasajero: file.clients[0] ?? null,
  // Everyone in the file (to choose who paid)
  pasajeros: file.clients,
  moneda: summary.moneda,
  total: summary.total,
  cobrado: summary.cobrado,
  falta: summary.falta,
  estado: summary.estado,
  proximoVencimiento: summary.proximoVencimiento,
});

export const getCobranzas = async (req: Request, res: Response) => {
  try {
    const { page, skip, terms } = getPaginationParams(req);
    const owing = await listOwingFiles(terms);

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

    const data = selected.slice(skip, skip + PAGE_SIZE).map(owingFileToJson);

    res.json({
      ...buildPage(data, selected.length, page),
      counts: Object.fromEntries(Object.entries(filters).map(([k, v]) => [k, v.length])),
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener las cobranzas", error });
    console.log(error);
  }
};
