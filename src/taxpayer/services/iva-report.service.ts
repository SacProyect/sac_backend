/**
 * IvaReportService - Servicio para gestión de reportes IVA
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import type { NewIvaReport } from '../taxpayer-utils';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../../utils/logger';
import { validateFiscalAccessAndThrow } from '../helpers/access-control.helper';

export interface CreateIvaInput {
    iva?: number;
    purchases: number;
    sells: number;
    excess?: number;
    date: string | Date;
    taxpayerId: string;
}

export interface UpdateIvaInput {
    iva?: number;
    purchases?: number;
    sells?: number;
    excess?: number;
    paid?: number;
}

export class IvaReportService {
    
    /**
     * Crea un nuevo reporte IVA
     */
    static async create(data: CreateIvaInput, userId?: string, userRole?: string): Promise<any> {
        try {
            const { taxpayerId, date, purchases, sells, iva, excess } = data;

            if (userId && userRole === "FISCAL") {
                await validateFiscalAccessAndThrow(
                    userId,
                    taxpayerId,
                    "No tienes permisos para crear reportes de este contribuyente."
                );
            }

            // Validar que el contribuyente exista
            const taxpayer = await db.taxpayer.findUnique({
                where: { id: taxpayerId },
            });

            if (!taxpayer) {
                throw new Error("Contribuyente no encontrado");
            }

            // Calcular exceso si no se proporciona
            const calculatedExcess = excess ?? Math.max(0, sells - purchases);
            const calculatedIva = iva ?? Number(taxpayer.index_iva ?? 0) * purchases;

            const ivaReport = await runTransaction(async (tx) => {
                return tx.iVAReports.create({
                    data: {
                        taxpayerId,
                        date: new Date(date),
                        purchases: new Decimal(purchases),
                        sells: new Decimal(sells),
                        iva: iva !== undefined ? new Decimal(iva) : undefined,
                        excess: new Decimal(calculatedExcess),
                    },
                });
            });

            invalidateTaxpayerCache();

            return ivaReport;
        } catch (error: any) {
            logger.error("Error creating IVA report", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Actualiza un reporte IVA existente
     */
    static async update(
        ivaId: string, 
        data: UpdateIvaInput, 
        userId?: string, 
        userRole?: string
    ): Promise<any> {
        try {
            // Validar permisos (ADMIN y COORDINATOR pueden editar)
            if (userRole !== "ADMIN" && userRole !== "COORDINATOR") {
                const report = await db.iVAReports.findUnique({
                    where: { id: ivaId },
                    select: { taxpayerId: true, date: true },
                });

                if (report) {
                    if (userId && userRole === "FISCAL") {
                        await validateFiscalAccessAndThrow(
                            userId,
                            report.taxpayerId,
                            "No tienes permisos para editar este reporte."
                        );
                    }
                    const reportYear = new Date(report.date).getFullYear();
                    const currentYear = new Date().getFullYear();
                    if (reportYear < currentYear) {
                        throw new Error("No puedes editar reportes de años anteriores");
                    }
                }
            }

            const updateData: any = {};
            
            if (data.iva !== undefined) updateData.iva = new Decimal(data.iva);
            if (data.purchases !== undefined) updateData.purchases = new Decimal(data.purchases);
            if (data.sells !== undefined) updateData.sells = new Decimal(data.sells);
            if (data.excess !== undefined) updateData.excess = new Decimal(data.excess);
            if (data.paid !== undefined) updateData.paid = new Decimal(data.paid);

            updateData.updated_at = new Date();

            const updatedReport = await db.iVAReports.update({
                where: { id: ivaId },
                data: updateData,
            });

            invalidateTaxpayerCache();

            return updatedReport;
        } catch (error: any) {
            logger.error("Error updating IVA report", { 
                ivaId,
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Elimina un reporte IVA
     */
    static async delete(id: string): Promise<void> {
        try {
            await db.iVAReports.delete({
                where: { id },
            });

            invalidateTaxpayerCache();
        } catch (error: any) {
            logger.error("Error deleting IVA report", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Obtiene reportes IVA por contribuyente
     */
    static async getByTaxpayer(taxpayerId: string) {
        return taxpayerRepository.findIvaReportsByTaxpayer(taxpayerId);
    }

    /**
     * Calcula el exceso de IVA
     */
    static calculateExcess(purchases: number, sells: number): number {
        return Math.max(0, sells - purchases);
    }

    /**
     * Aplica el índice IVA al contribuyente
     */
    static async applyIvaIndex(taxpayerId: string, indexIva: number): Promise<void> {
        await db.taxpayer.update({
            where: { id: taxpayerId },
            data: { index_iva: new Decimal(indexIva) },
        });

        invalidateTaxpayerCache();
    }
}
