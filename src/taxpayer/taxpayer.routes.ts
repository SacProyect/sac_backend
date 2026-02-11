import express from "express";
import type { Request, Response } from "express";
import * as TaxpayerServices from "./taxpayer.services"
import { body, validationResult } from 'express-validator';
import { EventType } from "./taxpayer.utils";
import { authenticateToken, AuthRequest } from "../users/user.utils";
import fs from 'fs'
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getS3Client } from "../utils/s3.client";
import { createLocalUpload } from "../utils/multer.local";
import { uploadMemory } from "../utils/multer.memory";
import { Decimal } from "@prisma/client/runtime/library";
import { db } from "../utils/db.server";
import logger from "../utils/logger";
import { ApiError } from "../utils/apiResponse";
import { cacheMiddleware, invalidateCacheMiddleware } from "../utils/cache.middleware";

const s3 = getS3Client();
export const taxpayerRouter = express.Router();


const uploadLocal = createLocalUpload([
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

taxpayerRouter.get('/get-taxpayers-for-events',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['taxpayers-events'], includeUser: true }),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        const userId = user.id;
        const userRole = user.role;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;

        try {
            const result = await TaxpayerServices.getTaxpayersForEvents(userId, userRole, page, limit);
            return res.status(200).json(result)
        } catch (error: any) {
            logger.error("get-taxpayers-for-events", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.get('/get-fiscal-taxpayers-for-stats/:id',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['fiscal-stats'] }),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        const userId = req.params.id;

        try {
            const taxpayer = await TaxpayerServices.getFiscalTaxpayersForStats(userId);
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            logger.error("get-fiscal-taxpayers-for-stats", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

)

taxpayerRouter.get('/get-taxpayers',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['taxpayers-list'], includeUser: true }),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        
        try {
            const result = await TaxpayerServices.getTaxpayers(page, limit);
            return res.status(200).json(result)
        } catch (error: any) {
            logger.error("get-taxpayers", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.get('/download-repair-report/:key',
    authenticateToken,

    async (req: Request, res: Response) => {
        try {

            const key: string = decodeURIComponent(req.params.key);

            const presignedUrl = await TaxpayerServices.generateDownloadRepairUrl(key);

            return res.status(201).json(presignedUrl);

        } catch (e: any) {
            logger.error("download-repair-report error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo generar la URL del acta de reparo");
        }

    }
)






taxpayerRouter.get("/download-investigation",
    authenticateToken,

    async (req: Request, res: Response) => {
        try {

            const key = decodeURIComponent(req.query.key as string);




            const presignedUrl = await TaxpayerServices.generateDownloadInvestigationPdfUrl(key);

            return res.status(200).json(presignedUrl);

        } catch (e: any) {
            logger.error("download-investigation error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al generar URL de investigación");
        }
    }
)




taxpayerRouter.post(
    '/',
    authenticateToken,
    uploadLocal.array("pdfs", 20),
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list', 'taxpayer-categories']),
    body("providenceNum").isNumeric().withMessage("providenceNum must be numeric"),
    body("process").isString().withMessage("process must be a string"),
    body("name").isString().withMessage("name must be a string"),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid (must start with J, V, E, P or G followed by 9 digits)"),
    body("contract_type").isString().withMessage("contract_type must be a string"),
    body("officerName").isString().withMessage("officerName must be a string"),
    body("address").notEmpty().withMessage("address is required"),
    body("emition_date").notEmpty().withMessage("emition_date is required").isString().withMessage("emition_date must be a string"),
    body("category").notEmpty().withMessage("category must be provided").isString().withMessage("Category must be a string"),
    body("parish").notEmpty().withMessage("parish is required").isString().withMessage("parish must be a string"),

    async (req: Request, res: Response) => {
        try {

            const { user } = req as AuthRequest;
            if (!user) return res.status(401).json("Unauthorized access");
            if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");


            const userId = user?.id;
            const role = user?.role;
            const s3Files = [];

            for (const file of req.files as Express.Multer.File[]) {
                const fileStream = await fs.promises.readFile(file.path);
                const s3Key = `pdfs/${Date.now()}-${file.originalname}`;

                await s3.send(new PutObjectCommand({
                    Bucket: "sacbucketgeneral",
                    Key: s3Key,
                    Body: fileStream,
                    ContentType: file.mimetype,
                }));

                // Push the public URL (or generate it based on your bucket setup)
                s3Files.push({ pdf_url: `https://sacbucketgeneral.s3.amazonaws.com/${s3Key}` });

                // Delete local file after upload
                await fs.promises.unlink(file.path);
            }

            const { providenceNum, process, name, rif, contract_type, officerId, address, emition_date, parish, category } = req.body;

            // ✅ Validar que parish y category estén presentes (ya validado por express-validator, pero doble verificación)
            if (!parish || !category) {
                return res.status(400).json({ 
                    message: "Server error", 
                    error: "Parroquia y Actividad Económica son campos obligatorios" 
                });
            }

            const newTaxpayer = await TaxpayerServices.createTaxpayer({
                providenceNum: BigInt(providenceNum),
                process,
                name,
                rif,
                contract_type,
                officerId,
                emition_date,
                address,
                pdfs: s3Files,
                userId: userId,
                role: role,
                parishId: parish,  // El frontend envía el ID como "parish"
                categoryId: category,  // El frontend envía el ID como "category"
            });

            return res.status(200).json(newTaxpayer);
        } catch (error: any) {
            logger.error("create-taxpayer-post error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al crear el contribuyente");
        }
    }
);

taxpayerRouter.post(
    "/repair-report/:id",
    authenticateToken,
    uploadMemory.single("repairReport"),
    invalidateCacheMiddleware(['taxpayers', 'repair-reports']),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest;
        
        if (!user) {
            return res.status(401).json({ error: "Unauthorized access" });
        }

        const taxpayerId = req.params.id;

        // ✅ CORRECCIÓN: Validar acceso del fiscal al contribuyente
        if (user.role === "FISCAL") {
            try {
                const taxpayer = await db.taxpayer.findUnique({
                    where: { id: taxpayerId },
                    include: {
                        user: {
                            include: {
                                supervisor: {
                                    select: { id: true }
                                }
                            }
                        }
                    }
                });

                if (!taxpayer) {
                    return res.status(404).json({ error: "Contribuyente no encontrado" });
                }

                // ✅ PERMITIR si:
                // 1. El usuario es el fiscal asignado (officerId)
                // 2. El usuario es el supervisor del fiscal asignado
                const isCurrentOfficer = taxpayer.officerId === user.id;
                const isCurrentSupervisor = taxpayer.user?.supervisor?.id === user.id;
                
                if (!isCurrentOfficer && !isCurrentSupervisor) {
                    // Verificar si el usuario es supervisor de algún miembro del grupo del fiscal
                    if (taxpayer.user?.groupId) {
                        const group = await db.fiscalGroup.findUnique({
                            where: { id: taxpayer.user.groupId },
                            include: {
                                members: {
                                    where: {
                                        supervisorId: user.id
                                    }
                                }
                            }
                        });
                        
                        if (!group || group.members.length === 0) {
                            return res.status(403).json({ error: "No tienes permisos para subir actas de reparo de este contribuyente." });
                        }
                    } else {
                        return res.status(403).json({ error: "No tienes permisos para subir actas de reparo de este contribuyente." });
                    }
                }
            } catch (accessError: any) {
                logger.error("repair-report acceso error", { message: accessError?.message, stack: accessError?.stack });
                return ApiError.internal(res, "Error al verificar permisos de acceso");
            }
        }

        if (!req.file) {
            return res.status(400).json({ error: "Se requiere un archivo PDF" });
        }

        const file = req.file;
        
        // Validar que sea PDF
        if (file.mimetype !== 'application/pdf') {
            return res.status(400).json({ error: "El archivo debe ser un PDF" });
        }

        const s3Key = `repair-reports/${Date.now()}-${file.originalname}`;
        const pdf_url = `https://sacbucketgeneral.s3.amazonaws.com/${s3Key}`;

        let repairReportId: string | null = null;

        try {
            // Paso 1: Crear el registro sin el PDF (se actualizará después)
            const newRepairReport = await TaxpayerServices.uploadRepairReport(taxpayerId, "");

            if (!newRepairReport || !newRepairReport.id) {
                logger.error("repair-report: no se pudo crear registro", { taxpayerId });
                return ApiError.internal(res, "No se pudo crear el registro del acta de reparo");
            }

            repairReportId = newRepairReport.id;

            // Paso 2: Subir el archivo a S3
            await s3.send(
                new PutObjectCommand({
                    Bucket: "sacbucketgeneral",
                    Key: s3Key,
                    Body: file.buffer,
                    ContentType: file.mimetype,
                })
            );

            // Paso 3: Actualizar el PDF URL del registro
            const updatedRepairReport = await TaxpayerServices.updateRepairReportPdfUrl(repairReportId, pdf_url);

            return res.status(201).json(updatedRepairReport);
        } catch (error: any) {
            logger.error("repair-report upload error", { 
                message: error?.message, 
                stack: error?.stack, 
                taxpayerId,
                repairReportId,
            });

            // Intentar limpiar el registro si ya fue creado
            if (repairReportId) {
                try {
                    await TaxpayerServices.deleteRepairReportById(repairReportId);
                    logger.warn(`repair-report: limpieza de registro ${repairReportId} tras fallo`);
                } catch (deleteError: any) {
                    logger.error(`repair-report: no se pudo limpiar registro ${repairReportId}`, { 
                        message: deleteError?.message 
                    });
                }
            }

            const errorMessage = error.message || "Error desconocido al subir el acta de reparo";
            return ApiError.internal(res, errorMessage, error.stack);
        }
    }
);

taxpayerRouter.get("/get-taxpayer-categories",
    authenticateToken,
    cacheMiddleware({ ttl: 300000, tags: ['taxpayer-categories'] }),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {
            const categories = await TaxpayerServices.getTaxpayerCategories();

            return res.status(200).json(categories);

        } catch (e: any) {
            logger.error("get-taxpayer-categories error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudieron obtener las categorías de contribuyentes");
        }
    }
)

taxpayerRouter.get('/get-parish-list',
    authenticateToken,
    cacheMiddleware({ ttl: 300000, tags: ['parish-list'] }),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {

            const parishList = await TaxpayerServices.getParishList();

            return res.status(200).json(parishList);

        } catch (e: any) {
            logger.error("get-parish-list error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo obtener la lista de parroquias");
        }

    }
)


taxpayerRouter.post(
    '/create-taxpayer',
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list']),
    body("providenceNum").isNumeric().withMessage("providenceNum must be numeric"),
    body("process").isString().withMessage("process must be a string"),
    body("name").isString().withMessage("name must be a string"),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid (must start with J, V, E, P or G followed by 9 digits)"),
    body("contract_type").isString().withMessage("contract_type must be a string"),
    body("officerName").isString().withMessage("officerName must be a string"),
    body("address").notEmpty().withMessage("address is required"),
    body("emition_date").notEmpty().withMessage("emition_date is required").isString().withMessage("emition_date must be a string"),
    body("category").notEmpty().withMessage("category must be provided").isString().withMessage("Category must be a string"),
    body("parish").notEmpty().withMessage("parish is required").isString().withMessage("parish must be a string"),

    async (req: Request, res: Response) => {
        try {
            const { user } = req as AuthRequest;

            if (!user) return res.status(401).json({ error: "Unauthorized access" });
            if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
                return res.status(403).json({ error: "Forbidden role" });
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const response = await TaxpayerServices.createTaxpayerExcel(req.body);
            return res.status(201).json(response);

        } catch (error: any) {
            logger.error("create-taxpayer error", { message: error?.message, stack: error?.stack });
            const errorMessage = error.message || "Error desconocido al crear el contribuyente";
            return ApiError.internal(res, errorMessage, error.stack);
        }
    }
);


taxpayerRouter.get('/:id',
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['taxpayers'] }),
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const taxpayer = await TaxpayerServices.getTaxpayerById(id);


            // console.log('ID:', id);

            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)



