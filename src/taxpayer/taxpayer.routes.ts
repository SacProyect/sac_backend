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
            const id: string = (req.params.id);
            const taxpayer = await TaxpayerServices.getTaxpayerById(id);


            console.log('ID:', id);

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
    body("providenceNum").isInt(),
    body("process").isString(),
    body("name").isString(),
    body("rif").isString(),
    body("contract_type").isString(),
    body("officerId").isString(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = req.body
            input.providenceNum = parseInt(input.providenceNum, 10)
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

taxpayerRouter.post('/fine',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isNumeric(),
    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body, tipo: EventType.fine }
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
    body("taxpayerId").isNumeric(),
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
taxpayerRouter.post('/payment_compromise',
    authenticateToken,
    body("date").toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, tipo: EventType.payment_compromise }
            const payment_compromise = await TaxpayerServices.createEvent(input)
            return res.status(200).json(payment_compromise)
        } catch (error: any) {
            console.error(error)
            return res.status(500).json(error.message)
        }
    }
)

taxpayerRouter.post('/warning',
    authenticateToken,
    body("date").isISO8601().toDate(),
    body("taxpayerId").isNumeric(),
    async (req: Request, res: Response) => {
        try {
            const input = { ...req.body, tipo: EventType.WARNING}
            const aviso = await TaxpayerServices.createEvent(input)
            return res.status(200).json(aviso)
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

taxpayerRouter.put('/pago/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
            const input = { ...req.body };
            const pago = await TaxpayerServices.updateEvent(eventId, input);
            return res.status(200).json(pago);
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

taxpayerRouter.put('/aviso/:eventId',
    authenticateToken,
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    async (req: Request, res: Response) => {
        try {
            const eventId = (req.params.eventId);
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