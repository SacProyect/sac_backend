import express from "express";
import type { Request, Response } from "express";
import * as TaxpayerServices from "./taxpayer.services"
import { body, validationResult } from 'express-validator';
import { EventType } from "./taxpayer.utils";
import { authenticateToken, AuthRequest } from "../users/user.utils";
// import multer, { StorageEngine } from "multer";
// import path from "path";
import fs from 'fs'
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { createLocalUpload } from "../utils/multer.local";
import { uploadMemory } from "../utils/multer.memory";
import { Decimal } from "@prisma/client/runtime/library";
import { db } from "../utils/db.server";
// import { commonParams } from "@aws-sdk/client-s3/dist-types/endpoint/EndpointParameters";

const s3 = new S3Client({ region: "us-east-2" }); // Replace "your-region" with your AWS region
export const taxpayerRouter = express.Router();


const uploadLocal = createLocalUpload([
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

taxpayerRouter.get('/get-taxpayers-for-events',
    authenticateToken,
    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        const userId = user.id;
        const userRole = user.role;

        try {
            const taxpayer = await TaxpayerServices.getTaxpayersForEvents(userId, userRole);
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            console.error(error);
            return res.status(500).json(error)
        }
    }
)

taxpayerRouter.get('/get-fiscal-taxpayers-for-stats/:id',
    authenticateToken,

    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        const userId = req.params.id;

        try {
            const taxpayer = await TaxpayerServices.getFiscalTaxpayersForStats(userId);
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            console.error(error);
            return res.status(500).json(error)
        }
    }

)

taxpayerRouter.get('/get-taxpayers',
    authenticateToken,

    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        try {
            const taxpayer = await TaxpayerServices.getTaxpayers();
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            console.error("No se pudieron obtener los taxpayers: ", error);
            return res.status(500).json(error)
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

        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: "Couldn't generate a repair report url" })
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

        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: "Error del servidor." })
        }
    }
)




// taxpayerRouter.post(
//     '/',
//     authenticateToken,
//     uploadLocal.array("pdfs", 20),
//     body("providenceNum").isNumeric().withMessage("providenceNum must be numeric"),
//     body("process").isString().withMessage("process must be a string"),
//     body("name").isString().withMessage("name must be a string"),
//     body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid (must start with J, V, E, P or G followed by 9 digits)"),
//     body("contract_type").isString().withMessage("contract_type must be a string"),
//     body("officerName").isString().withMessage("officerName must be a string"),
//     body("address").notEmpty().withMessage("address is required"),
//     body("emition_date").notEmpty().withMessage("emition_date is required").isString().withMessage("emition_date must be a string"),
//     body("category").notEmpty().withMessage("category must be provided").isString().withMessage("Category must be a string"),
//     body("parish").notEmpty().withMessage("parish is required").isString().withMessage("parish must be a string"),

//     async (req: Request, res: Response) => {
//         try {

//             const { user } = req as AuthRequest;
//             if (!user) return res.status(401).json("Unauthorized access");
//             if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");


//             const userId = user?.id;
//             const role = user?.role;
//             const s3Files = [];

//             for (const file of req.files as Express.Multer.File[]) {
//                 const fileStream = await fs.promises.readFile(file.path);
//                 const s3Key = `pdfs/${Date.now()}-${file.originalname}`;

//                 await s3.send(new PutObjectCommand({
//                     Bucket: "sacbucketgeneral",
//                     Key: s3Key,
//                     Body: fileStream,
//                     ContentType: file.mimetype,
//                 }));

//                 // Push the public URL (or generate it based on your bucket setup)
//                 s3Files.push({ pdf_url: `https://sacbucketgeneral.s3.amazonaws.com/${s3Key}` });

//                 // Delete local file after upload
//                 await fs.promises.unlink(file.path);
//             }

//             const { providenceNum, process, name, rif, contract_type, officerId, address, emition_date, parish, category } = req.body;

