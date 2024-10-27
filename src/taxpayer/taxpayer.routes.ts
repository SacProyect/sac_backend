import express from "express";
import type { Request, Response } from "express";
import * as TaxpayerServices from "./taxpayer.services"
import { body, validationResult } from 'express-validator';
import { EventType } from "./taxpayer.utils";
import { authenticateToken } from "../users/user.utils";


export const taxpayerRouter = express.Router();

taxpayerRouter.get('/:id',
    authenticateToken,
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

taxpayerRouter.post('/',
    authenticateToken,
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
            input.nroProvidencia = parseInt(input.nroProvidencia, 10)
            const newTaxpayer = await TaxpayerServices.createTaxpayer(input)
            return res.status(200).json(newTaxpayer)
        } catch (error: any) {
            console.error(error)
            return res.status(500).json(error.message)
        }
    }
);

taxpayerRouter.put("/:id",
    authenticateToken,
    body("nroProvidencia").isInt().optional({ values: 'falsy' }),
    body("procedimiento").isString().optional({ values: 'falsy' }),
    body("nombre").isString().optional({ values: 'falsy' }),
    body("rif").isString().optional({ values: 'falsy' }),
    body("tipoContrato").isString().optional({ values: 'falsy' }),
    body("funcionarioId").isString().optional({ values: 'falsy' }),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = req.body
            const id: number = parseInt(req.params.id, 10);
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
            const id: number = parseInt(req.params.id, 10);
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
            const id: number = parseInt(req.params.id, 10);
            const type: string = req.params.type
            const events = await TaxpayerServices.getEventsbyTaxpayer(id, type)
            return res.status(200).json(events)
        } catch (error: any) {
            return res.status(500).json(error.message)
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

taxpayerRouter.post('/multa',
    authenticateToken,
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
    authenticateToken,
    body("fecha").isISO8601().toDate(),
    body("monto").isDecimal(),
    body("eventoId").isNumeric(),
    body("contribuyenteId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body }
            const pago = await TaxpayerServices.createPayment(input)
            return res.status(200).json(pago)
        } catch (error: any) {
            console.error(error)
            return res.status(500).json(error.message)
        }
    }
)
taxpayerRouter.post('/compromiso_pago',
    authenticateToken,
    body("fecha").toDate(),
    body("monto").isDecimal(),
    body("contribuyenteId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, tipo: EventType.COMPROMISO_PAGO }
            const compromiso_pago = await TaxpayerServices.createEvent(input)
            return res.status(200).json(compromiso_pago)
        } catch (error: any) {
            console.error(error)
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.post('/aviso',
    authenticateToken,
    body("fecha").isISO8601().toDate(),
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
taxpayerRouter.put('/multa/:eventId',
    authenticateToken,
    body("fecha").isISO8601().toDate().optional({ checkFalsy: true }),
    body("monto").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const eventId = parseInt(req.params.eventId);
            const input = { ...req.body };
            const multa = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(multa);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

taxpayerRouter.put('/pago/:eventId',
    authenticateToken,
    body("fecha").isISO8601().toDate().optional({ checkFalsy: true }),
    body("monto").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = parseInt(req.params.eventId);
            const input = { ...req.body };
            const pago = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(pago);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

taxpayerRouter.put('/compromiso_pago/:eventId',
    authenticateToken,
    body("fecha").isISO8601().toDate().optional({ checkFalsy: true }),
    body("monto").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = parseInt(req.params.eventId);
            const input = { ...req.body };
            const compromiso_pago = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(compromiso_pago);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);

taxpayerRouter.put('/aviso/:eventId',
    authenticateToken,
    body("fecha").isISO8601().toDate().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = parseInt(req.params.eventId);
            const input = { ...req.body };
            const aviso = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(aviso);
        } catch (error: any) {
            return res.status(500).json(error.message);
        }
    }
);
taxpayerRouter.delete('/event/:id',
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const id: number = parseInt(req.params.id, 10);
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
            const id: number = parseInt(req.params.id, 10);
            const event = await TaxpayerServices.deletePayment(id)
            return res.status(200).json(event)
        } catch (error: any) {
            return res.status(500).json(error.message)
        }
    }
);