taxpayerRouter.get('/all/:id',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['taxpayers-list'] }),
    async (req: Request, res: Response) => {
        try {
            const id: string = req.params.id;
            const taxpayers = await TaxpayerServices.getTaxpayersByUser(id);
            return res.status(200).json(taxpayers);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
);



taxpayerRouter.put("/:id",
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list']),
    body("providenceNum").isInt().optional({ values: 'falsy' }),
    body("process").isString().optional({ values: 'falsy' }),
    body("name").isString().optional({ values: 'falsy' }),
    body("rif").isString().optional({ values: 'falsy' }),
    body("contractType").isString().optional({ values: 'falsy' }),
    body("officerId").isString().optional({ values: 'falsy' }),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const { user } = req as AuthRequest;
            const input = req.body
            const id: string = (req.params.id);
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const updatedTaxpayer = await TaxpayerServices.updateTaxpayer(
                id, 
                input,
                user?.id,
                user?.role
            )
            return res.status(200).json(updatedTaxpayer)
        } catch (error: any) {
            logger.error("update-taxpayer error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res);
        }
    }

)

taxpayerRouter.put("/modify-observations/:id",
    authenticateToken,
    invalidateCacheMiddleware(['observations']),
    body("newDescription").notEmpty().isString(),

    async (req: Request, res: Response) => {


        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json("Unauthorized");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");

        try {

            const id: string = (req.params.id);
            const { newDescription } = req.body;

            const updatedObservation = await TaxpayerServices.updateObservation(id, newDescription);

            return res.status(200).json(updatedObservation);
        } catch (e: any) {
            logger.error("modify-observations error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo actualizar la descripción");
        }
    }
)

