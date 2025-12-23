import { log } from "console";
import { prisma } from "../db/index";
import { Request, Response } from "express";
import cloudinary from "../config/cloudinary";

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

export const addPax = async (req: Request, res: Response) => {
  const pax = req.body;
  const files = req.files as Express.Multer.File[];

  try {
    // Create the Pax first
    const paxData = await prisma.pax.create({
      data: {
        firstname: pax.firstname,
        lastname: pax.lastname,
        dni: pax.dni,
        passport: pax.passport,
        dob: pax.dob,
        adress: pax.adress,
        email: pax.email,
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

    // Get pax with photos
    const paxWithPhotos = await prisma.pax.findUnique({
      where: { id: paxData.id },
      include: { photos: true },
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
    const paxs = await prisma.pax.findMany({
      include: { photos: true },
    });
    res.json({ paxs });
  } catch (error) {
    res.json({ msg: "Error, couldn't retrieve paxs", error });
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
      include: { photos: true },
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

  try {
    // Update the Pax data
    const pax = await prisma.pax.update({
      where: {
        id: paxId,
      },
      data: {
        firstname: updatedpax.firstname,
        lastname: updatedpax.lastname,
        dni: updatedpax.dni,
        passport: updatedpax.passport,
        dob: updatedpax.dob,
        adress: updatedpax.adress,
        email: updatedpax.email,
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

    // Get updated pax with photos
    const paxWithPhotos = await prisma.pax.findUnique({
      where: { id: pax.id },
      include: { photos: true },
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
    // Get pax with photos before deleting
    const pax = await prisma.pax.findUnique({
      where: { id: paxId },
      include: { photos: true },
    });

    if (pax) {
      // Delete photos from Cloudinary
      const deletePromises = pax.photos.map((photo) =>
        deleteFromCloudinary(photo.filename)
      );
      await Promise.all(deletePromises);
    }

    // Delete pax (cascade will delete photos from database)
    await prisma.pax.delete({
      where: {
        id: paxId,
      },
    });

    res.json({ msg: "pax deleted SUCCESSFULLY" });
  } catch (error) {
    res.json({ msg: "Error, couldn't delete pax", error });
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

    res.json({ msg: "Photo deleted successfully" });
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
