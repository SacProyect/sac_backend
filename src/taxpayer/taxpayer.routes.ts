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

taxpayerRouter.put("/:id",
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
            return res.status(500).json(error.message)
        }
    }
)
taxpayerRouter.post('/compromiso_pago',
    body("fecha").isISO8601().toDate(),
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