taxpayerRouter.put("/update-fase/:id",
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers', 'fase']),
    body("fase").notEmpty().isString(),


    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest;
        const id: string = req.params.id;
        const { fase } = req.body;

        const validFases = ["FASE_1", "FASE_2", "FASE_3", "FASE_4"];
        if (!validFases.includes(fase)) {
            return res.status(400).json({ error: "Invalid fase value" });
        }

        if (!user) return res.status(401).json({ error: "Unauthorized" });
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json({ error: "Forbidden" });

        const data = {
            id: id,
            fase: fase,
        }

        try {
            const updatedFase = await TaxpayerServices.updateFase(data);
            return res.status(200).json(updatedFase);
        } catch (e: any) {
            logger.error("update-fase error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo actualizar la fase del contribuyente");
        }
    }
)

taxpayerRouter.put("/notify/:id",
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers']),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest;
        const id: string = req.params.id;

        if (!user) return res.status(401).json({ error: "Unauthorized" });

        try {

            const notified = await TaxpayerServices.notifyTaxpayer(id);

            return res.status(200).json(notified);
        } catch (e: any) {
            logger.error("notify error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al notificar al contribuyente");
        }
    }
)


taxpayerRouter.put("/updatePayment/:id",
    authenticateToken,
    invalidateCacheMiddleware(['payments', 'taxpayers-events']),
    body("status").isString(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest;
        const id: string = req.params.id;

        if (!user) return res.status(401).json({ error: "Unauthorized" });

        const { status } = req.body;

        if (status !== "paid" && status !== "not_paid") return res.status(400).json({ error: "Bad Request" });

        try {

            const updatedPayment = await TaxpayerServices.updatePayment(id, status)

            return res.status(200).json(updatedPayment);

        } catch (e: any) {
            logger.error("updatePayment error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al actualizar el pago de la multa");
        }
    }
)


