import { prisma } from "../db/index";
import { Request, Response } from "express";
import { listOwingFiles, owingFileToJson } from "./paymentsController";
import { listPendingSupplierServices } from "./supplierPaymentsController";

// Home page: what needs attention today, in one request

const DAY_MS = 24 * 60 * 60 * 1000;
const UPCOMING_DEPARTURES_DAYS = 15;
const LIQUIDATION_DAYS = 30;
// Documents expiring in the next 6 months
const DOCUMENTS_DAYS = 183;
// Trips checked for expired documents (or expiring before departure)
const DOCUMENTS_TRIPS_DAYS = 90;
const MAX_ITEMS = 8;

const startOfDay = (date: Date = new Date()) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const daysUntil = (date: Date, today: Date) => Math.round((startOfDay(date).getTime() - today.getTime()) / DAY_MS);

const fileRef = { id: true, numero: true, anio: true, destino: true, fechaSalida: true } as const;

export const getHome = async (req: Request, res: Response) => {
  const today = startOfDay();

  try {
    const [departures, owing, supplierPending, unsettled, expiringPax, tripsForDocuments] = await Promise.all([
      prisma.file.findMany({
        where: { fechaSalida: { gte: today, lt: addDays(today, UPCOMING_DEPARTURES_DAYS + 1) } },
        select: {
          ...fileRef,
          clients: { select: { firstname: true, lastname: true } },
          services: { where: { deleted_at: null }, select: { liquidado: true } },
        },
        orderBy: { fechaSalida: "asc" },
      }),
      listOwingFiles(),
      listPendingSupplierServices(),
      prisma.service.findMany({
        where: {
          deleted_at: null,
          liquidado: false,
          File: { some: { fechaSalida: { gte: today, lt: addDays(today, LIQUIDATION_DAYS + 1) } } },
        },
        select: { id: true, nombre: true, type: true, provider: true, File: { select: fileRef, take: 1 } },
      }),
      prisma.pax.findMany({
        where: {
          OR: [
            { dniVto: { gte: today, lt: addDays(today, DOCUMENTS_DAYS) } },
            { passportVto: { gte: today, lt: addDays(today, DOCUMENTS_DAYS) } },
          ],
        },
        select: { id: true, firstname: true, lastname: true, dniVto: true, passportVto: true },
      }),
      prisma.file.findMany({
        where: { fechaSalida: { gte: today, lt: addDays(today, DOCUMENTS_TRIPS_DAYS) } },
        // Closest trip first: a document problem is reported for the earliest trip it affects
        orderBy: { fechaSalida: "asc" },
        select: {
          ...fileRef,
          clients: { select: { id: true, firstname: true, lastname: true, dniVto: true, passportVto: true } },
        },
      }),
    ]);

    // Client collections: overdue or due within a week
    const urgentOwing = owing.filter((o) => o.summary.proximoVencimiento!.diasParaVencer <= 7);

    // Wholesaler payments: the next ones coming (overdue first), one line per file and
    // wholesaler, like in Pagos. supplierPending is already sorted by due date
    const supplierGroups = new Map<
      string,
      {
        id: string;
        mayorista: string;
        currency: string;
        falta: number;
        servicios: number;
        diasParaVencer: number | null;
        vencimiento: Date | null;
        file: (typeof supplierPending)[number]["file"];
      }
    >();
    for (const s of supplierPending) {
      const key = `${s.file?.id}|${s.provider.trim()}|${s.currency}`;
      const group = supplierGroups.get(key) ?? {
        id: key,
        mayorista: s.provider.trim(),
        currency: s.currency,
        falta: 0,
        servicios: 0,
        diasParaVencer: s.diasParaVencer,
        vencimiento: s.vencimiento,
        file: s.file,
      };
      group.falta = Math.round((group.falta + s.falta) * 100) / 100;
      group.servicios += 1;
      supplierGroups.set(key, group);
    }
    const nextSupplierPayments = [...supplierGroups.values()].slice(0, MAX_ITEMS);

    // Documents: expiring in the next 6 months, and problems for upcoming trips
    const documents: {
      paxId: string;
      pasajero: string;
      documento: string;
      vencimiento: Date;
      diasParaVencer: number;
      problema: string | null;
    }[] = [];
    const seen = new Set<string>();

    for (const trip of tripsForDocuments) {
      for (const pax of trip.clients) {
        for (const [documento, expiry] of [["DNI", pax.dniVto], ["Pasaporte", pax.passportVto]] as const) {
          if (!expiry || expiry >= trip.fechaSalida) continue;
          const key = `${pax.id}-${documento}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const days = daysUntil(expiry, today);
          documents.push({
            paxId: pax.id,
            pasajero: `${pax.lastname} ${pax.firstname}`,
            documento,
            vencimiento: expiry,
            diasParaVencer: days,
            problema: `${days < 0 ? "Vencido para el viaje" : "Vence antes del viaje"} a ${trip.destino} (${trip.fechaSalida.toLocaleDateString("es-AR")})`,
          });
        }
      }
    }
    for (const pax of expiringPax) {
      for (const [documento, expiry] of [["DNI", pax.dniVto], ["Pasaporte", pax.passportVto]] as const) {
        if (!expiry || expiry < today || expiry >= addDays(today, DOCUMENTS_DAYS)) continue;
        const key = `${pax.id}-${documento}`;
        if (seen.has(key)) continue;
        seen.add(key);
        documents.push({
          paxId: pax.id,
          pasajero: `${pax.lastname} ${pax.firstname}`,
          documento,
          vencimiento: expiry,
          diasParaVencer: daysUntil(expiry, today),
          problema: null,
        });
      }
    }
    // Trip problems first, then by expiry date
    documents.sort((a, b) => Number(!!b.problema) - Number(!!a.problema) || a.vencimiento.getTime() - b.vencimiento.getTime());

    const unsettledSorted = unsettled
      .filter((s) => s.File[0])
      .map((s) => ({
        id: s.id,
        nombre: s.nombre,
        type: s.type,
        provider: s.provider,
        file: s.File[0],
        diasParaSalida: daysUntil(s.File[0].fechaSalida, today),
      }))
      .sort((a, b) => a.diasParaSalida - b.diasParaSalida);

    res.json({
      proximasSalidas: departures.map(({ clients, services, ...file }) => ({
        ...file,
        diasParaSalida: daysUntil(file.fechaSalida, today),
        pasajeros: clients.length,
        primerPasajero: clients[0] ?? null,
        sinLiquidar: services.filter((s) => !s.liquidado).length,
      })),
      cobros: {
        vencidos: owing.filter((o) => o.summary.estado === "VENCIDO").length,
        semana: owing.filter((o) => {
          const days = o.summary.proximoVencimiento!.diasParaVencer;
          return days >= 0 && days <= 7;
        }).length,
        items: urgentOwing.slice(0, MAX_ITEMS).map(owingFileToJson),
      },
      mayoristas: {
        vencidos: supplierPending.filter((s) => s.diasParaVencer !== null && s.diasParaVencer < 0).length,
        semana: supplierPending.filter((s) => s.diasParaVencer !== null && s.diasParaVencer >= 0 && s.diasParaVencer <= 7).length,
        // Próximos pagos (no solo los urgentes); total = cuántos hay en total
        items: nextSupplierPayments,
        total: supplierGroups.size,
      },
      sinLiquidar: { total: unsettledSorted.length, items: unsettledSorted.slice(0, MAX_ITEMS) },
      documentos: { total: documents.length, items: documents.slice(0, MAX_ITEMS) },
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al armar el inicio", error });
    console.log(error);
  }
};
