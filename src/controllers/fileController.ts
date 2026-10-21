import { log } from "console";
import { prisma } from "../db/index";
import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import cloudinary from "../config/cloudinary";
import {
  buildPage,
  getPaginationParams,
  isPaginatedRequest,
} from "../utils/pagination";
import {
  fileNumberConditions,
  nextFileNumber,
  yearInArgentina,
} from "../utils/fileNumber";
import {
  MAX_PDFS,
  deletePdf,
  getOriginalName,
  getPdfDownloadUrl,
  uploadPdf,
} from "../utils/pdfStorage";

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

// A file stays among the "current" ones until this many days after its departure date
const ACTIVE_DAYS = 30;

// Services only with what the list needs to show totals per currency
const fileListInclude = {
  clients: true,
  services: {
    select: { id: true, precioNeto: true, tarifa: true, currency: true },
  },
} satisfies Prisma.FileInclude;

export const getAllFile = async (req: Request, res: Response) => {
  try {
    if (!isPaginatedRequest(req)) {
      const files = await prisma.file.findMany({
        include: { clients: true, services: true, pdfs: true },
      });
      return res.json({ files });
    }

    const { page, skip, take, terms } = getPaginationParams(req);

    // Every search term must match the file number, the destination, the reference or a
    // pax name. A number ("55" or "55-2026") matches that exact file number, so "55"
    // doesn't also bring 155 or 255.
    const where: Prisma.FileWhereInput = {
      AND: terms.map((term): Prisma.FileWhereInput => {
        const numberConditions = fileNumberConditions(term);
        if (numberConditions.length > 0) {
          return { OR: [...numberConditions, { nro: term }] };
        }
        return {
          OR: [
            { destino: { contains: term } },
            { nro: { contains: term } },
            {
              clients: {
                some: {
                  OR: [
                    { firstname: { contains: term } },
                    { lastname: { contains: term } },
                  ],
                },
              },
            },
          ],
        };
      }),
    };

    // Two tabs: "current" files (departure from ACTIVE_DAYS ago onwards, some trips last
    // that long), closest first; and "finished" ones, most recent first.
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - ACTIVE_DAYS);

    const currentWhere = { AND: [where, { fechaSalida: { gte: cutoff } }] };
    const finishedWhere = { AND: [where, { fechaSalida: { lt: cutoff } }] };
    const showFinished = req.query.status === "finished";

    const [files, current, finished] = await prisma.$transaction([
      prisma.file.findMany({
        where: showFinished ? finishedWhere : currentWhere,
        include: fileListInclude,
        orderBy: [{ fechaSalida: showFinished ? "desc" : "asc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.file.count({ where: currentWhere }),
      prisma.file.count({ where: finishedWhere }),
    ]);

    // counts: results in each tab (with the search applied), to show them on the tabs
    res.json({
      ...buildPage(files, showFinished ? finished : current, page),
      counts: { current, finished },
    });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't retrieve files", error });
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
    // Delete the file's PDFs from Cloudinary (cascade removes them from the database)
    const pdfs = await prisma.filePdf.findMany({ where: { fileId } });
    await Promise.all(pdfs.map((pdf) => deletePdf(pdf.filename)));

    // Its services belong only to this file: delete them (soft) together with it
    await prisma.$transaction([
      prisma.service.updateMany({
        where: { File: { some: { id: fileId } } },
        data: { deleted_at: new Date() },
      }),
      prisma.file.delete({
        where: {
          id: fileId,
        },
      }),
    ]);
    res.json({ msg: "file deleted SUCCESSFULLY" });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't delete file", error });
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

    // Create the file with calculated total tariff and the next number of the year
    const anio = yearInArgentina();
    const createFile = () =>
      prisma.$transaction(async (tx) =>
        tx.file.create({
          data: {
            numero: await nextFileNumber(tx, anio),
            anio,
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
        })
      );

    // If two files are created at the same moment they could get the same number:
    // the unique (anio, numero) rejects one and it is retried with the next number
    let fileData;
    for (let attempt = 1; ; attempt++) {
      try {
        fileData = await createFile();
        break;
      } catch (error: any) {
        if (error.code !== "P2002" || attempt >= 3) throw error;
      }
    }

    res.status(200).json({
      msg: "File added successfully",
      id: fileData.id,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ msg: "Error, couldn't add a file ", error });
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

      // A service always belongs to a file: removing it from the file deletes it (soft)
      if (serviceIdsToRemove.length > 0) {
        await prisma.service.updateMany({
          where: { id: { in: serviceIdsToRemove } },
          data: { deleted_at: new Date() },
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

    if (existingPdfs.length + files.length > MAX_PDFS) {
      return res.status(400).json({
        msg: `Se permiten hasta ${MAX_PDFS} documentos por file. Ya tiene ${existingPdfs.length}.`,
      });
    }

    // Upload PDFs (private, see utils/pdfStorage)
    const pdfUploadPromises = files.map(async (file) => {
      const { url, filename } = await uploadPdf(file, "file_pdfs");
      return prisma.filePdf.create({
        data: {
          url,
          filename,
          originalName: getOriginalName(file),
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
    await deletePdf(pdf.filename);

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
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: pdfs });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving PDFs", error });
    console.log(error);
  }
};

// Get a temporary link to open a File PDF
export const getFilePdfUrl = async (req: Request, res: Response) => {
  const { fileId, pdfId } = req.params;

  try {
    const pdf = await prisma.filePdf.findFirst({ where: { id: pdfId, fileId } });

    if (!pdf) {
      return res.status(404).json({ msg: "PDF not found" });
    }

    res.json({ url: getPdfDownloadUrl(pdf.filename) });
  } catch (error) {
    res.status(500).json({ msg: "Error generating PDF link", error });
    console.log(error);
  }
};
