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
  MAX_PDFS,
  deletePdf,
  getOriginalName,
  getPdfDownloadUrl,
  uploadPdf,
} from "../utils/pdfStorage";

// Helper function to upload image to Cloudinary
const uploadToCloudinary = (
  file: Express.Multer.File
): Promise<{ url: string; filename: string }> => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "pax_photos" },
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

// Helper function to delete image from Cloudinary
const deleteFromCloudinary = (publicId: string): Promise<any> => {
  return cloudinary.uploader.destroy(publicId);
};

// DNI without dots/spaces/dashes and passport uppercase without spaces, so
// "43.972.227" and "43972227" count as the same document. Empty -> null.
const normalizeDni = (value?: string | null) =>
  (value ?? "").replace(/[\s.\-]/g, "") || null;
const normalizePassport = (value?: string | null) =>
  (value ?? "").replace(/\s/g, "").toUpperCase() || null;

// Trips that haven't departed yet: the front uses their dates to warn about documents
// (DNI/passport) that expire before the trip
const upcomingFilesInclude = () => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    where: { fechaSalida: { gte: today } },
    select: { id: true, numero: true, anio: true, destino: true, fechaSalida: true },
    orderBy: { fechaSalida: "asc" as const },
  };
};

// Returns an error message if another pax already has this DNI or passport
const findDuplicateDocument = async (
  dni: string | null,
  passport: string | null,
  excludeId?: string
) => {
  if (!dni && !passport) return null;

  const others = await prisma.pax.findMany({
    where: excludeId ? { id: { not: excludeId } } : undefined,
    select: { firstname: true, lastname: true, dni: true, passport: true },
  });

  const sameDni = dni && others.find((p) => normalizeDni(p.dni) === dni);
  if (sameDni) {
    return `Ya existe un pasajero con el DNI ${dni}: ${sameDni.lastname} ${sameDni.firstname}`;
  }

  const samePassport =
    passport && others.find((p) => normalizePassport(p.passport) === passport);
  if (samePassport) {
    return `Ya existe un pasajero con el pasaporte ${passport}: ${samePassport.lastname} ${samePassport.firstname}`;
  }

  return null;
};

export const addPax = async (req: Request, res: Response) => {
  const pax = req.body;
  const files = req.files as Express.Multer.File[];
  const dni = normalizeDni(pax.dni);
  const passport = normalizePassport(pax.passport);

  try {
    const duplicate = await findDuplicateDocument(dni, passport);
    if (duplicate) {
      return res.status(400).json({ msg: duplicate, errorCode: "DUPLICATE_DOCUMENT" });
    }

    // Create the Pax first
    const paxData = await prisma.pax.create({
      data: {
        firstname: pax.firstname,
        lastname: pax.lastname,
        dni,
        dniVto: pax.dniVto || null,
        passport,
        passportVto: pax.passportVto || null,
        dob: pax.dob,
        adress: pax.adress,
        email: pax.email || null,
        phoneNumber: pax.phoneNumber,
        obs: pax.obs,
      },
    });

    // Upload photos if provided
    if (files && files.length > 0) {
      const photoUploadPromises = files.map(async (file) => {
        const { url, filename } = await uploadToCloudinary(file);
        return prisma.paxPhoto.create({
          data: {
            url,
            filename,
            mimetype: file.mimetype,
            size: file.size,
            paxId: paxData.id,
          },
        });
      });

      await Promise.all(photoUploadPromises);
    }

    // Get pax with photos and pdfs
    const paxWithPhotos = await prisma.pax.findUnique({
      where: { id: paxData.id },
      include: { photos: true, pdfs: true },
    });

    res.json({
      msg: "Pax added successfully",
      data: paxWithPhotos,
    });
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(error);
      res
        .status(400)
        .json({ msg: "Error: Email already exists", errorCode: error.code });
    } else {
      res.status(500).json({ msg: "Error, could not add a Pax", error });
    }
    console.log(error);
  }
};

export const getAllPax = async (req: Request, res: Response) => {
  try {
    // Full list (used by selectors in the File form)
    if (!isPaginatedRequest(req)) {
      const paxs = await prisma.pax.findMany({
        include: { photos: true, pdfs: true },
      });
      return res.json({ paxs });
    }

    const { page, skip, take, terms } = getPaginationParams(req);

    // Every search term must match the name, DNI, passport or email. DNI/passport are
    // compared without dots/spaces ("43.972.227" finds "43972227").
    const where: Prisma.PaxWhereInput = {
      AND: terms.map((term) => {
        const document = term.replace(/[\s.\-]/g, "");
        return {
          OR: [
            { firstname: { contains: term } },
            { lastname: { contains: term } },
            { email: { contains: term } },
            ...(document
              ? [{ dni: { contains: document } }, { passport: { contains: document } }]
              : []),
          ],
        };
      }),
    };

    const [paxs, total] = await prisma.$transaction([
      prisma.pax.findMany({
        where,
        include: { File: upcomingFilesInclude() },
        orderBy: [{ lastname: "asc" }, { firstname: "asc" }, { id: "asc" }],
        skip,
        take,
      }),
      prisma.pax.count({ where }),
    ]);

    res.json(buildPage(paxs, total, page));
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't retrieve paxs", error });
    console.log(error);
  }
};

