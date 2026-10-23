import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  buildPage,
  getPaginationParams,
  isPaginatedRequest,
} from "../utils/pagination";
import { fileNumberConditions } from "../utils/fileNumber";
import { parseLiquidationDate } from "../utils/liquidation";
import { servicesPaidToSupplier } from "../utils/protection";
import { MAX_PDFS, deletePdf, getOriginalName, getPdfDownloadUrl, uploadPdf } from "../utils/pdfStorage";

export const addService = async (req: Request, res: Response) => {
  const service = req.body;
  // The wholesaler is needed to pay it later (Pagos > Pagos a mayoristas)
  if (!String(service?.provider ?? "").trim()) {
    return res.status(400).json({ msg: "Falta el mayorista del servicio." });
  }
  try {
    const serviceData = await prisma.service.create({
      data: {
        nombre: service.nombre,
        provider: service.provider.trim(),
        localizador: service.localizador,
        precioNeto: service.precioNeto,
        tarifa: service.tarifa,
        currency: service.currency,
        type: service.type,
        obs: service.obs,
        fechaInicio: service.fechaInicio,
        fechaFin: service.fechaFin,
        // Flights have no settlement date
        fechaLiquidacion: service.type === "AEREO" ? null : parseLiquidationDate(service.fechaLiquidacion),
      },
    });
    res.json({ msg: "service added SUCCESSFULLY", id: serviceData.id });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't add a service ", error });
    console.log(error);
  }
};

export const getAllService = async (req: Request, res: Response) => {
  try {
    // Full list (used by selectors in the File form)
    if (!isPaginatedRequest(req)) {
      const services = await prisma.service.findMany({
        where: { deleted_at: null },
      });
      return res.json({ services });
    }

    const { page, skip, take, terms } = getPaginationParams(req);

    // Only services that belong to a file (a service always belongs to one; leftovers
    // created without a file are hidden). Every search term must match the name, the
    // provider, the locator or the file number ("55" / "55-2026").
    const where: Prisma.ServiceWhereInput = {
      deleted_at: null,
      File: { some: {} },
      AND: terms.map((term) => ({
        OR: [
          { nombre: { contains: term } },
          { provider: { contains: term } },
          { localizador: { contains: term } },
          ...fileNumberConditions(term).map((condition) => ({
            File: { some: condition },
          })),
        ],
      })),
    };

    const [services, total] = await prisma.$transaction([
      prisma.service.findMany({
        where,
        include: {
          File: { select: { id: true, numero: true, anio: true, destino: true } },
        },
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.service.count({ where }),
    ]);

    res.json(buildPage(services, total, page));
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't retrieve services", error });
    console.log(error);
  }
};

export const getServiceById = async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  try {
    const service = await prisma.service.findFirst({
      where: {
        id: serviceId,
        deleted_at: null,
      },
      include: {
        File: { select: { id: true, numero: true, anio: true, destino: true } },
      },
    });

    res.json({ msg: "service retrieved SUCCESSFULLY", data: service });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve service", error });
    console.log(error);
  }
};

export const updateService = async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const updatedservice = req.body;
  // The wholesaler is needed to pay it later (Pagos > Pagos a mayoristas)
  if (!String(updatedservice?.provider ?? "").trim()) {
    return res.status(400).json({ msg: "Falta el mayorista del servicio." });
  }
  try {
    const service = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        nombre: updatedservice.nombre,
        provider: updatedservice.provider.trim(),
        localizador: updatedservice.localizador,
        precioNeto: updatedservice.precioNeto,
        tarifa: updatedservice.tarifa,
        currency: updatedservice.currency,
        type: updatedservice.type,
        obs: updatedservice.obs,
        fechaInicio: updatedservice.fechaInicio,
        fechaFin: updatedservice.fechaFin,
        fechaLiquidacion: updatedservice.type === "AEREO" ? null : parseLiquidationDate(updatedservice.fechaLiquidacion),
      },
    });

    res.json({ msg: "service updated SUCCESSFULLY", data: service });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't update service", error });
    console.log(error);
  }
};

export const softDeleteService = async (req: Request, res: Response) => {
  const serviceId = req.params.id;

  try {
    // Already paid to the wholesaler: kept (AFIP)
    if ((await servicesPaidToSupplier([serviceId])).length > 0) {
      return res.status(400).json({
        msg: "Este servicio ya tiene pagos al mayorista: no se puede eliminar.",
        errorCode: "SERVICE_PROTECTED",
      });
    }

    // Deleting a service also removes it from its file (and from the file's totals)
    const service = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        deleted_at: new Date(),
        File: { set: [] },
      },
    });

    res.json({ msg: "Service soft deleted successfully", data: service });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't soft delete service", error });
    console.log(error);
  }
};

