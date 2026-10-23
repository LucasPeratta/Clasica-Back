import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Currency, HabitacionTipo, Prisma, ServiceType } from "@prisma/client";
import { buildPage, getPaginationParams } from "../utils/pagination";
import { filePaymentsInclude, getPaymentsSummary, GroupPlanInstallment, PaymentsStatus } from "../utils/payments";
import { parseLiquidationDate } from "../utils/liquidation";
import { MAX_PDFS, deletePdf, getOriginalName, getPdfDownloadUrl, uploadPdf } from "../utils/pdfStorage";

// Group departures: a trip sold per person. Each reservation (a family, a couple...) is a File
// of the group, with its own prices, payments, receipts and invoice.

const round2 = (n: number) => Math.round(n * 100) / 100;
// A group stays among the "current" ones until this many days after departure (like files)
const ACTIVE_DAYS = 30;
const ROOM_SIZE: Record<HabitacionTipo, number> = { SINGLE: 1, DOBLE: 2, TRIPLE: 3, CUADRUPLE: 4 };
const STATUS_PRIORITY: PaymentsStatus[] = ["VENCIDO", "POR_VENCER", "AL_DIA", "PAGADO", "SIN_PLAN"];

class GroupError extends Error {}

const fail = (res: Response, error: unknown, msg: string) => {
  if (error instanceof GroupError) return res.status(400).json({ msg: error.message });
  res.status(500).json({ msg, error });
  console.log(error);
};

const parseDate = (value: unknown) => {
  if (!value) return null;
  const date = new Date(String(value));
  return isNaN(date.getTime()) ? null : date;
};

// What every reservation's file shows as destination: "<group> · <reservation>"
const reservaDestino = (titulo: string, nombre: string) => `${titulo} · ${nombre}`;

const paxSelect = {
  id: true,
  firstname: true,
  lastname: true,
  dni: true,
  dniVto: true,
  passport: true,
  passportVto: true,
  dob: true,
} as const;

const reservaInclude = {
  ...filePaymentsInclude,
  clients: { select: paxSelect },
  services: {
    where: { deleted_at: null },
    select: { id: true, type: true, tarifa: true, precioNeto: true, currency: true, grupoServicioId: true },
  },
} satisfies Prisma.FileInclude;

type Reserva = Prisma.FileGetPayload<{ include: typeof reservaInclude }>;

// Money of the group per currency: sold (tarifa), cost (neto), collected and pending
const groupMoney = (reservas: Reserva[]) => {
  const byCurrency = new Map<string, { moneda: string; total: number; neto: number; cobrado: number; falta: number }>();
  const entry = (moneda: string) => {
    const e = byCurrency.get(moneda) ?? { moneda, total: 0, neto: 0, cobrado: 0, falta: 0 };
    byCurrency.set(moneda, e);
    return e;
  };
  for (const r of reservas) {
    for (const p of getPaymentsSummary(r).porMoneda) {
      if (!p.moneda) continue;
      const e = entry(p.moneda);
      e.total = round2(e.total + p.total);
      e.cobrado = round2(e.cobrado + p.cobrado);
      e.falta = round2(e.falta + p.falta);
    }
    for (const s of r.services) {
      const e = entry(s.currency);
      e.neto = round2(e.neto + (Number(s.precioNeto) || 0));
    }
  }
  return [...byCurrency.values()].map((e) => ({ ...e, ganancia: round2(e.total - e.neto) }));
};

const reservaToJson = (r: Reserva) => {
  const summary = getPaymentsSummary(r);
  return {
    id: r.id,
    nombre: r.reservaNombre,
    planId: r.grupoPlanId,
    pasajeros: r.clients,
    servicios: r.services.length,
    estado: summary.estado,
    proximoVencimiento: summary.proximoVencimiento,
    porMoneda: summary.porMoneda.map((p) => ({ moneda: p.moneda, total: p.total, cobrado: p.cobrado, falta: p.falta })),
    facturado: !!r.facturadoAt,
  };
};

const uniquePax = (reservas: Reserva[]) => new Set(reservas.flatMap((r) => r.clients.map((c) => c.id))).size;

/* ---------- Groups ---------- */