//             // ✅ Validar que parish y category estén presentes (ya validado por express-validator, pero doble verificación)
//             if (!parish || !category) {
//                 return res.status(400).json({ 
//                     message: "Server error", 
//                     error: "Parroquia y Actividad Económica son campos obligatorios" 
//                 });
//             }

//             const newTaxpayer = await TaxpayerServices.createTaxpayer({
//                 providenceNum: BigInt(providenceNum),
//                 process,
//                 name,
//                 rif,
//                 contract_type,
//                 officerId,
//                 emition_date,
//                 address,
//                 pdfs: s3Files,
//                 userId: userId,
//                 role: role,
//                 parishId: parish,  // El frontend envía el ID como "parish"
//                 categoryId: category,  // El frontend envía el ID como "category"
//             });

//             return res.status(200).json(newTaxpayer);
//         } catch (error: any) {
//             console.error(error);
//             return res.status(500).json({ message: "Server error", error: error.message });
//         }
//     }
// );

taxpayerRouter.post(
    "/repair-report/:id",
    authenticateToken,
    uploadMemory.single("repairReport"),
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
                console.error("Error verificando acceso:", accessError);
                return res.status(500).json({ error: "Error al verificar permisos de acceso" });
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
                console.error("❌ Failed to create RepairReport record for taxpayer:", taxpayerId);
                return res.status(500).json({ error: "No se pudo crear el registro del acta de reparo" });
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
            console.error("❌ Error during repair report upload flow:", error);

            // Intentar limpiar el registro si ya fue creado
            if (repairReportId) {
                try {
                    await TaxpayerServices.deleteRepairReportById(repairReportId);
                    console.warn(`⚠️ Deleted RepairReport with ID ${repairReportId} due to failure`);
                } catch (deleteError) {
                    console.error(`❌ Failed to delete RepairReport with ID ${repairReportId}:`, deleteError);
                }
            }

            // ✅ CORRECCIÓN: Mensaje de error más claro
            const errorMessage = error.message || "Error desconocido al subir el acta de reparo";
            return res.status(500).json({
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
            });
        }
    }
);

taxpayerRouter.get("/get-taxpayer-categories",
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {
            const categories = await TaxpayerServices.getTaxpayerCategories();

            return res.status(200).json(categories);

        } catch (e) {
            console.error(e)
            return res.status(500).json("couldn't get the taxpayer categories.")
        }
    }
)

taxpayerRouter.get('/get-parish-list',
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")


        try {

            const parishList = await TaxpayerServices.getParishList();

            return res.status(200).json(parishList);

        } catch (e) {
            console.error(e);
            return res.status(500).json("Couldn't get the list of parish.")
        }

    }
)


taxpayerRouter.post(
    '/create-taxpayer',
    authenticateToken,
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
            console.error("API Error en create-taxpayer:", error);
            // ✅ CORRECCIÓN: Mensaje de error más claro y útil para los fiscales
            const errorMessage = error.message || "Error desconocido al crear el contribuyente";
            return res.status(500).json({ 
                error: errorMessage,
                details: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
);


taxpayerRouter.get('/:id',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const taxpayer = await TaxpayerServices.getTaxpayerById(id);


            // console.log('ID:', id);

            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
)



taxpayerRouter.get('/all/:id',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = req.params.id;
            const taxpayers = await TaxpayerServices.getTaxpayersByUser(id);
            return res.status(200).json(taxpayers);
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
);



taxpayerRouter.put("/:id",
    authenticateToken,
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
            console.error(error);
            return res.status(500).json(error.message)
        }
    }

)

taxpayerRouter.put("/modify-observations/:id",
    authenticateToken,
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
        } catch (e) {
            console.error(e);
            return res.status(500).json("Can't update the description");
        }
    }
)

// taxpayerRouter.put("/update-fase/:id",
//     authenticateToken,
//     body("fase").notEmpty().isString(),


