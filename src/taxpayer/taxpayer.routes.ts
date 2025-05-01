import express from "express";
import type { Request, Response } from "express";
import * as TaxpayerServices from "./taxpayer.services"
import { body, validationResult } from 'express-validator';
import { EventType } from "./taxpayer.utils";
import { authenticateToken } from "../users/user.utils";
import multer, { StorageEngine } from "multer";
import path from "path";
import fs from 'fs'
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createLocalUpload } from "../utils/multer.local";
// import upload from "../utils/multer.s3";

const s3 = new S3Client({ region: "us-east-2" }); // Replace "your-region" with your AWS region
export const taxpayerRouter = express.Router();


const uploadLocal = createLocalUpload([
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

taxpayerRouter.post(
    '/',
    authenticateToken,
    uploadLocal.array("pdfs", 20), // sube solo al disco local
    body("providenceNum").isNumeric(),
    body("process").isString(),
    body("name").isString(),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid"),
    body("contract_type").isString(),
    body("officerId").isString(),
    body("address").notEmpty(),
    body("description").notEmpty(),
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

            const { providenceNum, process, name, rif, contract_type, officerId, address, description, emition_date } = req.body;

            

            const newTaxpayer = await TaxpayerServices.createTaxpayer({
                providenceNum: BigInt(providenceNum),
                process,
                name,
                rif,
                contract_type,
                officerId,
                description,
                emition_date,
                address,
                pdfs: s3Files,
            });

            return res.status(200).json(newTaxpayer);
        } catch (error: any) {
            console.error(error);
            return res.status(500).json({ message: "Server error", error: error.message });
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

taxpayerRouter.post('/fine',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString(),
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



