import { Router } from "express";
import type { Request, Response } from "express";
import { authenticateToken, AuthRequest } from "../users/user-utils";
import * as TaxpayerIndexIvaService from "./taxpayer-index-iva.services";
import logger from "../utils/logger";

export const taxpayerIndexIvaRouter = Router();

/**
 * POST /taxpayer-index-iva
 * Creates a custom IVA index for a taxpayer.
 * Body: { taxpayerId, baseAmount, notes?, expiresAt? }
 */
taxpayerIndexIvaRouter.post(
    "/",
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { taxpayerId, baseAmount, notes, expiresAt } = req.body;
            const assignedById = (req as AuthRequest).user?.id;

            if (!taxpayerId || baseAmount === undefined || baseAmount === null) {
                return res.status(400).json({
                    message: "taxpayerId y baseAmount son requeridos.",
                });
            }

            if (typeof baseAmount !== "number" || baseAmount <= 0) {
                return res.status(400).json({
                    message: "baseAmount debe ser un número mayor a 0.",
                });
            }

            if (!assignedById) {
                return res.status(401).json({ message: "No autorizado." });
            }

            const result = await TaxpayerIndexIvaService.createTaxpayerIndexIva({
                taxpayerId,
                baseAmount,
                assignedById,
                notes,
                expiresAt: expiresAt ? new Date(expiresAt) : undefined,
            });

            return res.status(201).json(result);
        } catch (error: any) {
            logger.error("[TAXPAYER_INDEX_IVA] POST / failed", { error: error?.message });
            return res.status(500).json({ message: error?.message || "Error al crear el índice IVA personalizado." });
        }
    }
);

/**
 * GET /taxpayer-index-iva/:taxpayerId
 * Gets the active custom IVA index for a taxpayer.
 */
taxpayerIndexIvaRouter.get(
    "/:taxpayerId",
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { taxpayerId } = req.params;
            const result = await TaxpayerIndexIvaService.getActiveTaxpayerIndexIva(taxpayerId);
            return res.status(200).json(result);
        } catch (error: any) {
            logger.error("[TAXPAYER_INDEX_IVA] GET /:taxpayerId failed", { error: error?.message });
            return res.status(500).json({ message: error?.message || "Error al obtener el índice IVA personalizado." });
        }
    }
);

/**
 * GET /taxpayer-index-iva/:taxpayerId/history
 * Gets the full history of IVA indices for a taxpayer.
 */
taxpayerIndexIvaRouter.get(
    "/:taxpayerId/history",
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { taxpayerId } = req.params;
            const result = await TaxpayerIndexIvaService.getTaxpayerIndexIvaHistory(taxpayerId);
            return res.status(200).json(result);
        } catch (error: any) {
            logger.error("[TAXPAYER_INDEX_IVA] GET /:taxpayerId/history failed", { error: error?.message });
            return res.status(500).json({ message: error?.message || "Error al obtener el historial." });
        }
    }
);

/**
 * PATCH /taxpayer-index-iva/:id/deactivate
 * Deactivates a specific custom IVA index.
 */
taxpayerIndexIvaRouter.patch(
    "/:id/deactivate",
    authenticateToken,
    async (req: Request, res: Response) => {
        try {
            const { id } = req.params;
            const result = await TaxpayerIndexIvaService.deactivateTaxpayerIndexIva(id);
            return res.status(200).json(result);
        } catch (error: any) {
            logger.error("[TAXPAYER_INDEX_IVA] PATCH /:id/deactivate failed", { error: error?.message });
            return res.status(500).json({ message: error?.message || "Error al desactivar el índice IVA personalizado." });
        }
    }
);
