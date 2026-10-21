import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import {
  buildPage,
  getPaginationParams,
  isPaginatedRequest,
} from "../utils/pagination";
import { fileNumberConditions } from "../utils/fileNumber";

export const addService = async (req: Request, res: Response) => {
  const service = req.body;
  try {
    const serviceData = await prisma.service.create({
      data: {
        nombre: service.nombre,
        provider: service.provider,
        localizador: service.localizador,
        precioNeto: service.precioNeto,
        tarifa: service.tarifa,
        currency: service.currency,
        type: service.type,
        obs: service.obs,
        fechaInicio: service.fechaInicio,
        fechaFin: service.fechaFin,
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
  try {
    const service = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        nombre: updatedservice.nombre,
        provider: updatedservice.provider,
        localizador: updatedservice.localizador,
        precioNeto: updatedservice.precioNeto,
        tarifa: updatedservice.tarifa,
        currency: updatedservice.currency,
        type: updatedservice.type,
        obs: updatedservice.obs,
        fechaInicio: updatedservice.fechaInicio,
        fechaFin: updatedservice.fechaFin,
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