export const getPaxById = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  try {
    const pax = await prisma.pax.findUnique({
      where: {
        id: paxId,
      },
      include: { photos: true, pdfs: true, File: upcomingFilesInclude() },
    });

    res.json({ msg: "pax retrieved SUCCESSFULLY", data: pax });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve pax", error });
    console.log(error);
  }
};

export const updatePax = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  const updatedpax = req.body;
  const files = req.files as Express.Multer.File[];
  const dni = normalizeDni(updatedpax.dni);
  const passport = normalizePassport(updatedpax.passport);

  try {
    // Only check documents that changed, so existing duplicates can still be edited
    const current = await prisma.pax.findUnique({
      where: { id: paxId },
      select: { dni: true, passport: true },
    });
    const duplicate = await findDuplicateDocument(
      dni !== normalizeDni(current?.dni) ? dni : null,
      passport !== normalizePassport(current?.passport) ? passport : null,
      paxId
    );
    if (duplicate) {
      return res.status(400).json({ msg: duplicate, errorCode: "DUPLICATE_DOCUMENT" });
    }

    // Update the Pax data
    const pax = await prisma.pax.update({
      where: {
        id: paxId,
      },
      data: {
        firstname: updatedpax.firstname,
        lastname: updatedpax.lastname,
        dni,
        dniVto: updatedpax.dniVto || null,
        passport,
        passportVto: updatedpax.passportVto || null,
        dob: updatedpax.dob,
        adress: updatedpax.adress,
        email: updatedpax.email || null,
        phoneNumber: updatedpax.phoneNumber,
        obs: updatedpax.obs,
      },
    });

    // Upload new photos if provided
    if (files && files.length > 0) {
      const photoUploadPromises = files.map(async (file) => {
        const { url, filename } = await uploadToCloudinary(file);
        return prisma.paxPhoto.create({
          data: {
            url,
            filename,
            mimetype: file.mimetype,
            size: file.size,
            paxId: pax.id,
          },
        });
      });

      await Promise.all(photoUploadPromises);
    }

    // Get updated pax with photos and pdfs
    const paxWithPhotos = await prisma.pax.findUnique({
      where: { id: pax.id },
      include: { photos: true, pdfs: true },
    });

    res.json({ msg: "pax updated SUCCESSFULLY", data: paxWithPhotos });
  } catch (error: any) {
    if (error.code === "P2002" && error.meta?.target?.includes("email")) {
      console.log(error);
      res
        .status(400)
        .json({ msg: "Error: Email already exists", errorCode: error.code });
    } else {
      res.status(500).json({ msg: "Error, could not update a Pax", error });
    }
    console.log(error);
  }
};

export const deletePax = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  try {
    // Get pax with photos and pdfs before deleting
    const pax = await prisma.pax.findUnique({
      where: { id: paxId },
      include: { photos: true, pdfs: true },
    });

    if (pax) {
      // Delete photos and PDFs from Cloudinary
      const deletePromises = [
        ...pax.photos.map((photo) => deleteFromCloudinary(photo.filename)),
        ...pax.pdfs.map((pdf) => deletePdf(pdf.filename)),
      ];
      await Promise.all(deletePromises);
    }

    // Delete pax (cascade will delete photos and pdfs from database)
    await prisma.pax.delete({
      where: {
        id: paxId,
      },
    });

    res.json({ msg: "pax deleted SUCCESSFULLY" });
  } catch (error) {
    res.status(500).json({ msg: "Error, couldn't delete pax", error });
    console.log(error);
  }
};

// Files a Pax belongs to (used to warn before deleting the Pax)
export const getPaxFiles = async (req: Request, res: Response) => {
  const paxId = req.params.id;

  try {
    const files = await prisma.file.findMany({
      where: { clients: { some: { id: paxId } } },
      select: {
        id: true,
        numero: true,
        anio: true,
        nro: true,
        destino: true,
        fechaSalida: true,
      },
      orderBy: { fechaSalida: "desc" },
    });

    res.json({ data: files });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving pax files", error });
    console.log(error);
  }
};

