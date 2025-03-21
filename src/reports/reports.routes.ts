import { Router } from "express";
import type { Request, Response } from "express";
import * as ReportService from './reports.services'
import { authenticateToken } from "../users/user.utils";

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


reportRouter.get('/pending/:id?',
    //authenticateToken,
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