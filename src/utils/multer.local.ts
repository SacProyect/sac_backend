// utils/multer.local.ts
import multer from "multer";
import path from "path";
import { Request } from "express";

export function createLocalUpload(allowedMimeTypes: string[]) {
    const storage = multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, "/tmp"); // carpeta temporal (puedes usar otra)
        },
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
            cb(null, `${uniqueSuffix}-${file.originalname}`);
        }
    });

    return multer({
        storage,
        fileFilter: (req, file, cb) => {
            if (allowedMimeTypes.includes(file.mimetype)) {
                cb(null, true);
            } else {
                cb(new Error(`File type not allowed: ${file.mimetype}`));
            }
        },
        limits: {
            fileSize: 10 * 1024 * 1024, // 10MB
        }
    });
}
