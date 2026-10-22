import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Currency, PaymentMethod, Prisma } from "@prisma/client";
import { buildPage, getDateRange, getPaginationParams } from "../utils/pagination";
import { fileNumberConditions } from "../utils/fileNumber";

// Payments the agency makes to wholesalers. Each service's net price (precioNeto) is what
// has to be paid; a payment can be split among services of several files.

// Supplier due date: flights at issuance (file creation), the rest this many days before departure
const SUPPLIER_DAYS_BEFORE_DEPARTURE = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round(n * 100) / 100;
const startOfDay = (date: Date = new Date()) => {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
};

const fileSelect = {
  id: true,
  numero: true,
  anio: true,
  destino: true,
  fechaSalida: true,
  createdAt: true,
  clients: { select: { firstname: true, lastname: true }, take: 1 },
} satisfies Prisma.FileSelect;

const serviceInclude = {
  pagosMayorista: { select: { importe: true } },
  File: { select: fileSelect, take: 1 },
} satisfies Prisma.ServiceInclude;

type ServiceWithPayments = Prisma.ServiceGetPayload<{ include: typeof serviceInclude }>;

// Net price, paid and pending of a service, plus when it should be paid
export const supplierStatus = (service: ServiceWithPayments) => {
  const neto = round2(Number(service.precioNeto) || 0);
  const pagado = round2(service.pagosMayorista.reduce((sum, p) => sum + Number(p.importe), 0));
  const file = service.File[0];
  const vencimiento = file
    ? service.type === "AEREO"
      ? file.createdAt
      : new Date(file.fechaSalida.getTime() - SUPPLIER_DAYS_BEFORE_DEPARTURE * DAY_MS)
    : null;
  return {
    id: service.id,
    nombre: service.nombre,
    type: service.type,
    provider: service.provider,
    currency: service.currency,
    fechaInicio: service.fechaInicio,
    neto,
    pagado,
    falta: round2(Math.max(neto - pagado, 0)),
    vencimiento,
    diasParaVencer: vencimiento
      ? Math.round((startOfDay(vencimiento).getTime() - startOfDay().getTime()) / DAY_MS)
      : null,
    file: file
      ? {
          id: file.id,
          numero: file.numero,
          anio: file.anio,
          destino: file.destino,
          fechaSalida: file.fechaSalida,
          pasajero: file.clients[0] ?? null,
        }
      : null,
  };
};

// Search terms against pax name, destination, file number or wholesaler
const fileSearch = (term: string): Prisma.FileWhereInput => ({
  OR: [
    { destino: { contains: term } },
    ...fileNumberConditions(term),
    {
      clients: {
        some: { OR: [{ firstname: { contains: term } }, { lastname: { contains: term } }] },
      },
    },
  ],
});

