import path from "path";
import cloudinary from "../config/cloudinary";

// Documents (PDF, Word, Excel) are stored as private ("authenticated") raw files: their
// direct URL doesn't work, they can only be opened through a temporary signed link
// (see getPdfDownloadUrl). This keeps documents like passports private and avoids
// Cloudinary's PDF delivery block.
const PDF_OPTIONS = { resource_type: "raw" as const, type: "authenticated" };
const LINK_EXPIRATION_SECONDS = 10 * 60;

export const MAX_PDFS = 10;

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx"];

const getExtension = (filename: string) => path.extname(filename).toLowerCase();

export const isAllowedDocument = (filename: string) =>
  ALLOWED_EXTENSIONS.includes(getExtension(filename));

// Multer decodes original filenames as latin1; convert them back to UTF-8 (accents, ñ)
export const getOriginalName = (file: Express.Multer.File) =>
  Buffer.from(file.originalname, "latin1").toString("utf8");

export const uploadPdf = (
  file: Express.Multer.File,
  folder: string
): Promise<{ url: string; filename: string }> => {
  const extension = isAllowedDocument(file.originalname)
    ? getExtension(file.originalname)
    : ".pdf";

  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        ...PDF_OPTIONS,
        folder,
        // Raw files keep the extension in the public id so they open with the right type
        public_id: `${Date.now()}_${Math.round(Math.random() * 1e9)}${extension}`,
      },
      (error, result) => {
        if (error) return reject(error);
        if (result) {
          resolve({ url: result.secure_url, filename: result.public_id });
        }
      }
    );
    uploadStream.end(file.buffer);
  });
};

export const deletePdf = (publicId: string) =>
  cloudinary.uploader.destroy(publicId, PDF_OPTIONS);

// PDFs open in the browser; Word/Excel can't be shown there, so they are downloaded
export const getPdfDownloadUrl = (publicId: string) =>
  cloudinary.utils.private_download_url(publicId, "", {
    ...PDF_OPTIONS,
    attachment: getExtension(publicId) !== ".pdf",
    expires_at: Math.floor(Date.now() / 1000) + LINK_EXPIRATION_SECONDS,
  });
