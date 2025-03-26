import { Router } from "express";
import type { Request, Response } from "express";
import * as ReportService from './reports.services'
import { authenticateToken } from "../users/user.utils";
import { body, validationResult } from 'express-validator';
import { createError } from "./reports.services";


export const reportRouter = Router();

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
            const input = req.body
            const err = await ReportService.createError(input)

            return res.status(200).json(err);

        } catch (e) {
            console.error(e)
            throw e
        }
    }
)