//     async (req: Request, res: Response) => {
//         const errors = validationResult(req);
//         if (!errors.isEmpty()) {
//             return res.status(400).json({ errors: errors.array() });
//         }

//         const { user } = req as AuthRequest;
//         const id: string = req.params.id;
//         const { fase } = req.body;

//         const validFases = ["FASE_1", "FASE_2", "FASE_3", "FASE_4"];
//         if (!validFases.includes(fase)) {
//             return res.status(400).json({ error: "Invalid fase value" });
//         }

//         if (!user) return res.status(401).json({ error: "Unauthorized" });
//         if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json({ error: "Forbidden" });

//         const data = {
//             id: id,
//             fase: fase,
//         }

//         try {
//             const updatedFase = await TaxpayerServices.updateFase(data);
//             return res.status(200).json(updatedFase);
//         } catch (e) {
//             console.error(e);
//             return res.status(500).json("Could not update the taxpayer fase");
//         }
//     }
// )

// taxpayerRouter.put("/notify/:id",
//     authenticateToken,

//     async (req: Request, res: Response) => {
//         const errors = validationResult(req);
//         if (!errors.isEmpty()) {
//             return res.status(400).json({ errors: errors.array() });
//         }

//         const { user } = req as AuthRequest;
//         const id: string = req.params.id;

//         if (!user) return res.status(401).json({ error: "Unauthorized" });

//         try {

//             const notified = await TaxpayerServices.notifyTaxpayer(id);

//             return res.status(200).json(notified);
//         } catch (e) {
//             console.error(e);
//             return res.status(500).json({ error: "Error reporting the taxpayer as notified" })
//         }
//     }
// )


taxpayerRouter.put("/updatePayment/:id",
    authenticateToken,
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

        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error updating payment for this fine." })
        }
    }
)


taxpayerRouter.delete('/:id',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const taxpayer = await TaxpayerServices.deleteTaxpayerById(id);
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
)

taxpayerRouter.delete("/del-observation/:id",
    authenticateToken,
    async (req: Request, res: Response) => {
        try {

            const { user } = req as AuthRequest

            if (!user) return res.status(401).json("Unauthorized");

            if (user.role !== "ADMIN") return res.status(403).json("Forbidden");

            const id: string = (req.params.id);
            const observation = await TaxpayerServices.deleteObservation(id);

            return res.status(200).json(observation);

        } catch (e) {
            console.error("Error erasing the observation");
            return res.status(500).json("Couldn't erase the observation");
        }
    }
)

taxpayerRouter.get('/event/:id/:type?',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const type: string = req.params.type


            const events = await TaxpayerServices.getEventsbyTaxpayer(id, type)
            // console.log("EVENTS: " + JSON.stringify(events))
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.get('/data/:id',
    authenticateToken,

    async (req: Request, res: Response) => {

        try {

            const id: string = (req.params.id);

            const data = await TaxpayerServices.getTaxpayerData(id)

            return res.status(200).json(data);

        } catch (e) {
            console.error(e);
            return res.status(500).json("Ha ocurrido un error.")
        }
    }
)



taxpayerRouter.get('/event/all',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const events = await TaxpayerServices.getEventsbyTaxpayer()
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)



taxpayerRouter.get("/get-observations/:id",
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {

            const id: string = (req.params.id);
            const observations = await TaxpayerServices.getObservations(id);

            return res.status(200).json(observations);

        } catch (e) {
            console.error("Error getting observations: " + e);
            return res.status(500).json("Error getting the observations");
        }
    }
)

taxpayerRouter.get('/get-islr/:id',
    authenticateToken,

    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        try {

            const id: string = req.params.id;

            const islrReport = await TaxpayerServices.getIslrReports(id);

            return res.status(200).json(islrReport);

        } catch (e: any) {
            console.error(e);
            return res.status(500).json(e);
        }
    }
)