// GET /mayoristas/servicios?search= — files found by pax / file number / destination, with
// their services and what is pending to pay (to choose what a payment covers)
export const searchServicesToPay = async (req: Request, res: Response) => {
  const { terms } = getPaginationParams(req);
  if (terms.length === 0) return res.json({ data: [] });

  try {
    const files = await prisma.file.findMany({
      where: { AND: terms.map(fileSearch) },
      select: {
        ...fileSelect,
        services: { where: { deleted_at: null }, include: serviceInclude },
      },
      orderBy: { fechaSalida: "desc" },
      take: 10,
    });

    res.json({
      data: files.map(({ services, clients, ...file }) => ({
        ...file,
        pasajero: clients[0] ?? null,
        services: services.map(supplierStatus),
      })),
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al buscar servicios", error });
    console.log(error);
  }
};

// GET /mayoristas/pendientes?page=&search= — services not fully paid to the wholesaler,
// by due date. Search also matches the wholesaler name
// Services not fully paid to the wholesaler, by due date. Also used by the home page
export const listPendingSupplierServices = async (terms: string[] = []) => {
  const services = await prisma.service.findMany({
    where: {
      deleted_at: null,
      File: { some: {} },
      AND: terms.map((term) => ({
        OR: [{ provider: { contains: term } }, { nombre: { contains: term } }, { File: { some: fileSearch(term) } }],
      })),
    },
    include: serviceInclude,
  });

  return services
    .map(supplierStatus)
    .filter((s) => s.falta > 0)
    .sort((a, b) => (a.vencimiento?.getTime() ?? 0) - (b.vencimiento?.getTime() ?? 0));
};

export const getPendingSupplierPayments = async (req: Request, res: Response) => {
  try {
    const { page, skip, take, terms } = getPaginationParams(req);
    const pending = await listPendingSupplierServices(terms);

    // Pending totals per currency (of everything found, not only this page)
    const totals: Record<string, number> = {};
    for (const s of pending) totals[s.currency] = round2((totals[s.currency] ?? 0) + s.falta);

    // One row per file, with what is pending grouped by wholesaler (and currency).
    // `pending` is sorted by due date, so each file keeps its earliest due date
    const byFile = new Map<
      string,
      {
        file: NonNullable<(typeof pending)[number]["file"]>;
        vencimiento: Date | null;
        diasParaVencer: number | null;
        mayoristas: Map<string, { mayorista: string; currency: string; falta: number; servicios: { id: string; nombre: string; type: string; falta: number }[] }>;
      }
    >();
    for (const s of pending) {
      if (!s.file) continue;
      const row = byFile.get(s.file.id) ?? {
        file: s.file,
        vencimiento: s.vencimiento,
        diasParaVencer: s.diasParaVencer,
        mayoristas: new Map(),
      };
      const key = `${s.provider.trim()}|${s.currency}`;
      const group = row.mayoristas.get(key) ?? { mayorista: s.provider.trim(), currency: s.currency, falta: 0, servicios: [] };
      group.falta = round2(group.falta + s.falta);
      group.servicios.push({ id: s.id, nombre: s.nombre, type: s.type, falta: s.falta });
      row.mayoristas.set(key, group);
      byFile.set(s.file.id, row);
    }
    const rows = [...byFile.values()].map((row) => ({ ...row, mayoristas: [...row.mayoristas.values()] }));

    res.json({ ...buildPage(rows.slice(skip, skip + take), rows.length, page), totals });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener lo pendiente de pago", error });
    console.log(error);
  }
};

// POST /mayoristas/pagos { fecha, medio, mayorista?, nota?, aplicaciones: [{ serviceId, importe }] }
export const addSupplierPayment = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  const fecha = new Date(String(body.fecha));
  const medio = body.medio as PaymentMethod;
  const aplicaciones: { serviceId: string; importe: number }[] = Array.isArray(body.aplicaciones)
    ? body.aplicaciones.map((a: Record<string, unknown>) => ({
        serviceId: String(a.serviceId),
        importe: round2(Number(a.importe)),
      }))
    : [];

  if (isNaN(fecha.getTime())) return res.status(400).json({ msg: "Falta la fecha del pago." });
  if (!Object.values(PaymentMethod).includes(medio)) return res.status(400).json({ msg: "Medio de pago inválido." });
  if (aplicaciones.length === 0) return res.status(400).json({ msg: "Elegí al menos un servicio." });
  if (aplicaciones.some((a) => !(a.importe > 0))) {
    return res.status(400).json({ msg: "Cada servicio necesita un importe mayor a cero." });
  }

  try {
    const services = await prisma.service.findMany({
      where: { id: { in: aplicaciones.map((a) => a.serviceId) }, deleted_at: null },
      include: serviceInclude,
    });
    if (services.length !== new Set(aplicaciones.map((a) => a.serviceId)).size) {
      return res.status(400).json({ msg: "Alguno de los servicios no existe." });
    }

    const currencies = [...new Set(services.map((s) => s.currency))];
    if (currencies.length > 1) {
      return res.status(400).json({ msg: "Un pago es en una sola moneda: elegí servicios de la misma moneda." });
    }

    // No paying more than what is pending of each service (avoids typos)
    for (const a of aplicaciones) {
      const status = supplierStatus(services.find((s) => s.id === a.serviceId)!);
      if (a.importe > status.falta + 0.01) {
        return res.status(400).json({
          msg: `"${status.nombre}" tiene pendiente ${status.falta}: no se puede pagar ${a.importe}.`,
        });
      }
    }

    const mayorista =
      String(body.mayorista ?? "").trim() || [...new Set(services.map((s) => s.provider.trim()))].join(" / ");

    const pago = await prisma.pagoMayorista.create({
      data: {
        fecha,
        medio,
        mayorista,
        moneda: currencies[0] as Currency,
        importe: round2(aplicaciones.reduce((sum, a) => sum + a.importe, 0)),
        nota: String(body.nota ?? "").trim().slice(0, 300) || null,
        aplicaciones: { create: aplicaciones },
      },
    });
    res.json({ msg: "Pago registrado", id: pago.id });
  } catch (error) {
    res.status(500).json({ msg: "Error al registrar el pago al mayorista", error });
    console.log(error);
  }
};

// GET /mayoristas/pagos?page=&search=&desde=&hasta= — payments made, latest first;
// optional date range (both days included). totals: amount paid per currency
export const getSupplierPayments = async (req: Request, res: Response) => {
  try {
    const { page, skip, take, terms } = getPaginationParams(req);
    const where: Prisma.PagoMayoristaWhereInput = {
      fecha: getDateRange(req),
      AND: terms.map((term) => ({
        OR: [
          { mayorista: { contains: term } },
          { nota: { contains: term } },
          { aplicaciones: { some: { service: { File: { some: fileSearch(term) } } } } },
        ],
      })),
    };

    const [pagos, total] = await prisma.$transaction([
      prisma.pagoMayorista.findMany({
        where,
        include: {
          aplicaciones: {
            include: {
              service: {
                select: {
                  nombre: true,
                  type: true,
                  File: { select: { id: true, numero: true, anio: true, destino: true }, take: 1 },
                },
              },
            },
          },
        },
        orderBy: [{ fecha: "desc" }, { createdAt: "desc" }],
        skip,
        take,
      }),
      prisma.pagoMayorista.count({ where }),
    ]);
    // Amount paid per currency of everything found (not only this page)
    const groups = await prisma.pagoMayorista.groupBy({ by: ["moneda"], where, _sum: { importe: true } });
    const totals = Object.fromEntries(groups.map((g) => [g.moneda, Number(g._sum.importe ?? 0)]));

    res.json({
      ...buildPage(
        pagos.map((p) => ({
          ...p,
          importe: Number(p.importe),
          aplicaciones: p.aplicaciones.map((a) => ({
            id: a.id,
            importe: Number(a.importe),
            servicio: a.service.nombre,
            type: a.service.type,
            file: a.service.File[0] ?? null,
          })),
        })),
        total,
        page
      ),
      totals,
    });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener los pagos a mayoristas", error });
    console.log(error);
  }
};

// DELETE /mayoristas/pagos/:id — e.g. loaded by mistake (its parts are deleted with it)
export const deleteSupplierPayment = async (req: Request, res: Response) => {
  try {
    const result = await prisma.pagoMayorista.deleteMany({ where: { id: req.params.id } });
    if (result.count === 0) return res.status(404).json({ msg: "Pago no encontrado" });
    res.json({ msg: "Pago eliminado" });
  } catch (error) {
    res.status(500).json({ msg: "Error al eliminar el pago", error });
    console.log(error);
  }
};
