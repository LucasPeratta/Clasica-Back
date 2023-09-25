import { log } from "console";
import { prisma } from "../db/index";
import { Request, Response } from "express";

export const addService = async (req: Request, res: Response) => {
  const service = req.body;
  try {
    const serviceData = await prisma.service.create({
      data: {
        provider: service.provider,
        precioNeto: service.precioNeto,
        tarifa: service.tarifa,
        currency: service.currency,
        obs: service.obs,
      },
    });
    res.json({ msg: "service added SUCCESSFULLY", id: serviceData.id });
  } catch (error) {
    res.json({ msg: "Error, couldn't add a service ", error });
    console.log(error);
  }
};

export const getAllService = async (req: Request, res: Response) => {
  try {
    const services = await prisma.service.findMany({
      where: { deleted_at: null },
    });
    res.json({ services });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve services", error });
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
        precioNeto: updatedservice.precioNeto,
        tarifa: updatedservice.tarifa,
        currency: updatedservice.currency,
        provider: updatedservice.provider,
        obs: updatedservice.obs,
      },
    });

    res.json({ msg: "service updated SUCCESSFULLY", data: service });
  } catch (error) {
    res.json({ msg: "Error, couldn't update service", error });
    console.log(error);
  }
};

export const deleteService = async (req: Request, res: Response) => {
  const serviceId = req.params.id;
  try {
    const service = await prisma.service.delete({
      where: {
        id: serviceId,
      },
    });
    res.json({ msg: "service deleted SUCCESSFULLY" });
  } catch (error) {
    res.json({ msg: "Error, couldn't delete service", error });
    console.log(error);
  }
};

export const softDeleteService = async (req: Request, res: Response) => {
  const serviceId = req.params.id;

  try {
    const service = await prisma.service.update({
      where: {
        id: serviceId,
      },
      data: {
        deleted_at: new Date(),
      },
    });

    res.json({ msg: "Service soft deleted successfully", data: service });
  } catch (error) {
    res.json({ msg: "Error, couldn't soft delete service", error });
    console.log(error);
  }
};