// GET /grupos?page=&search=&status=current|finished
export const getGroups = async (req: Request, res: Response) => {
  try {
    const { page, skip, take, terms } = getPaginationParams(req);
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - ACTIVE_DAYS);
    const search: Prisma.GrupoWhereInput = {
      AND: terms.map((term) => ({
        OR: [
          { titulo: { contains: term } },
          { destino: { contains: term } },
          { reservas: { some: { clients: { some: { OR: [{ firstname: { contains: term } }, { lastname: { contains: term } }] } } } } },
        ],
      })),
    };
    const finished = req.query.status === "finished";
    const where: Prisma.GrupoWhereInput = { ...search, fechaSalida: finished ? { lt: cutoff } : { gte: cutoff } };

    const [grupos, total, currentCount, finishedCount] = await prisma.$transaction([
      prisma.grupo.findMany({
        where,
        include: { reservas: { include: reservaInclude } },
        orderBy: { fechaSalida: finished ? "desc" : "asc" },
        skip,
        take,
      }),
      prisma.grupo.count({ where }),
      prisma.grupo.count({ where: { ...search, fechaSalida: { gte: cutoff } } }),
      prisma.grupo.count({ where: { ...search, fechaSalida: { lt: cutoff } } }),
    ]);

    res.json({
      ...buildPage(
        grupos.map(({ reservas, ...g }) => {
          const estados = reservas.map((r) => getPaymentsSummary(r).estado);
          return {
            ...g,
            reservas: reservas.length,
            pasajeros: uniquePax(reservas),
            dinero: groupMoney(reservas),
            estado: STATUS_PRIORITY.find((s) => estados.includes(s)) ?? "SIN_PLAN",
          };
        }),
        total,
        page
      ),
      counts: { current: currentCount, finished: finishedCount },
    });
  } catch (error) {
    fail(res, error, "Error al obtener las salidas grupales");
  }
};

const groupData = (body: Record<string, unknown>) => {
  const titulo = String(body.titulo ?? "").trim();
  const destino = String(body.destino ?? "").trim();
  const fechaSalida = parseDate(body.fechaSalida);
  const fechaRegreso = parseDate(body.fechaRegreso);
  const cupo = body.cupo === null || body.cupo === undefined || body.cupo === "" ? null : Math.round(Number(body.cupo));
  if (!titulo) throw new GroupError("Falta el nombre de la salida.");
  if (!destino) throw new GroupError("Falta el destino.");
  if (!fechaSalida) throw new GroupError("Falta la fecha de salida.");
  if (fechaRegreso && fechaRegreso < fechaSalida) throw new GroupError("El regreso es anterior a la salida.");
  if (cupo !== null && !(cupo > 0)) throw new GroupError("El cupo tiene que ser un número mayor a cero.");
  return { titulo, destino, fechaSalida, fechaRegreso, cupo, obs: String(body.obs ?? "").trim().slice(0, 500) || null };
};

// POST /grupos
export const addGroup = async (req: Request, res: Response) => {
  try {
    const grupo = await prisma.grupo.create({ data: groupData(req.body ?? {}) });
    res.json({ msg: "Salida grupal creada", id: grupo.id });
  } catch (error) {
    fail(res, error, "Error al crear la salida grupal");
  }
};

// GET /grupos/:id — the group with its services, plans, reservations and rooming
export const getGroup = async (req: Request, res: Response) => {
  try {
    const grupo = await prisma.grupo.findUnique({
      where: { id: req.params.id },
      include: {
        servicios: { orderBy: [{ fechaInicio: "asc" }, { createdAt: "asc" }] },
        planes: { orderBy: { createdAt: "asc" } },
        habitaciones: { include: { pasajeros: { select: paxSelect } }, orderBy: { createdAt: "asc" } },
        reservas: { include: reservaInclude, orderBy: { createdAt: "asc" } },
      },
    });
    if (!grupo) return res.status(404).json({ msg: "Salida grupal no encontrada" });

    const { reservas, habitaciones, servicios, ...rest } = grupo;
    const pasajeros = reservas.flatMap((r) => r.clients.map((c) => ({ ...c, reservaId: r.id, reserva: r.reservaNombre })));
    const enHabitacion = new Set(habitaciones.flatMap((h) => h.pasajeros.map((p) => p.id)));
    res.json({
      data: {
        ...rest,
        servicios: servicios.map((s) => ({ ...s, netoPorPax: Number(s.netoPorPax), tarifaPorPax: Number(s.tarifaPorPax) })),
        reservas: reservas.map(reservaToJson),
        habitaciones,
        pasajeros,
        sinHabitacion: pasajeros.filter((p) => !enHabitacion.has(p.id)),
        resumen: {
          reservas: reservas.length,
          pasajeros: uniquePax(reservas),
          lugaresLibres: grupo.cupo === null ? null : grupo.cupo - uniquePax(reservas),
          dinero: groupMoney(reservas),
        },
      },
    });
  } catch (error) {
    fail(res, error, "Error al obtener la salida grupal");
  }
};