// Add photo to existing Pax
export const addPhotoToPax = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  const files = req.files as Express.Multer.File[];

  try {
    if (!files || files.length === 0) {
      return res.status(400).json({ msg: "No files provided" });
    }

    // Upload photos
    const photoUploadPromises = files.map(async (file) => {
      const { url, filename } = await uploadToCloudinary(file);
      return prisma.paxPhoto.create({
        data: {
          url,
          filename,
          mimetype: file.mimetype,
          size: file.size,
          paxId,
        },
      });
    });

    const photos = await Promise.all(photoUploadPromises);

    res.json({
      msg: "Photos added successfully",
      data: photos,
    });
  } catch (error) {
    res.status(500).json({ msg: "Error uploading photos", error });
    console.log(error);
  }
};

// Delete specific photo from Pax
export const deletePhotoFromPax = async (req: Request, res: Response) => {
  const { paxId, photoId } = req.params;

  try {
    // Get photo info
    const photo = await prisma.paxPhoto.findUnique({
      where: { id: photoId },
    });

    if (!photo) {
      return res.status(404).json({ msg: "Photo not found" });
    }

    if (photo.paxId !== paxId) {
      return res.status(400).json({ msg: "Photo does not belong to this Pax" });
    }

    // Delete from Cloudinary
    await deleteFromCloudinary(photo.filename);

    // Delete from database
    await prisma.paxPhoto.delete({
      where: { id: photoId },
    });

    // Get updated pax with photos and pdfs
    const paxWithPhotos = await prisma.pax.findUnique({
      where: { id: paxId },
      include: { photos: true, pdfs: true },
    });

    res.json({ msg: "Photo deleted successfully", data: paxWithPhotos });
  } catch (error) {
    res.status(500).json({ msg: "Error deleting photo", error });
    console.log(error);
  }
};

// Get all photos for a Pax
export const getPaxPhotos = async (req: Request, res: Response) => {
  const paxId = req.params.id;

  try {
    const photos = await prisma.paxPhoto.findMany({
      where: { paxId },
    });

    res.json({ data: photos });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving photos", error });
    console.log(error);
  }
};

// Add PDFs to existing Pax (up to 10)
export const addPdfToPax = async (req: Request, res: Response) => {
  const paxId = req.params.id;
  const files = req.files as Express.Multer.File[];

  try {
    if (!files || files.length === 0) {
      return res.status(400).json({ msg: "No files provided" });
    }

    // Check current PDF count
    const existingPdfs = await prisma.paxPdf.findMany({
      where: { paxId },
    });

    if (existingPdfs.length + files.length > MAX_PDFS) {
      return res.status(400).json({
        msg: `Se permiten hasta ${MAX_PDFS} documentos por pasajero. Ya tiene ${existingPdfs.length}.`,
      });
    }

    // Upload PDFs (private, see utils/pdfStorage)
    const pdfUploadPromises = files.map(async (file) => {
      const { url, filename } = await uploadPdf(file, "pax_pdfs");
      return prisma.paxPdf.create({
        data: {
          url,
          filename,
          originalName: getOriginalName(file),
          mimetype: file.mimetype,
          size: file.size,
          paxId,
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

// Delete specific PDF from Pax
export const deletePdfFromPax = async (req: Request, res: Response) => {
  const { paxId, pdfId } = req.params;

  try {
    // Get PDF info
    const pdf = await prisma.paxPdf.findUnique({
      where: { id: pdfId },
    });

    if (!pdf) {
      return res.status(404).json({ msg: "PDF not found" });
    }

    if (pdf.paxId !== paxId) {
      return res.status(400).json({ msg: "PDF does not belong to this Pax" });
    }

    // Delete from Cloudinary
    await deletePdf(pdf.filename);

    // Delete from database
    await prisma.paxPdf.delete({
      where: { id: pdfId },
    });

    // Get updated pax with photos and pdfs
    const paxWithData = await prisma.pax.findUnique({
      where: { id: paxId },
      include: { photos: true, pdfs: true },
    });

    res.json({ msg: "PDF deleted successfully", data: paxWithData });
  } catch (error) {
    res.status(500).json({ msg: "Error deleting PDF", error });
    console.log(error);
  }
};

// Get all PDFs for a Pax
export const getPaxPdfs = async (req: Request, res: Response) => {
  const paxId = req.params.id;

  try {
    const pdfs = await prisma.paxPdf.findMany({
      where: { paxId },
      orderBy: { createdAt: "desc" },
    });

    res.json({ data: pdfs });
  } catch (error) {
    res.status(500).json({ msg: "Error retrieving PDFs", error });
    console.log(error);
  }
};

// Get a temporary link to open a Pax PDF
export const getPaxPdfUrl = async (req: Request, res: Response) => {
  const { paxId, pdfId } = req.params;

  try {
    const pdf = await prisma.paxPdf.findFirst({ where: { id: pdfId, paxId } });

    if (!pdf) {
      return res.status(404).json({ msg: "PDF not found" });
    }

    res.json({ url: getPdfDownloadUrl(pdf.filename) });
  } catch (error) {
    res.status(500).json({ msg: "Error generating PDF link", error });
    console.log(error);
  }
};
