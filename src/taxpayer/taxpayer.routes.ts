import express from "express";
import type { Request, Response } from "express";
import * as TaxpayerServices from "./taxpayer.services"
import { body, validationResult } from 'express-validator';
import { EventType } from "./taxpayer.utils";
import { authenticateToken, AuthRequest } from "../users/user.utils";
// import multer, { StorageEngine } from "multer";
// import path from "path";
import fs from 'fs'
import { S3Client, PutObjectCommand, GetObjectCommand} from "@aws-sdk/client-s3";
import { createLocalUpload } from "../utils/multer.local";
import { uploadMemory } from "../utils/multer.memory";
// import { commonParams } from "@aws-sdk/client-s3/dist-types/endpoint/EndpointParameters";

const s3 = new S3Client({ region: "us-east-2" }); // Replace "your-region" with your AWS region
export const taxpayerRouter = express.Router();


const uploadLocal = createLocalUpload([
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);


taxpayerRouter.get('/download-repair-report/:key',
    authenticateToken,

    async (req: Request, res: Response) => {
        try {

            const key: string = decodeURIComponent(req.params.key);

            const presignedUrl = await TaxpayerServices.generateDownloadUrl(key);

            return res.status(201).json(presignedUrl);

        } catch (e) {
            console.error(e);
            return res.status(500).json({message: "Couldn't generate a repair report url"})
        }

    }
)




taxpayerRouter.post(
    '/',
    authenticateToken,
    uploadLocal.array("pdfs", 20),
    body("providenceNum").isNumeric(),
    body("process").isString(),
    body("name").isString(),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid"),
    body("contract_type").isString(),
    body("officerId").isString(),
    body("address").notEmpty(),
    body("emition_date").notEmpty().isString(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            // Delete local files if validation fails
            for (const file of req.files as Express.Multer.File[]) {
                await fs.promises.unlink(file.path);
            }
            return res.status(400).json({ errors: errors.array() });
        }

        try {

            const { user } = req as AuthRequest;
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

            const { providenceNum, process, name, rif, contract_type, officerId, address, emition_date } = req.body;



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
            });

            return res.status(200).json(newTaxpayer);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ message: "Server error", error: error.message });
        }
    }
);

taxpayerRouter.post(
    "/repair-report/:id",
    authenticateToken,
    uploadMemory.single("repairReport"),
    async (req: Request, res: Response) => {
        const taxpayerId = req.params.id;

        if (!req.file) {
            return res.status(400).json({ error: "PDF file is required" });
        }

        const file = req.file;
        const s3Key = `repair-reports/${Date.now()}-${file.originalname}`;
        const pdf_url = `https://sacbucketgeneral.s3.amazonaws.com/${s3Key}`;

        let repairReportId: string | null = null;

        try {
            // Paso 1: Crear el registro sin el PDF
            const newRepairReport = await TaxpayerServices.uploadRepairReport(taxpayerId, "");

            if (!newRepairReport || !newRepairReport.id) {
                console.error("❌ Failed to create RepairReport record for taxpayer:", taxpayerId);
                return res.status(500).json({ error: "Could not create RepairReport record" });
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

            return res.status(500).json({
                error: "An error occurred while uploading the file or saving the repair report",
                details: error?.message || "Unknown error",
            });
        }
    }
);

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
    async (req: Request, res: Response) => {
        try {
            const { user } = req as AuthRequest;

            if (!user) return res.status(401).json({ error: "Unauthorized access" });
            if (!["ADMIN", "COORDINATOR", "FISCAL"].includes(user.role)) {
                return res.status(403).json({ error: "Forbidden role" });
            }

            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({ errors: errors.array() });
            }

            const response = await TaxpayerServices.createTaxpayerExcel(req.body);
            return res.status(201).json(response);

        } catch (error: any) {
            console.error("API Error:", error);
            return res.status(500).json({ error: error.message || "Internal Server Error" });
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
            const input = req.body
            const id: string = (req.params.id);
            const updatedTaxpayer = await TaxpayerServices.updateTaxpayer(id, input)
            return res.status(200).json(updatedTaxpayer)
        } catch (error: any) {
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

taxpayerRouter.put("/update-fase/:id",
    authenticateToken,
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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR") return res.status(403).json({ error: "Forbidden" });

        const data = {
            id: id,
            fase: fase,
        }

        try {
            const updatedFase = await TaxpayerServices.updateFase(data);
            return res.status(200).json(updatedFase);
        } catch (e) {
            console.error(e);
            return res.status(500).json("Could not update the taxpayer fase");
        }
    }
)

taxpayerRouter.put("/notify/:id",
    authenticateToken,

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
        } catch (e) {
            console.error(e);
            return res.status(500).json({ error: "Error reporting the taxpayer as notified" })
        }
    }
)


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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL") return res.status(403).json("Forbidden")

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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL") return res.status(403).json("Forbidden")

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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL") return res.status(403).json("Forbidden")

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
    body("taxpayerId").isString(),
    body("description").isString(),
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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL") return res.status(403).json("Forbidden")

        const data = req.body;

        if (!data.iva && !data.excess) return res.status(400).json("Either IVA or Excess must be provided");


        console.log("Received IVA data:", req.body);

        try {
            const response = await TaxpayerServices.createIVA(data)

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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL") return res.status(403).json("Forbidden")


        const input = { ...req.body }

        const emitionYear = new Date(input.emition_date).getFullYear();
        try {

            const report = await TaxpayerServices.createISLR(input);

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
    body("date").toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, type: EventType.PAYMENT_COMPROMISE }
            const payment_compromise = await TaxpayerServices.createEvent(input)
            return res.status(200).json(payment_compromise)
        } catch (error: any) {

            if (error.name === "AmountError") {
                return res.status(400).json({ error: error.message })
            }

            console.error(error)
            return res.status(500).json(error.message)
        }
    }
)





taxpayerRouter.post('/warning',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("amount").isNumeric(),
    body("taxpayerId").isString(),
    body("fineEventId").isString(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, type: EventType.WARNING }
            const warning = await TaxpayerServices.createEvent(input)
            return res.status(200).json(warning)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)



taxpayerRouter.put('/fine/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const fine = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(fine);
        } catch (error: any) {
            return res.status(500).json(error.message);
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
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL") return res.status(403).json("Forbidden")


        try {

            const id: string = req.params.id;
            const culminated = req.body

            const culminatedSuccesfully = await TaxpayerServices.updateCulminated(id, culminated);

            return res.status(201).json(culminatedSuccesfully);

        } catch (e) {
            console.error(e);
            return res.status(500).json({ message: e });
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

taxpayerRouter.delete('/event/:id',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const event = await TaxpayerServices.deleteEvent(id)
            return res.status(200).json(event)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
);

taxpayerRouter.delete('/payment/:id',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = (req.params.id);
            const event = await TaxpayerServices.deletePayment(id)
            return res.status(200).json(event)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
);