taxpayerRouter.delete('/:id',
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list']),
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const taxpayer = await TaxpayerServices.deleteTaxpayerById(id);
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.delete("/del-observation/:id",
    authenticateToken,
    invalidateCacheMiddleware(['observations']),
    async (req: Request, res: Response) => {
        try {

            const { user } = req as AuthRequest

            if (!user) return res.status(401).json("Unauthorized");

            if (user.role !== "ADMIN") return res.status(403).json("Forbidden");

            const id: string = (req.params.id);
            const observation = await TaxpayerServices.deleteObservation(id);

            return res.status(200).json(observation);

        } catch (e: any) {
            logger.error("del-observation error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo eliminar la observación");
        }
    }
)

taxpayerRouter.get('/event/all',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['events'] }),
    async (req: Request, res: Response) => {
        try {
            const events = await TaxpayerServices.getEventsbyTaxpayer()
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.get('/event/:id/:type?',
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['events', 'taxpayers-events'] }),
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const type: string = req.params.type

            const events = await TaxpayerServices.getEventsbyTaxpayer(id, type)
            // console.log("EVENTS: " + JSON.stringify(events))
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.get('/data/:id',
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['taxpayers'] }),
    async (req: Request, res: Response) => {

        try {

            const id: string = (req.params.id);

            const data = await TaxpayerServices.getTaxpayerData(id)

            return res.status(200).json(data);

        } catch (e: any) {
            logger.error("data error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Ha ocurrido un error al obtener datos");
        }
    }
)



