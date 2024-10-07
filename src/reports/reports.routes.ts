import { Router } from "express";
import type { Request, Response } from "express";
import * as ReportService from './reports.services'
import { body, validationResult } from "express-validator";

export const reportRouter = Router();

reportRouter.get('/kpi',
    async (req: Request, res: Response) => {
        try {
            const KPI = await ReportService.getKPI()
            return res.status(200).json(KPI)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

reportRouter.get('/multa/:id?',
    async (req: Request, res: Response) => {
        try {
            let id: number | undefined = undefined;
            if (req.params.id) {
                id = parseInt(req.params.id, 10)
            }
            const fineHistory = await ReportService.getFineHistory(id)
            res.status(200).json(fineHistory)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

reportRouter.get('/pagos/:id?',
    async (req: Request, res: Response) => {
        try {
            let id: number | undefined = undefined;
            if (req.params.id) {
                id = parseInt(req.params.id, 10)
            }
            const paymentHistory = await ReportService.getPaymentHistory(id)
            res.status(200).json(paymentHistory)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)