// PUT /grupos/:id — reservations follow the group's name, destination and departure
export const updateGroup = async (req: Request, res: Response) => {
  try {
    const data = groupData(req.body ?? {});
    const grupo = await prisma.grupo.findUnique({ where: { id: req.params.id }, include: { reservas: { select: { id: true, reservaNombre: true } } } });
    if (!grupo) return res.status(404).json({ msg: "Salida grupal no encontrada" });
    await prisma.$transaction([
      prisma.grupo.update({ where: { id: grupo.id }, data }),
      ...grupo.reservas.map((r) =>
        prisma.file.update({
          where: { id: r.id },
          data: { destino: reservaDestino(data.titulo, r.reservaNombre ?? ""), fechaSalida: data.fechaSalida },
        })
      ),
    ]);
    res.json({ msg: "Salida grupal actualizada" });
  } catch (error) {
    fail(res, error, "Error al actualizar la salida grupal");
  }
};

// DELETE /grupos/:id — only without reservations (those have their own rules: payments, invoices)
export const deleteGroup = async (req: Request, res: Response) => {
  try {
    const grupo = await prisma.grupo.findUnique({ where: { id: req.params.id }, include: { _count: { select: { reservas: true } }, pdfs: true } });
    if (!grupo) return res.status(404).json({ msg: "Salida grupal no encontrada" });
    if (grupo._count.reservas > 0) {
      return res.status(400).json({ msg: "La salida tiene reservas: primero hay que eliminarlas (las que no tienen pagos)." });
    }
    await Promise.all(grupo.pdfs.map((pdf) => deletePdf(pdf.filename)));
    await prisma.grupo.delete({ where: { id: grupo.id } });
    res.json({ msg: "Salida grupal eliminada" });
  } catch (error) {
    fail(res, error, "Error al eliminar la salida grupal");
  }
};

/* ---------- Group services (itinerary with list prices per passenger) ---------- */

const serviceData = (body: Record<string, unknown>) => {
  const nombre = String(body.nombre ?? "").trim();
  const provider = String(body.provider ?? "").trim();
  const type = body.type as ServiceType;
  const currency = body.currency as Currency;
  const netoPorPax = round2(Number(body.netoPorPax));
  const tarifaPorPax = round2(Number(body.tarifaPorPax));
  if (!Object.values(ServiceType).includes(type)) throw new GroupError("Tipo de servicio inválido.");
  if (!Object.values(Currency).includes(currency)) throw new GroupError("Moneda inválida.");
  if (!provider) throw new GroupError("Falta el mayorista del servicio.");
  if (!(netoPorPax >= 0) || !(tarifaPorPax >= 0)) throw new GroupError("Los precios por pasajero tienen que ser números.");
  return {
    type,
    nombre: nombre || "Servicio",
    provider,
    currency,
    netoPorPax,
    tarifaPorPax,
    fechaInicio: parseDate(body.fechaInicio),
    fechaFin: parseDate(body.fechaFin),
    // Flights are paid when issued: no settlement date
    fechaLiquidacion: type === "AEREO" ? null : parseLiquidationDate(body.fechaLiquidacion),
  };
};

// A reservation line copied from a group service, for that many passengers
const lineFromService = (
  s: { id: string; type: ServiceType; nombre: string; provider: string; currency: Currency; fechaInicio: Date | null; fechaFin: Date | null; fechaLiquidacion: Date | null },
  neto: number,
  tarifa: number
) => ({
  type: s.type,
  nombre: s.nombre,
  provider: s.provider,
  currency: s.currency,
  precioNeto: String(round2(neto)),
  tarifa: String(round2(tarifa)),
  fechaInicio: s.fechaInicio,
  fechaFin: s.fechaFin,
  fechaLiquidacion: s.fechaLiquidacion,
  obs: "",
  grupoServicioId: s.id,
});