taxpayerRouter.get("/getTaxSummary/:id",
    authenticateToken,

    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        const id: string = (req.params.id);

        try {

            const taxSummary = await TaxpayerServices.getTaxpayerSummary(id);

            return res.status(200).json(taxSummary);

        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Can not get the Tax Summary for this taxpayer." })
        }

    }


)

taxpayerRouter.post('/fine',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("description").isString().notEmpty(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.error(errors.array())
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body, debt: req.body.amount, type: EventType.FINE }
            const fine = await TaxpayerServices.createEvent(input)
            return res.status(200).json(fine)
        } catch (error: any) {
            console.error("Error en fine:", error);
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
            console.error(errors.array())
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
            return res.status(500).json(error.message)
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

            console.log(newIndexIva);
            console.log(taxpayerId);

            const index = await TaxpayerServices.modifyIndexIva(new Decimal(newIndexIva), taxpayerId);
            return res.status(200).json(index)
        } catch (error: any) {
            console.error(error);
            return res.status(500).json(error.message)
        }
    }
)



taxpayerRouter.post('/createIVA',
    authenticateToken,
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
            console.error(errors.array())
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")

        const data = req.body;

        if (!data.iva && !data.excess) return res.status(400).json("Either IVA or Excess must be provided");


        console.log("Received IVA data:", req.body);

        try {
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const response = await TaxpayerServices.createIVA(data, user.id, user.role)

            return res.status(200).json(response);

        } catch (e: any) {
            console.error(e);


            if (e.message === "IVA report for this taxpayer and month already exists.") {
                return res.status(400).json({ error: e.message });
            }

            return res.status(500).json({ error: "Error creating the report." })

        }
    }
)



taxpayerRouter.post('/create-islr-report',
    authenticateToken,
    body("incomes").isDecimal(),
    body("costs").isDecimal(),
    body("expent").isDecimal(),
    body("emition_date").isISO8601().notEmpty(),
    body("taxpayerId").isString().notEmpty(),
    body("paid").notEmpty(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")


        const input = { ...req.body }

        const emitionYear = new Date(input.emition_date).getFullYear();
        try {
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const report = await TaxpayerServices.createISLR(input, user.id, user.role);

            return res.status(200).json(report);

        } catch (e: any) {

            if (e.message === `ISLR Report for this taxpayer in: ${emitionYear} was already created`) {
                return res.status(400).json({ error: e.message });
            }

            console.error(e);
            return res.status(500).json(e);
        }
    }
)

taxpayerRouter.post('/payment',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("eventId").isNumeric(),
    body("taxpayerId").isString(),
    body("debt").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body }
            const payment = await TaxpayerServices.createPayment(input)
            return res.status(200).json(payment)
        } catch (error: any) {

            if (error.name === "AmountError") {
                return res.status(400).json({ error: error.message })
            }

            console.error(error)
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.post("/observations",
    authenticateToken,
    body("description").notEmpty().isString(),
    body("date").notEmpty().isString().isISO8601(),
    body("taxpayerId").notEmpty().isString(),

    async (req: Request, res: Response) => {

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }


        try {
            const input = { ...req.body }

            const observation = await TaxpayerServices.createObservation(input);

            return res.status(200).json(observation);

        } catch (e) {
            console.error("Error: ", e)
            return res.status(500).json(e);
        }
    }
)


taxpayerRouter.post('/payment_compromise',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("fineEventId").isString().notEmpty(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        
        try {
            const input = { ...req.body, type: EventType.PAYMENT_COMPROMISE }
            const payment_compromise = await TaxpayerServices.createEvent(input)
            return res.status(200).json(payment_compromise)
        } catch (error: any) {
            console.error("Error en payment_compromise:", error);
            
            if (error.name === "AmountError") {
                return res.status(400).json({ error: error.message })
            }
            
            // Retornar mensaje de error más descriptivo
            const errorMessage = error.message || "Error al crear el compromiso de pago";
            return res.status(400).json({ error: errorMessage })
        }
    }
)