taxpayerRouter.get("/get-observations/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['observations'] }),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {

            const id: string = (req.params.id);
            const observations = await TaxpayerServices.getObservations(id);

            return res.status(200).json(observations);

        } catch (e: any) {
            logger.error("get-observations error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al obtener las observaciones");
        }
    }
)

taxpayerRouter.get('/get-islr/:id',
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['islr-reports'] }),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {

            const id: string = req.params.id;

            const islrReport = await TaxpayerServices.getIslrReports(id);

            return res.status(200).json(islrReport);

        } catch (e: any) {
            logger.error("get-islr error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al obtener reportes ISLR");
        }
    }
)

taxpayerRouter.get("/getTaxSummary/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['taxpayers'] }),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        const id: string = (req.params.id);

        try {

            const taxSummary = await TaxpayerServices.getTaxpayerSummary(id);

            return res.status(200).json(taxSummary);

        } catch (e: any) {
            logger.error("getTaxSummary error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo obtener el resumen tributario del contribuyente");
        }

    }


)

taxpayerRouter.post('/fine',
    authenticateToken,
    invalidateCacheMiddleware(['events', 'taxpayers-events']),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("description").isString().notEmpty(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("fine validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body, debt: req.body.amount, type: EventType.FINE }
            const fine = await TaxpayerServices.createEvent(input)
            return res.status(200).json(fine)
        } catch (error: any) {
            logger.error("fine error", { message: error?.message, stack: error?.stack });
            const errorMessage = error.message || "Error al crear la multa";
            // Retornar 400 para errores de validación, 500 solo para errores del servidor
            const statusCode = errorMessage.includes("no encontrado") || 
                              errorMessage.includes("requerido") || 
                              errorMessage.includes("inválida") ? 400 : 500;
            return res.status(statusCode).json({ error: errorMessage })
        }
    }
)