// POST /grupos/:id/servicios { ..., aplicarAReservas } — optionally added to the existing
// reservations at the list price
export const addGroupService = async (req: Request, res: Response) => {
  try {
    const data = serviceData(req.body ?? {});
    const grupo = await prisma.grupo.findUnique({ where: { id: req.params.id }, include: { reservas: { include: { clients: { select: { id: true } } } } } });
    if (!grupo) return res.status(404).json({ msg: "Salida grupal no encontrada" });
    const servicio = await prisma.grupoServicio.create({ data: { ...data, grupoId: grupo.id } });
    if (req.body?.aplicarAReservas) {
      for (const r of grupo.reservas) {
        const pax = Math.max(r.clients.length, 1);
        await prisma.file.update({
          where: { id: r.id },
          data: { services: { create: [lineFromService(servicio, data.netoPorPax * pax, data.tarifaPorPax * pax)] } },
        });
      }
    }
    res.json({ msg: "Servicio agregado", id: servicio.id });
  } catch (error) {
    fail(res, error, "Error al agregar el servicio");
  }
};

// PUT /grupos/:id/servicios/:servicioId — the list price is for new reservations; the name,
// wholesaler and dates also change in the reservations that already have it
export const updateGroupService = async (req: Request, res: Response) => {
  try {
    const data = serviceData(req.body ?? {});
    const servicio = await prisma.grupoServicio.findFirst({ where: { id: req.params.servicioId, grupoId: req.params.id } });
    if (!servicio) return res.status(404).json({ msg: "Servicio no encontrado" });
    if (data.currency !== servicio.currency && (await prisma.service.count({ where: { grupoServicioId: servicio.id, deleted_at: null } })) > 0) {
      throw new GroupError("Las reservas ya tienen este servicio: no se le puede cambiar la moneda.");
    }
    await prisma.$transaction([
      prisma.grupoServicio.update({ where: { id: servicio.id }, data }),
      prisma.service.updateMany({
        where: { grupoServicioId: servicio.id, deleted_at: null },
        data: {
          type: data.type,
          nombre: data.nombre,
          provider: data.provider,
          fechaInicio: data.fechaInicio,
          fechaFin: data.fechaFin,
          fechaLiquidacion: data.fechaLiquidacion,
        },
      }),
    ]);
    res.json({ msg: "Servicio actualizado" });
  } catch (error) {
    fail(res, error, "Error al actualizar el servicio");
  }
};

// DELETE /grupos/:id/servicios/:servicioId — only if no reservation has it
export const deleteGroupService = async (req: Request, res: Response) => {
  try {
    const servicio = await prisma.grupoServicio.findFirst({ where: { id: req.params.servicioId, grupoId: req.params.id } });
    if (!servicio) return res.status(404).json({ msg: "Servicio no encontrado" });
    const inUse = await prisma.service.count({ where: { grupoServicioId: servicio.id, deleted_at: null } });
    if (inUse > 0) {
      throw new GroupError(`${inUse === 1 ? "Una reserva tiene" : `${inUse} reservas tienen`} este servicio: sacalo primero de cada reserva.`);
    }
    await prisma.grupoServicio.delete({ where: { id: servicio.id } });
    res.json({ msg: "Servicio eliminado" });
  } catch (error) {
    fail(res, error, "Error al eliminar el servicio");
  }
};

/* ---------- Reservations ---------- */