taxpayerRouter.post('/warning',
    authenticateToken,
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
            console.error("Error en warning:", error);
            const errorMessage = error.message || "Error al crear el aviso";
            return res.status(400).json({ error: errorMessage })
        }
    }
)



taxpayerRouter.put('/fine/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    body("description").isString().optional({ checkFalsy: true }),
    body("type").isString().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const eventId = req.params.eventId;
            const input = { ...req.body };
            const fine = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(fine);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ error: error.message });
        }
    }
);

taxpayerRouter.put('/updateIva/:ivaId',
    authenticateToken,
    // Agrega validaciones opcionales si deseas (date, iva, etc.)
    async (req: Request, res: Response) => {
        try {
            const { user } = req as AuthRequest;
            const ivaId = req.params.ivaId;
            const input = { ...req.body };
            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const updated = await TaxpayerServices.updateIvaReport(ivaId, input, user?.id, user?.role);
            return res.status(200).json(updated);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ message: error.message });
        }
    }
);

taxpayerRouter.put('/payment/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const payment = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(payment);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

taxpayerRouter.put(
    '/update-taxpayer/:id',
    authenticateToken,
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
        } catch (err) {
            console.error(err);
            return res.status(500).json("Error al actualizar el contribuyente");
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
    body("culminated").isBoolean().notEmpty(), 

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
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

            return res.status(201).json(culminatedSuccesfully);

        } catch (e: any) {
            console.error(e);
            return res.status(500).json({ message: e.message || "Error al culminar el caso" });
        }


    }
)

taxpayerRouter.put('/payment_compromise/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const payment_compromise = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(payment_compromise);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

taxpayerRouter.put('/warning/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const warning = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(warning);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

taxpayerRouter.put("/update-islr/:id",
    authenticateToken,

    async (req: Request, res: Response) => {

        try {

            const { user } = req as AuthRequest

            if (!user) return res.status(401).json("Unauthorized access")
            if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden")


            const id: string = req.params.id;
            const input = req.body;

            // ✅ Pasar userId y userRole para validación de acceso de fiscales rotados
            const updatedIslr = await TaxpayerServices.updateIslr(id, input, user.id, user.role)

            return res.status(201).json(updatedIslr);

        } catch (e) {
            console.error(e);
            return res.status(500).json("Server error.")
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

            console.log("ID: " + id);

            const event = await TaxpayerServices.deleteEvent(id)
            return res.status(200).json(event)
        } catch (error: any) {
            console.error(error);
            return res.status(500).json(error.message)
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
            return res.status(200).json(event)
        } catch (error: any) {
            console.error(error);
            return res.status(500).json(error.message)
        }
    }
);

taxpayerRouter.delete("/delete-iva/:id",
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")

        try {
            const id: string = req.params.id;

            const ivaReport = await TaxpayerServices.deleteIva(id);

            return res.status(201).json(ivaReport);

        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: "Server error." })
        }
    }
);



taxpayerRouter.delete("/delete-islr/:id",
    authenticateToken,
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")
        try {
            const id: string = req.params.id;

            const islrReport = await TaxpayerServices.deleteIslr(id);

            return res.status(201).json(islrReport);
        } catch (e) {
            console.error(e);
            throw new Error("Server error.");
        }
    }
)


taxpayerRouter.post("/create-taxpayer-category",
    authenticateToken,
    body("name"),

    async (req: Request, res: Response) => {
        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        if (user.role !== "ADMIN") return res.status(403).json("Forbidden")

        const { name } = req.body;

        try {
            const response = await TaxpayerServices.CreateTaxpayerCategory(name);

            return res.status(201).json("New category created successfully: " + response);
        } catch (e) {
            console.error(e);
            return res.status(500).json("Something went wrong.")
        }
    }
)