taxpayerRouter.post('/create-index-iva',
    authenticateToken,
    body("specialAmount").isDecimal(),
    body("ordinaryAmount").isDecimal(),

    async (req: Request, res: Response) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("create-index-iva validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")

        try {

            const data = req.body;

            const index = await TaxpayerServices.createIndexIva(data);
            return res.status(200).json(index)
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.put('/modify-individual-index-iva/:id',
    authenticateToken,
    body("newIndexIva"),

    async (req: Request, res: Response) => {

        // const errors = validationResult(req);
        // if (!errors.isEmpty()) {
        //     console.error(errors.array())
        //     return res.status(400).json({ errors: errors.array() });
        // }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "COORDINATOR" && user.role !== "ADMIN") return res.status(403).json("Forbidden")

        try {

            const { newIndexIva } = req.body;
            const taxpayerId: string = req.params.id;

            const index = await TaxpayerServices.modifyIndexIva(new Decimal(newIndexIva), taxpayerId);
            return res.status(200).json(index)
        } catch (error: any) {
            logger.error("modify-individual-index-iva error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, "Error al modificar el índice IVA");
        }
    }
)



taxpayerRouter.post('/createIVA',
    authenticateToken,
    invalidateCacheMiddleware(['iva-reports', 'taxpayers']),
    body("taxpayerId").isString().notEmpty(),
    body("iva").optional(),
    body("purchases").notEmpty().isNumeric(),
    body("sells").notEmpty().isNumeric(),
    body("excess").optional(),
    body("date").isISO8601().notEmpty(),
    body("paid").notEmpty(),


    async (req: Request, res: Response) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("createIVA validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        const data = req.body;

        if (!data.iva && !data.excess) return res.status(400).json("Either IVA or Excess must be provided");

        try {
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const response = await TaxpayerServices.createIVA(data, user.id, user.role)

            return res.status(200).json(response);

        } catch (e: any) {
            logger.error("createIVA error", { message: e?.message, stack: e?.stack });

            if (e.message === "IVA report for this taxpayer and month already exists.") {
                return ApiError.conflict(res, e.message);
            }

            return ApiError.internal(res, "Error al crear el reporte IVA");

        }
    }
)



taxpayerRouter.post('/create-islr-report',
    authenticateToken,
    invalidateCacheMiddleware(['islr-reports', 'taxpayers']),
    body("incomes").isDecimal(),
    body("costs").isDecimal(),
    body("expent").isDecimal(),
    body("emition_date").isISO8601().notEmpty(),
    body("taxpayerId").isString().notEmpty(),
    body("paid").notEmpty(),

    async (req: Request, res: Response) => {
        const autorizados = ["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"];
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (!autorizados.includes(user.role)) return res.status(403).json("Forbidden")


        const input = { ...req.body }

        const emitionYear = new Date(input.emition_date).getFullYear();
        try {
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const report = await TaxpayerServices.createISLR(input, user.id, user.role);
            logger.info("ISLR report created successfully");
            logger.info("ISLR report sent to client");  
            const response = res.status(200).json(report);
            return response

        } catch (e: any) {
            if (e.message === `ISLR Report for this taxpayer in: ${emitionYear} was already created`) {
                logger.error(e.message);
                return res.status(400).json({ error: e.message });
            }

            logger.error(e.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.post('/payment',
    authenticateToken,
    invalidateCacheMiddleware(['payments', 'events']),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("eventId").isString().notEmpty(),
    body("taxpayerId").isString(),
    body("debt").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body }
            const payment = await TaxpayerServices.createPayment(input)
            logger.info("Payment created successfully");
            logger.info("Payment sent to client");  
            return res.status(200).json(payment)
        } catch (error: any) {

            if (error.name === "AmountError") {
                logger.error(error.message);
                return res.status(400).json({ error: error.message })
            }

            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

taxpayerRouter.post("/observations",
    authenticateToken,
    invalidateCacheMiddleware(['observations']),
    body("description").notEmpty().isString(),
    body("date").notEmpty().isString().isISO8601(),
    body("taxpayerId").notEmpty().isString(),

    async (req: Request, res: Response) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }


        try {
            const input = { ...req.body }

            const observation = await TaxpayerServices.createObservation(input);

            logger.info("Observation created successfully");
            logger.info("Observation sent to client");  
            return res.status(200).json(observation);

        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)


taxpayerRouter.post('/payment_compromise',
    authenticateToken,
    invalidateCacheMiddleware(['events', 'taxpayers-events']),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("fineEventId").isString().notEmpty(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        
        try {
            const input = { ...req.body, type: EventType.PAYMENT_COMPROMISE }
            const payment_compromise = await TaxpayerServices.createEvent(input)
            logger.info("Payment compromise created successfully");
            logger.info("Payment compromise sent to client");  
            return res.status(200).json(payment_compromise)
        } catch (error: any) {
            logger.error("payment_compromise error", { message: error?.message, stack: error?.stack });
            
            if (error.name === "AmountError") {
                logger.error(error.message);
                return res.status(400).json({ error: error.message })
            }
            
            // Retornar mensaje de error más descriptivo
            const errorMessage = error.message || "Error al crear el compromiso de pago";
            logger.error(errorMessage);
            return res.status(400).json({ error: errorMessage })
        }
    }
)





taxpayerRouter.post('/warning',
    authenticateToken,
    invalidateCacheMiddleware(['events', 'taxpayers-events']),
    body("date").isISO8601().toDate(),
    body("amount").isNumeric(),
    body("taxpayerId").isString().notEmpty(),
    body("fineEventId").isString().notEmpty(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        try {
            const input = { ...req.body, type: EventType.WARNING }
            const warning = await TaxpayerServices.createEvent(input)
            return res.status(200).json(warning)
        } catch (error: any) {
            logger.error(error.message);
            const errorMessage = error.message || "Error al crear el aviso";
            return res.status(400).json({ error: errorMessage })
        }
    }
)



taxpayerRouter.put('/fine/:eventId',
    authenticateToken,
    invalidateCacheMiddleware(['events', 'taxpayers-events']),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    body("description").isString().optional({ checkFalsy: true }),
    body("type").isString().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const eventId = req.params.eventId;
            const input = { ...req.body };
            const fine = await TaxpayerServices.updateEvent(eventId, input);
            logger.info("Fine updated successfully");
            logger.info("Fine sent to client");  
            return res.status(200).json(fine);
        } catch (error: any) {
            logger.error("fine update error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al actualizar la multa");
        }
    }
);

taxpayerRouter.put('/updateIva/:ivaId',
    authenticateToken,
    invalidateCacheMiddleware(['iva-reports', 'taxpayers']),
    async (req: Request, res: Response) => {
        try {
            const { user } = req as AuthRequest;
            const ivaId = req.params.ivaId;
            const input = { ...req.body };
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const updated = await TaxpayerServices.updateIvaReport(ivaId, input, user?.id, user?.role);
            logger.info("IVA report updated successfully");
            logger.info("IVA report sent to client");  
            return res.status(200).json(updated);
        } catch (error: any) {
            logger.error("updateIva error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al actualizar reporte IVA");
        }
    }
);

taxpayerRouter.put('/payment/:eventId',
    authenticateToken,
    invalidateCacheMiddleware(['payments', 'events']),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const payment = await TaxpayerServices.updateEvent(eventId, input);
            logger.info("Payment updated successfully");
            logger.info("Payment sent to client");  
            return res.status(200).json(payment);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
);

taxpayerRouter.put(
    '/update-taxpayer/:id',
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list']),
    body("address").optional(),
    body("providenceNum").optional(),
    body("process").optional(),
    body("name").optional(),
    body("rif").optional(),
    body("parish_id").optional(),
    body("taxpayer_category_id").optional(),
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json("Unauthorized access");
        if (
            user.role !== "ADMIN" &&
            user.role !== "COORDINATOR" &&
            user.role !== "FISCAL" &&
            user.role !== "SUPERVISOR"
        )
            return res.status(403).json("Forbidden");

        let data;

        if (user.role === "ADMIN") {
            // admin puede actualizar lo que quiera
            data = req.body;

        } else {
            // los demás solo parish_id y taxpayer_category_id
            const { parish_id, taxpayer_category_id } = req.body;
            data = { parish_id, taxpayer_category_id };
        }

        const id = req.params.id;

        try {
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const updated = await TaxpayerServices.updateTaxpayer(id, data, user.id, user.role);

            return res.status(201).json(updated);
        } catch (err: any) {
            logger.error("update-taxpayer-put error", { message: err?.message, stack: err?.stack });
            return ApiError.internal(res, "Error al actualizar el contribuyente");
        }
    }
);

/**
 * ✅ REFACTORIZACIÓN 2026: Ruta reactivada para permitir culminar casos 2025
 * - Permite acceso a fiscales rotados
 * - No valida restricciones de año fiscal
 */
taxpayerRouter.put('/update-culminated/:id',
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers']),
    body("culminated").isBoolean().notEmpty(), 

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")


        try {

            const id: string = req.params.id;
            const culminated = req.body.culminated;

            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const culminatedSuccesfully = await TaxpayerServices.updateCulminated(id, culminated, user.id, user.role);

            logger.info("Case culminated successfully");
            logger.info("Case sent to client");  
            return res.status(201).json(culminatedSuccesfully);

        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message || "Error al culminar el caso" });
        }


    }
)

taxpayerRouter.put('/payment_compromise/:eventId',
    authenticateToken,
    invalidateCacheMiddleware(['events']),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const payment_compromise = await TaxpayerServices.updateEvent(eventId, input);
            logger.info("Payment compromise updated successfully");
            logger.info("Payment compromise sent to client");  
            return res.status(200).json(payment_compromise);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
);

taxpayerRouter.put('/warning/:eventId',
    authenticateToken,
    invalidateCacheMiddleware(['events']),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const warning = await TaxpayerServices.updateEvent(eventId, input);
            logger.info("Warning updated successfully");
            logger.info("Warning sent to client");  
            return res.status(200).json(warning);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
);

taxpayerRouter.put("/update-islr/:id",
    authenticateToken,
    invalidateCacheMiddleware(['islr-reports', 'taxpayers']),
    async (req: Request, res: Response) => {
        const autorizados = ["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"];
        try {
            const { user } = req as AuthRequest
            if (!user) return res.status(401).json("Unauthorized access")
            if (!autorizados.includes(user.role)) return res.status(403).json("Forbidden")
            const id: string = req.params.id;
            const input = req.body;
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const updatedIslr = await TaxpayerServices.updateIslr(id, input, user.id, user.role)
            logger.info("ISLR updated successfully");
            logger.info("ISLR sent to client");  
            return res.status(201).json(updatedIslr);

        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message })
        }
    }
)