// POST /grupos/:id/reservas { nombre, paxIds, planId?, lineas?: [{ grupoServicioId, neto, tarifa }] }
// Without lineas, every group service at its list price per passenger
export const addReservation = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  try {
    const nombre = String(body.nombre ?? "").trim();
    const paxIds: string[] = Array.isArray(body.paxIds) ? body.paxIds.map(String) : [];
    if (!nombre) throw new GroupError("Falta el nombre de la reserva (ej. Montero x2).");
    if (paxIds.length === 0) throw new GroupError("Elegí al menos un pasajero.");

    const grupo = await prisma.grupo.findUnique({
      where: { id: req.params.id },
      include: { servicios: true, planes: { select: { id: true } }, reservas: { select: { clients: { select: { id: true, firstname: true, lastname: true } } } } },
    });
    if (!grupo) return res.status(404).json({ msg: "Salida grupal no encontrada" });

    // Someone can't be in two reservations of the same group
    const already = grupo.reservas.flatMap((r) => r.clients).find((c) => paxIds.includes(c.id));
    if (already) throw new GroupError(`${already.firstname} ${already.lastname} ya está en otra reserva de esta salida.`);
    const planId = body.planId ? String(body.planId) : null;
    if (planId && !grupo.planes.some((p) => p.id === planId)) throw new GroupError("El plan de pagos no es de esta salida.");

    const lineas: { grupoServicioId: string; neto: number; tarifa: number }[] = Array.isArray(body.lineas)
      ? body.lineas.map((l: Record<string, unknown>) => ({ grupoServicioId: String(l.grupoServicioId), neto: Number(l.neto), tarifa: Number(l.tarifa) }))
      : grupo.servicios.map((s) => ({
          grupoServicioId: s.id,
          neto: Number(s.netoPorPax) * paxIds.length,
          tarifa: Number(s.tarifaPorPax) * paxIds.length,
        }));
    const services = lineas.map((l) => {
      const servicio = grupo.servicios.find((s) => s.id === l.grupoServicioId);
      if (!servicio) throw new GroupError("Uno de los servicios no es de esta salida.");
      if (!(l.neto >= 0) || !(l.tarifa >= 0)) throw new GroupError(`Revisá los precios de "${servicio.nombre}".`);
      return lineFromService(servicio, l.neto, l.tarifa);
    });

    const file = await prisma.file.create({
      data: {
        destino: reservaDestino(grupo.titulo, nombre),
        fechaSalida: grupo.fechaSalida,
        precioNetoTotal: "0",
        tarifaTotal: "0",
        obs: "",
        grupoId: grupo.id,
        reservaNombre: nombre,
        grupoPlanId: planId,
        clients: { connect: paxIds.map((id) => ({ id })) },
        services: { create: services },
      },
    });
    res.json({ msg: "Reserva agregada", id: file.id });
  } catch (error) {
    fail(res, error, "Error al agregar la reserva");
  }
};

// PUT /grupos/:id/reservas/:fileId { nombre?, planId? }
export const updateReservation = async (req: Request, res: Response) => {
  const body = req.body ?? {};
  try {
    const reserva = await prisma.file.findFirst({ where: { id: req.params.fileId, grupoId: req.params.id }, include: { grupo: { include: { planes: { select: { id: true } } } } } });
    if (!reserva || !reserva.grupo) return res.status(404).json({ msg: "Reserva no encontrada" });
    const data: Prisma.FileUpdateInput = {};
    if (body.nombre !== undefined) {
      const nombre = String(body.nombre).trim();
      if (!nombre) throw new GroupError("Falta el nombre de la reserva.");
      data.reservaNombre = nombre;
      data.destino = reservaDestino(reserva.grupo.titulo, nombre);
    }
    if (body.planId !== undefined) {
      const planId = body.planId ? String(body.planId) : null;
      if (planId && !reserva.grupo.planes.some((p) => p.id === planId)) throw new GroupError("El plan de pagos no es de esta salida.");
      data.grupoPlan = planId ? { connect: { id: planId } } : { disconnect: true };
    }
    await prisma.file.update({ where: { id: reserva.id }, data });
    res.json({ msg: "Reserva actualizada" });
  } catch (error) {
    fail(res, error, "Error al actualizar la reserva");
  }
};

/* ---------- Payment plans ---------- */

