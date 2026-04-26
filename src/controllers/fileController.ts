import { log } from "console";
import { prisma } from "../db/index";
import { Request, Response } from "express";
import cloudinary from "../config/cloudinary";

// Helper function to upload file to Cloudinary
const uploadToCloudinary = (
  file: Express.Multer.File,
  folder: string = "files"
): Promise<{ url: string; filename: string }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder },
      (error, result) => {
        if (error) return reject(error);
        if (result) {
          resolve({
            url: result.secure_url,
            filename: result.public_id,
          });
        }
      }
    );
    uploadStream.end(file.buffer);
  });
};

export const getAllFile = async (req: Request, res: Response) => {
  try {
    const files = await prisma.file.findMany({
      include: { clients: true, services: true, pdfs: true },
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
      include: {
        clients: true,
        services: true,
        pdfs: true,
      },
    });

    res.json({ msg: "file retrieved SUCCESSFULLY", data: file });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve file", error });
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

export const addFile = async (req: Request, res: Response) => {
  const { paxIds, serviceIds, formData } = req.body;

  try {
    // Calculate total tariff from the connected services
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
    });

    const totalTariff = services.reduce(
      (total, service) => total + parseFloat(service.tarifa),
      0
    );
    const totalPrecioNeto = services.reduce(
      (total, service) => total + parseFloat(service.precioNeto),
      0
    );

    // Create the file with calculated total tariff
    const fileData = await prisma.file.create({
      data: {
        nro: formData.nro,
        obs: formData.obs,
        precioNetoTotal: totalPrecioNeto.toString(),
        tarifaTotal: totalTariff.toString(), // Convert back to string if needed
        tarifaAlternativa: formData.tarifaAlternativa,
        destino: formData.destino,
        fechaSalida: formData.fechaSalida,
        clients: {
          connect: [...paxIds.map((paxId: string) => ({ id: paxId }))],
        },
        services: {
          connect: [
            ...serviceIds.map((serviceId: string) => ({ id: serviceId })),
          ],
        },
      },
    });

    res.status(200).json({
      msg: "File added successfully",
      id: fileData.id,
    });
  } catch (error) {
    console.log(error);
    res.json({ msg: "Error, couldn't add a file ", error });
  }
};

export const updateFile = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  const updateData = req.body;

  try {
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      include: { clients: true, services: true },
    });

    if (!file) {
      return res.status(404).json({ msg: "Archivo no encontrado" });
    }

    const { formData, paxIds, serviceIds } = updateData;

    // Update Paxs
    if (paxIds) {
      const existingPaxIds = file.clients.map((client) => client.id);
      const newPaxIdsToAdd = paxIds.filter(
        (paxId: string) => !existingPaxIds.includes(paxId)
      );
      const paxIdsToRemove = existingPaxIds.filter(
        (existingPaxId) => !paxIds.includes(existingPaxId)
      );

      if (newPaxIdsToAdd.length > 0 || paxIdsToRemove.length > 0) {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            clients: {
              connect: newPaxIdsToAdd.map((paxId: string) => ({ id: paxId })),
              disconnect: paxIdsToRemove.map((paxId) => ({ id: paxId })),
            },
          },
        });
      }
    }

    // Update Services FIRST (before calculating totals)
    if (serviceIds) {
      const existingServiceIds = file.services.map((service) => service.id);
      const newServiceIdsToAdd = serviceIds.filter(
        (serviceId: string) => !existingServiceIds.includes(serviceId)
      );
      const serviceIdsToRemove = existingServiceIds.filter(
        (existingServiceId) => !serviceIds.includes(existingServiceId)
      );

      if (newServiceIdsToAdd.length > 0 || serviceIdsToRemove.length > 0) {
        await prisma.file.update({
          where: { id: fileId },
          data: {
            services: {
              connect: newServiceIdsToAdd.map((serviceId: string) => ({
                id: serviceId,
              })),
              disconnect: serviceIdsToRemove.map((serviceId) => ({
                id: serviceId,
              })),
            },
          },
        });
      }
    }

    // NOW calculate totals from the updated services
    const updatedFile = await prisma.file.findUnique({
      where: { id: fileId },
      include: { services: true },
    });

    const totalTariff = updatedFile!.services.reduce(
      (total, service) => total + parseFloat(service.tarifa),
      0
    );

    const totalNetPrice = updatedFile!.services.reduce(
      (total, service) => total + parseFloat(service.precioNeto),
      0
    );

    // Update file data with calculated totals (formData cannot override these)
    if (formData) {
      await prisma.file.update({
        where: { id: fileId },
        data: {
          nro: formData.nro,
          obs: formData.obs,
          tarifaTotal: totalTariff.toString(), // ALWAYS calculated, never from formData
          precioNetoTotal: totalNetPrice.toString(), // ALWAYS calculated, never from formData
          tarifaAlternativa: formData.tarifaAlternativa,
          destino: formData.destino,
          fechaSalida: formData.fechaSalida,
        },
      });
    } else {
      // If no formData, just update the totals
      await prisma.file.update({
        where: { id: fileId },
        data: {
          tarifaTotal: totalTariff.toString(),
          precioNetoTotal: totalNetPrice.toString(),
        },
      });
    }

    // Get updated file data
    const updatedFileData = await prisma.file.findUnique({
      where: { id: fileId },
      include: { clients: true, services: true, pdfs: true },
    });

    res.json({
      msg: `Datos actualizados en el archivo con ID ${fileId} exitosamente`,
      data: updatedFileData,
    });
  } catch (error) {
    res
      .status(500)
      .json({ msg: "Error al actualizar los datos en el archivo", error });
    console.log(error);
  }
};

