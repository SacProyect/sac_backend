import { Router } from "express";
import type { Request, Response } from "express";
import * as ReportService from './reports.services'
import { authenticateToken, AuthRequest } from "../users/user.utils";
import { body, validationResult, query } from 'express-validator';
import { createError } from "./reports.services";
import multer, { StorageEngine } from "multer";
import path from "path";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLocalUpload } from "../utils/multer.local";
import fs from 'fs';
import { report } from "process";

// Helper function to parse date parameter - handles both year numbers and date strings
function parseDateParam(dateParam: string | undefined): Date {
    if (!dateParam) {
        return new Date();
    }
    
    // If it's just a number (year), create a date for January 1st of that year
    const yearNum = parseInt(dateParam, 10);
    if (!isNaN(yearNum) && yearNum >= 2000 && yearNum <= 2100) {
        return new Date(Date.UTC(yearNum, 0, 1));
    }
    
    // Otherwise, try to parse as a date string
    const parsed = new Date(dateParam);
    if (isNaN(parsed.getTime())) {
        // If invalid, return current date
        return new Date();
    }
    
    return parsed;
}


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



reportRouter.get('/kpi',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const KPI = await ReportService.getGlobalKPI()
            return res.status(200).json(KPI)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

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

        const userId = user.id;

        // Object for filtering based on the params
        const { id, startDate, endDate } = req.query

        const filterParams: { id?: string; startDate?: string; endDate?: string; supervisorId?: string } = {}

        if (id) filterParams.id = id as string;
        if (startDate) filterParams.startDate = startDate as string;
        if (endDate) filterParams.endDate = endDate as string;
        if (role === "SUPERVISOR") {
            filterParams.supervisorId = user.id as string;
        }

        try {

            const getGroups = await ReportService.getFiscalGroups({ role, userId, ...filterParams })

            return res.status(200).json(getGroups);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Error returning groups")
        }

    }
)

reportRouter.get('/get-group-records',
    authenticateToken,
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");

        // Object for filtering based on the params
        const { id, month, year } = req.query

        const input: { id?: string; month?: number; year?: number; } = {}

        if (id) input.id = id as string;
        if (month) input.month = parseInt(month as string);
        if (year) input.year = parseInt(year as string);

        if (!id) return res.status(400).json("An id must be provided");

        try {
            const groupRecords = await ReportService.getGroupRecord(input);
            return res.status(200).json(groupRecords);
        } catch (e) {
            console.error(e);
            return res.status(500).json("Server error.");
        }

    }
)

reportRouter.get('/global-performance',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest


        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") {
            return res.status(403).json("Forbidden access")
        }

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const globalPerformance = await ReportService.getGlobalPerformance(date);

            return res.json(globalPerformance)
        } catch (e) {
            console.error(e)
            return res.status(500).json("Unexpected error")
        }

    }
)

reportRouter.get("/global-taxpayer-performance",
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest


        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") {
            return res.status(403).json("Forbidden access")
        }

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getIvaByMonth(date)

            return res.status(200).json(response)

        } catch (e) {
            console.error(e)
            return res.status(500).json({ message: "Internal server error" });
        }

    }
)

reportRouter.get("/debug-query",
    authenticateToken,
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest


        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") {
            return res.status(403).json("Forbidden access")
        }

        try {
            const response = await ReportService.debugQuery();

            return res.status(200).json(response)

        } catch (e) {
            console.error(e)
            return res.status(500).json({ message: "Internal server error" });
        }

    }
)

reportRouter.get("/group-performance",
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getGroupPerformance(date);

            return res.status(200).json(response);

        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error al realizar la petición.")
        }

    }
)

reportRouter.get("/global-kpi",
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getGlobalKPI(date);

            return res.status(200).json(response);

        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }

    }
)

reportRouter.get("/individual-iva-report/:id",
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }

        const id: string = req.params.id;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getIndividualIvaReport(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-best-supervisor-by-group',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getBestSupervisorByGroups(date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-top-fiscals',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getTopFiscals(date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-top-five-by-group',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getTopFiveByGroup(date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-monthly-growth',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getMonthlyCompliance(date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-taxpayers-compliance',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getTaxpayerCompliance(date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-expected-amount',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access")


        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getExpectedAmount(date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
);

reportRouter.get('/get-fiscal-info/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getFiscalInfo(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
);

reportRouter.get('/get-fiscal-taxpayers/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getFiscalTaxpayers(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
);

reportRouter.get('/get-fiscal-monthly-collect/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getMonthyCollect(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-fiscal-monthly-performance/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getMontlyPerformance(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)

reportRouter.get('/get-fiscal-compliance-by-process/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getComplianceByProcess(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
);

reportRouter.get('/get-fiscal-compliance/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getFiscalTaxpayerCompliance(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
);

reportRouter.get('/get-fiscal-collect-analisis/:id',
    authenticateToken,
    query("date").optional(),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "FISCAL" && user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden access")

        const id: string = (req.params.id) as string;

        try {
            const date = parseDateParam(req.query.date as string | undefined);
            const response = await ReportService.getFiscalCollectAnalisis(id, date);

            return res.status(200).json(response);
        } catch (e) {
            console.error(e)
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
);

reportRouter.get('/get-complete-report',
    authenticateToken,

    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "SUPERVISOR" && user.role !== "COORDINATOR") return res.status(403).json("Forbidden access");

        // Obtener los query params
        const {
            groupId,
            startDate,
            endDate,
            process
        } = req.query;

        let userId = undefined;
        let userRole = undefined;

        if (user.role !== "ADMIN") {
            userId = user.id;
            userRole = user.role;
        }

        console.log(userId);

        try {
            // Pass to the service 
            const response = await ReportService.getCompleteReport({
                groupId: groupId?.toString(),
                startDate: startDate?.toString(),
                endDate: endDate?.toString(),
                process: process?.toString() as "AF" | "VDF" | "FP" | undefined,
                userId: userId,
                userRole: userRole
            });

            return res.status(200).json(response);
        } catch (e) {
            console.error(e);
            return res.status(500).json("Ha ocurrido un error.");
        }
    }

)