const planData = (body: Record<string, unknown>) => {
  const nombre = String(body.nombre ?? "").trim();
  if (!nombre) throw new GroupError("Falta el nombre del plan (ej. Preventa).");
  const raw: Record<string, unknown>[] = Array.isArray(body.cuotas) ? body.cuotas : [];
  if (raw.length === 0) throw new GroupError("El plan necesita al menos una cuota.");
  const cuotas: GroupPlanInstallment[] = raw.map((c, i) => {
    const isLast = i === raw.length - 1;
    const vencimiento = parseDate(c.vencimiento);
    const porcentaje = isLast || c.porcentaje === null || c.porcentaje === "" ? null : round2(Number(c.porcentaje));
    if (!vencimiento) throw new GroupError(`Falta la fecha de la cuota ${i + 1}.`);
    if (porcentaje !== null && !(porcentaje > 0 && porcentaje < 100)) throw new GroupError(`El porcentaje de la cuota ${i + 1} tiene que estar entre 0 y 100.`);
    if (porcentaje === null && !isLast) throw new GroupError("Solo la última cuota puede ser el saldo.");
    return { concepto: String(c.concepto ?? "").trim() || (isLast ? "Saldo" : `Cuota ${i + 1}`), porcentaje, vencimiento: vencimiento.toISOString() };
  });
  const sum = cuotas.reduce((acc, c) => acc + (c.porcentaje ?? 0), 0);
  if (sum >= 100) throw new GroupError("Los porcentajes suman 100% o más: el saldo quedaría en cero.");
  // Stored as JSON
  return { nombre, cuotas: cuotas as unknown as Prisma.InputJsonArray };
};

// POST /grupos/:id/planes { nombre, cuotas: [{ concepto, porcentaje, vencimiento }] } (last = saldo)
export const addPlan = async (req: Request, res: Response) => {
  try {
    const data = planData(req.body ?? {});
    if (!(await prisma.grupo.findUnique({ where: { id: req.params.id }, select: { id: true } }))) {
      return res.status(404).json({ msg: "Salida grupal no encontrada" });
    }
    const plan = await prisma.grupoPlan.create({ data: { ...data, grupoId: req.params.id } });
    res.json({ msg: "Plan creado", id: plan.id });
  } catch (error) {
    fail(res, error, "Error al crear el plan");
  }
};

// PUT /grupos/:id/planes/:planId — the reservations with this plan follow the change
export const updatePlan = async (req: Request, res: Response) => {
  try {
    const data = planData(req.body ?? {});
    const result = await prisma.grupoPlan.updateMany({ where: { id: req.params.planId, grupoId: req.params.id }, data });
    if (result.count === 0) return res.status(404).json({ msg: "Plan no encontrado" });
    res.json({ msg: "Plan actualizado" });
  } catch (error) {
    fail(res, error, "Error al actualizar el plan");
  }
};

// DELETE /grupos/:id/planes/:planId — its reservations go back to the automatic plan
export const deletePlan = async (req: Request, res: Response) => {
  try {
    const result = await prisma.grupoPlan.deleteMany({ where: { id: req.params.planId, grupoId: req.params.id } });
    if (result.count === 0) return res.status(404).json({ msg: "Plan no encontrado" });
    res.json({ msg: "Plan eliminado" });
  } catch (error) {
    fail(res, error, "Error al eliminar el plan");
  }
};

/* ---------- Rooming ---------- */

// Checks a room: as many pax as the room type, all of the group, none in another room
const roomData = async (grupoId: string, body: Record<string, unknown>, roomId?: string) => {
  const tipo = body.tipo as HabitacionTipo;
  if (!Object.values(HabitacionTipo).includes(tipo)) throw new GroupError("Tipo de habitación inválido.");
  const paxIds: string[] = Array.isArray(body.paxIds) ? [...new Set(body.paxIds.map(String))] : [];
  if (paxIds.length !== ROOM_SIZE[tipo]) {
    throw new GroupError(`Una habitación ${tipo.toLowerCase()} lleva ${ROOM_SIZE[tipo]} pasajero${ROOM_SIZE[tipo] === 1 ? "" : "s"}.`);
  }
  const groupPax = await prisma.pax.count({ where: { id: { in: paxIds }, File: { some: { grupoId } } } });
  if (groupPax !== paxIds.length) throw new GroupError("Todos los pasajeros tienen que ser de esta salida.");
  const taken = await prisma.pax.findFirst({
    where: { id: { in: paxIds }, habitaciones: { some: { grupoId, ...(roomId && { id: { not: roomId } }) } } },
    select: { firstname: true, lastname: true },
  });
  if (taken) throw new GroupError(`${taken.firstname} ${taken.lastname} ya está en otra habitación.`);
  return { tipo, paxIds, obs: String(body.obs ?? "").trim().slice(0, 200) || null };
};

