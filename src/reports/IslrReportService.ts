/**
 * Servicio de reportes y datos específicos de ISLR.
 * Desacopla la lógica de consulta y agregación de ISLRReports del servicio principal.
 */

import { db } from "../utils/db-server";
import { Decimal } from "@prisma/client/runtime/library";
import logger from "../utils/logger";

/**
 * Obtiene reportes ISLR de un contribuyente en un rango de fechas (emition_date).
 */
export async function getIslrReportsForTaxpayerInPeriod(
    taxpayerId: string,
    start: Date,
    end: Date
) {
    try {
        return await db.iSLRReports.findMany({
            where: {
                taxpayerId,
                emition_date: { gte: start, lte: end },
            },
            select: { id: true, emition_date: true, paid: true, incomes: true, costs: true, expent: true },
            orderBy: { emition_date: "asc" },
        });
    } catch (e) {
        logger.error("[REPORTS] getIslrReportsForTaxpayerInPeriod failed", {
            taxpayerId,
            start: start.toISOString(),
            end: end.toISOString(),
            error: e,
        });
        throw new Error("Error al obtener reportes ISLR del contribuyente.");
    }
}

/**
 * Devuelve el total pagado (ISLR) por cada taxpayerId en el período.
 * Útil para reportes por grupo o consolidados.
 */
export async function getIslrTotalsByTaxpayerIds(
    taxpayerIds: string[],
    start: Date,
    end: Date
): Promise<Map<string, number>> {
    if (taxpayerIds.length === 0) return new Map();

    try {
        const reports = await db.iSLRReports.findMany({
            where: {
                taxpayerId: { in: taxpayerIds },
                emition_date: { gte: start, lte: end },
            },
            select: { taxpayerId: true, paid: true },
        });

        const map = new Map<string, number>();
        for (const r of reports) {
            const current = map.get(r.taxpayerId) ?? 0;
            map.set(r.taxpayerId, current + Number(r.paid ?? 0));
        }
        return map;
    } catch (e) {
        logger.error("[REPORTS] getIslrTotalsByTaxpayerIds failed", {
            taxpayerCount: taxpayerIds.length,
            start: start.toISOString(),
            end: end.toISOString(),
            error: e,
        });
        throw new Error("Error al agregar ISLR por contribuyentes.");
    }
}

/**
 * Suma total de ISLR recaudado en un período (todos los contribuyentes o filtrado por IDs).
 */
export async function getIslrTotalInPeriod(
    start: Date,
    end: Date,
    taxpayerIds?: string[]
): Promise<number> {
    try {
        const where: { emition_date: { gte: Date; lte: Date }; taxpayerId?: { in: string[] } } = {
            emition_date: { gte: start, lte: end },
        };
        if (taxpayerIds != null && taxpayerIds.length > 0) {
            where.taxpayerId = { in: taxpayerIds };
        }

        const result = await db.iSLRReports.aggregate({
            where,
            _sum: { paid: true },
        });

        const sum = result._sum?.paid;
        return sum != null ? Number(sum) : 0;
    } catch (e) {
        logger.error("[REPORTS] getIslrTotalInPeriod failed", {
            start: start.toISOString(),
            end: end.toISOString(),
            error: e,
        });
        throw new Error("Error al calcular total ISLR en el período.");
    }
}
