import { prisma } from "../db/index";
import { Request, Response } from "express";

export const addFile = async (req: Request, res: Response) => {
  const file = req.body;
  try {
    const fileData = await prisma.file.create({
      data: {
        obs: file.obs,
      },
    });
    res.json({ msg: "file added SUCCESSFULLY", id: fileData.id });
  } catch (error) {
    res.json({ msg: "Error, couldn't add a file ", error });
    console.log(error);
  }
};

export const getAllFile = async (req: Request, res: Response) => {
  try {
    const files = await prisma.file.findMany({
      include: { clients: true, services: true },
    });
    res.json({ files });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve files", error });
    console.log(error);
  }
};

export const getFileById = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  try {
    const file = await prisma.file.findUnique({
      where: {
        id: fileId,
      },
    });

    res.json({ msg: "file retrieved SUCCESSFULLY", data: file });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve file", error });
    console.log(error);
  }
};

export const updateFile = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  const updatefile = req.body;
  try {
    const file = await prisma.file.update({
      where: {
        id: fileId,
      },
      data: {
        obs: updatefile.obs,
      },
    });
    res.json({ msg: "file updated SUCCESSFULLY", data: file });
  } catch (error) {
    res.json({ msg: "Error, couldn't update file", error });
    console.log(error);
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  try {
    const file = await prisma.file.delete({
      where: {
        id: fileId,
      },
    });
    res.json({ msg: "file deleted SUCCESSFULLY" });
  } catch (error) {
    res.json({ msg: "Error, couldn't delete file", error });
    console.log(error);
  }
};

export const addPaxToFile = async (req: Request, res: Response) => {
  const { fileId, paxId } = req.body;

  try {
    // Find the file and the pax
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { clients: true },
    });

    const pax = await prisma.pax.findUnique({
      where: { id: paxId },
    });

    if (!file || !pax) {
      return res.status(400).json({ msg: "File or Pax not found" });
    }

    //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

    // Add the pax to the file
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: { clients: { connect: { id: paxId } } },
    });

    res.json({
      msg: `Pax with id ${paxId} added to file with id ${fileId} successfully`,
      data: updatedFile,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Error adding pax to file", error });
  }
};

export const addServiceToFile = async (req: Request, res: Response) => {
  const { fileId, serviceId } = req.body;

  try {
    // Find the file and the service
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { services: true },
    });

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!file || !service) {
      return res.status(400).json({ msg: "File or Service not found" });
    }

    // Check if the service is already added to the file
    if (file.services.some((s) => s.id === serviceId)) {
      return res.status(400).json({ msg: "Service already added to file" });
    }

    // Add the service to the file
    const updatedFile = await prisma.file.update({
      where: { id: fileId },
      data: { services: { connect: { id: serviceId } } },
    });

    res.json({
      msg: `Service with id ${serviceId} added to file with id ${fileId} successfully`,
      data: updatedFile,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Error adding service to file", error });
  }
};
