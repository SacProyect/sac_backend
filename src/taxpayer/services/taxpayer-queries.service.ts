/**
 * Taxpayer Queries Service - Consultas complejas y estadísticas de contribuyentes (Sprint 2).
 * Solo lectura; queries Prisma con múltiples joins e includes.
 */

import { db } from '../../utils/db-server';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../../utils/logger';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { IndexIvaService } from './index-iva.service';
import { EventService } from './event.service';

// getEventsbyTaxpayer ahora vive en EventService (migrado desde legacy)
export const getEventsbyTaxpayer = (taxpayerId?: string, type?: string) =>
  EventService.getEventsbyTaxpayer(taxpayerId, type);

// ---------------------------------------------------------------------------
// getFiscalTaxpayersForStats
// ---------------------------------------------------------------------------

/**
 * Obtiene contribuyentes del fiscal para estadísticas (año en curso).
 * Shape de respuesta: lista con id, name, rif, process, fase (sin modificar contrato).
 */
export async function getFiscalTaxpayersForStats(userId: string) {
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);

    return db.taxpayer.findMany({
        where: {
            officerId: userId,
            emition_date: { gte: startOfYear },
        },
        select: {
            id: true,
            name: true,
            rif: true,
            process: true,
            fase: true,
        },
    });
}

// ---------------------------------------------------------------------------
// getTaxpayersForEvents
// ---------------------------------------------------------------------------

/**
 * Obtiene contribuyentes con paginación según rol: ADMIN (todos), COORDINATOR (grupo),
 * SUPERVISOR (supervisados + propios), FISCAL (propios).
 */
export async function getTaxpayersForEvents(
    userId: string,
    userRole: string,
    page?: number,
    limit?: number,
    search?: string
) {
    const pageNum = page || 1;
    const limitNum = limit || 20;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, unknown> = {
        status: true,
    };

    if (search && search.trim()) {
        where.OR = [
            { name: { contains: search.trim(), mode: 'insensitive' } },
            { rif: { contains: search.trim(), mode: 'insensitive' } },
        ];
    }

    if (userRole === "ADMIN") {
        // Sin filtro extra
    } else if (userRole === "COORDINATOR") {
        const user = await db.user.findUnique({
            where: { id: userId },
            select: { groupId: true },
        });
        if (user?.groupId) {
            where.user = { groupId: user.groupId };
        }
    } else if (userRole === "SUPERVISOR") {
        const supervisedIds = await db.user.findMany({
            where: { supervisorId: userId },
            select: { id: true },
        });
        const officerIds = [userId, ...supervisedIds.map((u) => u.id)];
        where.officerId = { in: officerIds };
    } else {
        // FISCAL u otro: solo propios
        where.officerId = userId;
    }

    const [data, total] = await Promise.all([
        db.taxpayer.findMany({
            where,
            skip,
            take: limitNum,
            select: {
                id: true,
                name: true,
                rif: true,
                process: true,
                address: true,
                status: true,
            },
            orderBy: { name: 'asc' },
        }),
        db.taxpayer.count({ where }),
    ]);

    return {
        data,
        total,
        page: pageNum,
        totalPages: Math.ceil(total / limitNum),
        limit: limitNum,
    };
}

// ---------------------------------------------------------------------------
// getTaxpayerData
// ---------------------------------------------------------------------------

/**
 * Obtiene datos completos de un contribuyente: RepairReports, investigation_pdfs,
 * user con grupo/coordinator, último IVAReport, category, parish, y currentEffectiveIndex.
 */
export async function getTaxpayerData(id: string) {
    try {
        const taxpayerData = await taxpayerRepository.getTaxpayerData(id);
        if (!taxpayerData) return null;

        let currentEffectiveIndex: number | null = null;
        try {
            const idx = await IndexIvaService.resolveCurrentEffectiveIndex(
                {
                    index_iva: (taxpayerData as any).index_iva,
                    contract_type: (taxpayerData as any).contract_type,
                },
                new Date()
            );
            currentEffectiveIndex =
                typeof idx === 'object' && idx && 'toNumber' in idx
                    ? (idx as Decimal).toNumber()
                    : Number(idx);
        } catch {
            // mantener compatibilidad: null si no hay índice
        }
        return { ...taxpayerData, currentEffectiveIndex };
    } catch (e: any) {
        logger.error('Error getting the taxpayer data', {
            message: e?.message,
            stack: e?.stack,
        });
        throw new Error('Error getting the taxpayer data ');
    }
}

// ---------------------------------------------------------------------------
// getTaxpayerSummary
// ---------------------------------------------------------------------------

/**
 * Obtiene resumen de reportes IVA de un contribuyente.
 */
export async function getTaxpayerSummary(taxpayerId: string) {
    try {
        return await taxpayerRepository.findIvaReportsByTaxpayer(taxpayerId);
    } catch (e: any) {
        logger.error('Error getting the taxpayer summary', {
            taxpayerId,
            message: e?.message,
            stack: e?.stack,
        });
        throw new Error('Error getting the taxpayer summary');
    }
}
