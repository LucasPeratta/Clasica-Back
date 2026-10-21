import multer from "multer";
import { Request, Response, NextFunction } from "express";
import { isAllowedDocument } from "../utils/pdfStorage";

// Configure multer to store files in memory
const storage = multer.memoryStorage();

// File filter to accept only images
const fileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  // Accept images only
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
});

const pdfUpload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (isAllowedDocument(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Solo se permiten archivos PDF, Word o Excel"));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
}).any();

// Accepts documents (PDF, Word, Excel); upload errors are returned as 400 with a readable message
export const uploadPdfs = (req: Request, res: Response, next: NextFunction) => {
  pdfUpload(req, res, (error: any) => {
    if (!error) return next();
    const msg =
      error.code === "LIMIT_FILE_SIZE"
        ? "El archivo supera el tamaño máximo de 10 MB"
        : error.message;
    res.status(400).json({ msg });
  });
};