// Add PDFs to existing File (up to 10)
export const addPdfToFile = async (req: Request, res: Response) => {
  const fileId = req.params.id;
  const files = req.files as Express.Multer.File[];

  try {
    if (!files || files.length === 0) {
      return res.status(400).json({ msg: "No files provided" });
    }

    // Check current PDF count
    const existingPdfs = await prisma.filePdf.findMany({
      where: { fileId },
    });

    if (existingPdfs.length + files.length > 10) {
      return res.status(400).json({
        msg: `Cannot add more PDFs. Maximum 10 PDFs allowed. Currently has ${existingPdfs.length}.`,
      });
    }

    // Upload PDFs to Cloudinary
    const pdfUploadPromises = files.map(async (file) => {
      const { url, filename } = await uploadToCloudinary(file, "file_pdfs");
      return prisma.filePdf.create({
        data: {
          url,
          filename,
          mimetype: file.mimetype,
          size: file.size,
          fileId,
        },
      });
    });

    const pdfs = await Promise.all(pdfUploadPromises);

    res.json({
      msg: "PDFs added successfully",
      data: pdfs,
    });
  } catch (error) {
    res.status(500).json({ msg: "Error uploading PDFs", error });
    console.log(error);
  }
};

// Delete specific PDF from File
export const deletePdfFromFile = async (req: Request, res: Response) => {
  const { fileId, pdfId } = req.params;

  try {
    // Get PDF info
    const pdf = await prisma.filePdf.findUnique({
      where: { id: pdfId },
    });

    if (!pdf) {
      return res.status(404).json({ msg: "PDF not found" });
    }

    if (pdf.fileId !== fileId) {
      return res.status(400).json({ msg: "PDF does not belong to this File" });
    }

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(pdf.filename);

    // Delete from database
    await prisma.filePdf.delete({
      where: { id: pdfId },
    });

    // Get updated file data
    const fileWithData = await prisma.file.findUnique({
      where: { id: fileId },
      include: { clients: true, services: true, pdfs: true },
    });

    res.json({ msg: "PDF deleted successfully", data: fileWithData });
  } catch (error) {
    res.status(500).json({ msg: "Error deleting PDF", error });
    console.log(error);
  }
};

// Get all PDFs for a File
export const getFilePdfs = async (req: Request, res: Response) => {
  const fileId = req.params.id;

  try {
    const pdfs = await prisma.filePdf.findMany({
      where: { fileId },
    });

    res.json({ data: pdfs });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving PDFs", error });
    console.log(error);
  }
};