// POST /grupos/:id/habitaciones { tipo, paxIds, obs? }
export const addRoom = async (req: Request, res: Response) => {
  try {
    const { tipo, paxIds, obs } = await roomData(req.params.id, req.body ?? {});
    const room = await prisma.grupoHabitacion.create({
      data: { grupoId: req.params.id, tipo, obs, pasajeros: { connect: paxIds.map((id) => ({ id })) } },
    });
    res.json({ msg: "Habitación agregada", id: room.id });
  } catch (error) {
    fail(res, error, "Error al agregar la habitación");
  }
};

// PUT /grupos/:id/habitaciones/:roomId
export const updateRoom = async (req: Request, res: Response) => {
  try {
    const room = await prisma.grupoHabitacion.findFirst({ where: { id: req.params.roomId, grupoId: req.params.id } });
    if (!room) return res.status(404).json({ msg: "Habitación no encontrada" });
    const { tipo, paxIds, obs } = await roomData(req.params.id, req.body ?? {}, room.id);
    await prisma.grupoHabitacion.update({
      where: { id: room.id },
      data: { tipo, obs, pasajeros: { set: paxIds.map((id) => ({ id })) } },
    });
    res.json({ msg: "Habitación actualizada" });
  } catch (error) {
    fail(res, error, "Error al actualizar la habitación");
  }
};

// DELETE /grupos/:id/habitaciones/:roomId
export const deleteRoom = async (req: Request, res: Response) => {
  try {
    const result = await prisma.grupoHabitacion.deleteMany({ where: { id: req.params.roomId, grupoId: req.params.id } });
    if (result.count === 0) return res.status(404).json({ msg: "Habitación no encontrada" });
    res.json({ msg: "Habitación eliminada" });
  } catch (error) {
    fail(res, error, "Error al eliminar la habitación");
  }
};

/* ---------- Documents (PDF, Word, Excel) ---------- */

export const getGroupPdfs = async (req: Request, res: Response) => {
  try {
    const pdfs = await prisma.grupoPdf.findMany({ where: { grupoId: req.params.id }, orderBy: { createdAt: "desc" } });
    res.json({ data: pdfs });
  } catch (error) {
    fail(res, error, "Error al obtener los documentos");
  }
};

export const addGroupPdfs = async (req: Request, res: Response) => {
  const grupoId = req.params.id;
  const files = req.files as Express.Multer.File[];
  try {
    if (!files || files.length === 0) return res.status(400).json({ msg: "No se eligió ningún archivo." });
    const count = await prisma.grupoPdf.count({ where: { grupoId } });
    if (count + files.length > MAX_PDFS) {
      return res.status(400).json({ msg: `Se permiten hasta ${MAX_PDFS} documentos por salida. Ya tiene ${count}.` });
    }
    const pdfs = await Promise.all(
      files.map(async (file) => {
        const { url, filename } = await uploadPdf(file, "grupo_pdfs");
        return prisma.grupoPdf.create({
          data: { url, filename, originalName: getOriginalName(file), mimetype: file.mimetype, size: file.size, grupoId },
        });
      })
    );
    res.json({ data: pdfs });
  } catch (error) {
    fail(res, error, "Error al subir los documentos");
  }
};

export const getGroupPdfUrl = async (req: Request, res: Response) => {
  try {
    const pdf = await prisma.grupoPdf.findFirst({ where: { id: req.params.pdfId, grupoId: req.params.id } });
    if (!pdf) return res.status(404).json({ msg: "Documento no encontrado" });
    res.json({ url: getPdfDownloadUrl(pdf.filename) });
  } catch (error) {
    fail(res, error, "Error al abrir el documento");
  }
};

export const deleteGroupPdf = async (req: Request, res: Response) => {
  try {
    const pdf = await prisma.grupoPdf.findFirst({ where: { id: req.params.pdfId, grupoId: req.params.id } });
    if (!pdf) return res.status(404).json({ msg: "Documento no encontrado" });
    await deletePdf(pdf.filename);
    await prisma.grupoPdf.delete({ where: { id: pdf.id } });
    res.json({ msg: "Documento eliminado" });
  } catch (error) {
    fail(res, error, "Error al eliminar el documento");
  }
};
