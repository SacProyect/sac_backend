import express from "express";
import type { Request, Response } from "express";
import * as TaxpayerServices from "./taxpayer.services"
import { body, validationResult } from 'express-validator';
import { EventType } from "./taxpayer.utils";


export const taxpayerRouter = express.Router();

taxpayerRouter.get('/:id',
    async (req: Request, res: Response) => {
        try {
            const id: number = parseInt(req.params.id, 10);
            const taxpayer = await TaxpayerServices.getTaxpayerById(id);
            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
)

taxpayerRouter.get('/all/:id',
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

taxpayerRouter.post('/',
    body("nroProvidencia").isInt(),
    body("procedimiento").isString(),
    body("nombre").isString(),
    body("rif").isString(),
    body("tipoContrato").isString(),
    body("funcionarioId").isString(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = req.body
            const newTaxpayer = await TaxpayerServices.createTaxpayer(input)
            return res.status(200).json(newTaxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
);


taxpayerRouter.get('/event/:id',
    async (req: Request, res: Response) => {
        try {
            const id: number = parseInt(req.params.id, 10);
            const events = await TaxpayerServices.getEventsbyTaxpayer(id)
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.post('/multa',
    body("fecha").isISO8601().toDate(),
    body("monto").isDecimal(),
    body("contribuyenteId").isNumeric(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body, tipo: EventType.MULTA }
            const multa = await TaxpayerServices.createEvent(input)
            return res.status(200).json(multa)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.post('/pago',
    body("fecha").isDate(),
    body("monto").isDecimal(),
    body("contribuyenteId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, tipo: EventType.PAGO }
            const pago = await TaxpayerServices.createEvent(input)
            return res.status(200).json(pago)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)
taxpayerRouter.post('/compromiso_pago',
    body("fecha").isDate(),
    body("monto").isDecimal(),
    body("contribuyenteId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, tipo: EventType.COMPROMISO_PAGO }
            const compromiso_pago = await TaxpayerServices.createEvent(input)
            return res.status(200).json(compromiso_pago)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.post('/aviso',
    body("fecha").isDate(),
    body("monto").isDecimal(),
    body("contribuyenteId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, tipo: EventType.AVISO }
            const aviso = await TaxpayerServices.createEvent(input)
            return res.status(200).json(aviso)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
)