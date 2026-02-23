import { Router } from "express";
import type { Request, Response } from "express";
import * as CensusServices from "./census-services"
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from "../users/user-utils";
import logger from "../utils/logger";
import { ApiError } from "../utils/api-response";
import { cacheMiddleware, invalidateCacheMiddleware } from "../utils/cache-middleware";

export const censusRouter = Router();


censusRouter.post(
    '/',
    authenticateToken,
    invalidateCacheMiddleware(['census', 'census-list']),
    body("number").isNumeric(),
    body("process").isString(),
    body("name").isString(),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid"),
    body("type").isString(),
    body("userId").isString(),
    body("address").notEmpty(),
    body("emition_date").notEmpty().isString(),

    async (req: Request, res: Response) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("census validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }



        try {

            const { user } = req as AuthRequest;
            const role = user?.role;

            const { number, process, name, rif, type, userId, address, emition_date } = req.body;


            const newTaxpayerCensus = await CensusServices.createTaxpayerCensus({
                number: Number(number),
                process,
                name,
                rif,
                type,
                userId,
                emition_date: new Date(emition_date),
                address,
                role: role,
            });

            return res.status(200).json(newTaxpayerCensus);
        } catch (error: any) {
            logger.error("create-census error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al crear el censo");
        }
    }
);


censusRouter.get('/getCensus',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['census', 'census-list'], includeUser: true }),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }

        try {
            const taxpayer = await CensusServices.getTaxpayerCensus();

            return res.status(200).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }

    }
)

censusRouter.delete('/delete-census/:id',
    authenticateToken,
    invalidateCacheMiddleware(['census', 'census-list']),
    async (req: Request, res: Response) => {

        const { user } = req as AuthRequest;

        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden.")

        const id: string = req.params.id;

        try {
            const taxpayer = await CensusServices.deleteTaxpayerCensus(id);

            return res.status(201).json(taxpayer)
        } catch (error: any) {
            return res.status(500).json(error.message);
        }

    }
)


