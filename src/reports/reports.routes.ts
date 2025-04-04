import { Router } from "express";
import type { Request, Response } from "express";
import * as ReportService from './reports.services'
import { authenticateToken, AuthRequest } from "../users/user.utils";
import { body, validationResult } from 'express-validator';
import { createError } from "./reports.services";
import multer, { StorageEngine } from "multer";
import path from "path";


export const reportRouter = Router();


// Configure Multer storage (saving images to 'uploads/' directory)
const storage: StorageEngine = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
        cb(null, path.resolve(__dirname, "../../uploads"));  // Define where the files should be stored
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
        cb(null, `${Date.now()}-${file.originalname}`); // Unique filename
    }
});

const upload = multer({ storage });


reportRouter.get('/kpi',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const KPI = await ReportService.getKPI()
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




reportRouter.post('/errors',
    authenticateToken,
    body("title").isString().optional(),
    body("description").isString().notEmpty(),
    body("type").isString(),
    body("img_src").isString().optional(),
    body("img_alt").isString().optional(),
    body("userId").isString().notEmpty(),


    async (req: Request, res: Response) => {


        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }


        try {
            const { title, description, type, userId } = req.body

            // Extract uploaded images
            const images = (req.files as Express.Multer.File[])?.map((file) => ({
                img_src: `/uploads/${file.filename}`, // Store path relative to server
                img_alt: file.originalname
            })) || [];

            // Call createError function with the extracted data
            const err = await ReportService.createError({
                title,
                description,
                type,
                userId,
                images
            });


            upload.array("images", 10) // max of 10 images

            return res.status(200).json(err);

        } catch (e) {
            console.error(e)
            return res.status(500).json(e)
        }
    }
)

reportRouter.get('/pending/:id?',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: string = req.params.id;
            const events = await ReportService.getPendingPayments(id)
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

reportRouter.get('/fiscal-groups',
    authenticateToken,
    async (req: Request, res: Response) => {

        const {user} = req as AuthRequest

        if (!user) return res.status(403).json("Unauthorized access")

        const role = user.role 

        // Object for filtering based on the params
        const {id, startDate, endDate} = req.query

        const filterParams: {id?: string; startDate?: string; endDate?: string;} = {}

        if (id) filterParams.id = id as string;
        if (startDate) filterParams.startDate = startDate as string;
        if (endDate) filterParams.endDate = endDate as string;

        try {

            const getGroups = await ReportService.getFiscalGroups({role, ...filterParams})
            
            return res.status(200).json(getGroups);
        } catch (e) {
            console.log(e)
            return res.status(500).json("Error returning groups")
        }

    }
)