// GET /service/proveedores — wholesalers already used, to suggest them when loading a service
export const getProviders = async (req: Request, res: Response) => {
  try {
    const services = await prisma.service.findMany({
      where: { deleted_at: null, NOT: { provider: "" } },
      distinct: ["provider"],
      select: { provider: true },
      orderBy: { provider: "asc" },
    });
    // Same name with different spaces/case counts once
    const seen = new Set<string>();
    const providers = services
      .map((s) => s.provider.trim())
      .filter((p) => p && !seen.has(p.toLowerCase()) && seen.add(p.toLowerCase()));
    res.json({ data: providers });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't retrieve providers", error });
    console.log(error);
  }
};

// PATCH /service/:id/liquidado { liquidado: boolean } — sent to the wholesaler for settlement
export const setServiceLiquidado = async (req: Request, res: Response) => {
  const liquidado = req.body?.liquidado === true;
  try {
    const service = await prisma.service.update({
      where: { id: req.params.id },
      data: { liquidado, liquidadoAt: liquidado ? new Date() : null },
    });
    res.json({ msg: "Service updated", data: service });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't update service", error });
    console.log(error);
  }
};

// Attachments of a service (photos or documents, e.g. the flight itinerary)
const adjuntoSelect = { id: true, originalName: true, mimetype: true, createdAt: true } as const;

// GET /service/:id/adjuntos
export const getServiceAdjuntos = async (req: Request, res: Response) => {
  try {
    const adjuntos = await prisma.serviceAdjunto.findMany({
      where: { serviceId: req.params.id },
      select: adjuntoSelect,
      orderBy: { createdAt: "asc" },
    });
    res.json({ data: adjuntos });
  } catch (error) {
    res.status(500).json({ msg: "Error al obtener los adjuntos", error });
    console.log(error);
  }
};

// POST /service/:id/adjuntos (multipart, up to MAX_PDFS per service)
export const addServiceAdjuntos = async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) return res.status(400).json({ msg: "No se eligió ningún archivo." });

  try {
    const service = await prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } });
    if (!service) return res.status(404).json({ msg: "Servicio no encontrado" });

    const count = await prisma.serviceAdjunto.count({ where: { serviceId } });
    if (count + files.length > MAX_PDFS) {
      return res.status(400).json({ msg: `Se permiten hasta ${MAX_PDFS} archivos por servicio. Ya tiene ${count}.` });
    }

    const adjuntos = await Promise.all(
      files.map(async (file) => {
        const { url, filename } = await uploadPdf(file, "service_adjuntos");
        return prisma.serviceAdjunto.create({
          data: { url, filename, originalName: getOriginalName(file), mimetype: file.mimetype, size: file.size, serviceId },
          select: adjuntoSelect,
        });
      })
    );
    res.json({ data: adjuntos });
  } catch (error) {
    res.status(500).json({ msg: "Error al subir los archivos", error });
    console.log(error);
  }
};

// GET /service/:id/adjuntos/:adjuntoId/url — temporary link to open it
export const getServiceAdjuntoUrl = async (req: Request, res: Response) => {
  try {
    const adjunto = await prisma.serviceAdjunto.findFirst({
      where: { id: req.params.adjuntoId, serviceId: req.params.id },
    });
    if (!adjunto) return res.status(404).json({ msg: "Archivo no encontrado" });
    res.json({ url: getPdfDownloadUrl(adjunto.filename) });
  } catch (error) {
    res.status(500).json({ msg: "Error al abrir el archivo", error });
    console.log(error);
  }
};

// DELETE /service/:id/adjuntos/:adjuntoId
export const deleteServiceAdjunto = async (req: Request, res: Response) => {
  try {
    const adjunto = await prisma.serviceAdjunto.findFirst({
      where: { id: req.params.adjuntoId, serviceId: req.params.id },
    });
    if (!adjunto) return res.status(404).json({ msg: "Archivo no encontrado" });
    await deletePdf(adjunto.filename);
    await prisma.serviceAdjunto.delete({ where: { id: adjunto.id } });
    res.json({ msg: "Archivo eliminado" });
  } catch (error) {
    res.status(500).json({ msg: "Error al eliminar el archivo", error });
    console.log(error);
  }
};
