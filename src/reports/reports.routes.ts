import { Router } from "express";
import type { Request, Response } from "express";
import * as ReportService from './reports.services'
import { authenticateToken, AuthRequest } from "../users/user.utils";
import { body, validationResult } from 'express-validator';
import { createError } from "./reports.services";
import multer, { StorageEngine } from "multer";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLocalUpload } from "../utils/multer.local";
import fs from 'fs';


const s3 = new S3Client({ region: "us-east-2" }); // Sustituye "your-region" con la región de tu bucket S3
export const reportRouter = Router();



const uploadLocal = createLocalUpload([
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/jpg"
]);




reportRouter.post('/errors',
    authenticateToken,
    uploadLocal.array("images", 10), // Se permite subir hasta 10 imágenes
    body("title").isString().optional(),
    body("description").isString().notEmpty(),
    body("type").isString(),
    body("img_src").isString().optional(),
    body("img_alt").isString().optional(),
    body("userId").isString().notEmpty(),

    async (req: Request, res: Response) => {

        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            // Si hay errores de validación, eliminar archivos locales y devolver el error
            for (const file of req.files as Express.Multer.File[]) {
                await fs.promises.unlink(file.path); // Eliminar archivo local
            }
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { title, description, type, userId } = req.body;

            // Subir archivos a S3 y obtener las URLs públicas
            const images = (req.files as Express.Multer.File[])?.map(async (file) => {
                const fileStream = await fs.promises.readFile(file.path);
                const s3Key = `errors/${Date.now()}-${file.originalname}`;

                // Subir archivo a S3
                await s3.send(new PutObjectCommand({
                    Bucket: "sacbucketgeneral", // Nombre de tu bucket
                    Key: s3Key,
                    Body: fileStream,
                    ContentType: file.mimetype,
                }));

                // Generar URL pública del archivo en S3
                const pdfUrl = `https://s3.us-east-2.amazonaws.com/sacbucketgeneral/${s3Key}`;

                // Eliminar archivo local después de la subida a S3
                await fs.promises.unlink(file.path);

                return {
                    img_src: pdfUrl, // URL pública de la imagen
                    img_alt: file.originalname
                };
            });

            // Esperar a que todas las imágenes se suban
            const uploadedImages = await Promise.all(images);

            // Llamar a la función `createError` con los datos de las imágenes
            const err = await ReportService.createError({
                title,
                description,
                type,
                userId,
                images: uploadedImages,
            });

            return res.status(200).json(err);

        } catch (e) {
            console.error(e);
            return res.status(500).json(e);
        }
    }
);



// reportRouter.get('/kpi',
//     authenticateToken,
//     async (req: Request, res: Response) => {
//         try {
//             const KPI = await ReportService.getKPI()
//             return res.status(200).json(KPI)
//         } catch (error: any) {
//             return res.status(500).json(error.message)
//         }
//     }
// )

reportRouter.get('/fine/:id?',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            let id: string | undefined = undefined;
            if (req.params.id) {
                id = (req.params.id)
            }
            const fineHistory = await ReportService.getFineHistory(id)
            res.status(200).json(fineHistory)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

reportRouter.get('/payments/:id?',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            let id: string | undefined = undefined;
            if (req.params.id) {
                id = (req.params.id)
            }
            const paymentHistory = await ReportService.getPaymentHistory(id)



            res.status(200).json(paymentHistory)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)






reportRouter.get('/pending/:id?',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { user } = req as AuthRequest

            const id: string = req.params.id;
            if (!user) {
                return res.status(401).json("Unauthorized access");
            }
            const events = await ReportService.getPendingPayments(user, id);
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

reportRouter.get('/fiscal-groups',
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        const role = user.role

        // Object for filtering based on the params
        const { id, startDate, endDate } = req.query

        const filterParams: { id?: string; startDate?: string; endDate?: string; } = {}

        if (id) filterParams.id = id as string;
        if (startDate) filterParams.startDate = startDate as string;
        if (endDate) filterParams.endDate = endDate as string;

        try {

            const getGroups = await ReportService.getFiscalGroups({ role, ...filterParams })

            return res.status(200).json(getGroups);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Error returning groups")
        }

    }
)

reportRouter.get('/global-performance',
    authenticateToken,
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden access")

        try {
            const globalPerformance = await ReportService.getGlobalPerformance();

            return res.json(globalPerformance)
        } catch (e) {
            console.error(e)
            return res.status(500).json("Unexpected error")
        }

    }
)

reportRouter.get("/global-taxpayer-performance",
    authenticateToken,
    async (req: Request, res: Response) => {

        try {
            const response = await ReportService.getGlobalTaxpayersPerformance()

            return res.status(200).json(response)

        } catch (e) {
            console.error(e)
            return res.status(500).json({ message: "Internal server error" });
        }

    }
)

reportRouter.get("/group-perfomance",
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden access")


        try {

            const response = await ReportService.getGroupPerformance();

            return res.status(200).json(response);

        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error al realizar la petición.")
        }

    }
)

reportRouter.get("/global-kpi",
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden access")


        try {

            const response = await ReportService.getGlobalKPI();

            return res.status(200).json(response);

        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }

    }
)