taxpayerRouter.delete('/event/:id',
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {
            const id: string = (req.params.id);

            const event = await TaxpayerServices.deleteEvent(id)
            logger.info("Event deleted successfully");
            logger.info("Event sent to client");  
            return res.status(200).json(event)
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ message: error.message})
        }
    }
);

taxpayerRouter.delete('/payment/:id',
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {
            const id: string = (req.params.id);
            const event = await TaxpayerServices.deletePayment(id)
            logger.info("Payment deleted successfully");
            logger.info("Payment sent to client");  
            return res.status(200).json(event)
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ message: error.message || "Server error." })
        }
    }
);

taxpayerRouter.delete("/delete-iva/:id",
    authenticateToken,
    invalidateCacheMiddleware(['iva-reports', 'taxpayers']),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")

        try {
            const id: string = req.params.id;

            const ivaReport = await TaxpayerServices.deleteIva(id);

            logger.info("IVA report deleted successfully");
            logger.info("IVA report sent to client");  
            return res.status(201).json(ivaReport);

        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message || "Server error." })
        }
    }
);



taxpayerRouter.delete("/delete-islr/:id",
    authenticateToken,
    invalidateCacheMiddleware(['islr-reports', 'taxpayers']),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")
        try {
            const id: string = req.params.id;

            const islrReport = await TaxpayerServices.deleteIslr(id);

            logger.info("ISLR report deleted successfully");
            logger.info("ISLR report sent to client");  
            return res.status(201).json(islrReport);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message })
        }
    }
)


taxpayerRouter.post("/create-taxpayer-category",
    authenticateToken,
    invalidateCacheMiddleware(['taxpayer-categories']),
    body("name"),

    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")

        const { name } = req.body;

        try {
            const response = await TaxpayerServices.CreateTaxpayerCategory(name);

            logger.info("New category created successfully");
            logger.info("New category sent to client");  
            return res.status(201).json(response);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

