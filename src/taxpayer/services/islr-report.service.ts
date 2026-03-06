/**
 * IslrReportService - Servicio para gestión de reportes ISLR
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import type { NewIslrReport } from '../taxpayer-utils';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../../utils/logger';

export interface CreateIslrInput {
    incomes: number;
    costs: number;
    expent: number;
    date: string | Date;
    taxpayerId: string;
    paid?: number;
}

export interface UpdateIslrInput {
    incomes?: number;
    costs?: number;
    expent?: number;
    paid?: number;
}

export class IslrReportService {
    
    /**
     * Crea un nuevo reporte ISLR
     */
    static async create(
        input: CreateIslrInput, 
        userId?: string, 
        userRole?: string
    ): Promise<any> {
        try {
            const { incomes, costs, expent, taxpayerId, paid = 0 } = input;
            const date = (input as any).date ?? (input as any).emition_date;

            // Validar que el contribuyente exista
            const taxpayer = await db.taxpayer.findUnique({
                where: { id: taxpayerId },
            });

            if (!taxpayer) {
                throw new Error("Contribuyente no encontrado");
            }

            const dateObj = date instanceof Date ? date : new Date(date);
            const emitionYear = dateObj.getFullYear();
            if (isNaN(emitionYear)) {
                throw new Error("Fecha de reporte ISLR inválida");
            }
            const existing = await db.iSLRReports.findFirst({
                where: {
                    taxpayerId,
                    emition_date: {
                        gte: new Date(emitionYear, 0, 1),
                        lt: new Date(emitionYear + 1, 0, 1),
                    },
                },
            });
            if (existing) {
                throw new Error(`Ya existe un reporte ISLR para este contribuyente en el año ${emitionYear}`);
            }

            const islrReport = await runTransaction(async (tx) => {
                return tx.iSLRReports.create({
                    data: {
                        taxpayerId,
                        emition_date: dateObj,
                        incomes: new Decimal(incomes),
                        costs: new Decimal(costs),
                        expent: new Decimal(expent),
                        paid: new Decimal(paid),
                    },
                });
            });

            invalidateTaxpayerCache();

            return islrReport;
        } catch (error: any) {
            logger.error("Error creating ISLR report", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Actualiza un reporte ISLR existente
     */
    static async update(
        id: string, 
        data: UpdateIslrInput, 
        userId: string, 
        userRole: string
    ): Promise<any> {
        try {
            // Validar permisos (ADMIN y COORDINATOR pueden editar)
            if (userRole !== "ADMIN" && userRole !== "COORDINATOR") {
                // FISCAL solo puede editar reportes del año actual
                const report = await db.iSLRReports.findUnique({
                    where: { id },
                });

                if (report) {
                    const reportYear = new Date(report.emition_date).getFullYear();
                    const currentYear = new Date().getFullYear();
                    
                    if (reportYear < currentYear) {
                        throw new Error("No puedes editar reportes de años anteriores");
                    }
                }
            }

            const updateData: any = {};
            
            if (data.incomes !== undefined) updateData.incomes = new Decimal(data.incomes);
            if (data.costs !== undefined) updateData.costs = new Decimal(data.costs);
            if (data.expent !== undefined) updateData.expent = new Decimal(data.expent);
            if (data.paid !== undefined) updateData.paid = new Decimal(data.paid);

            updateData.updatedAt = new Date();

            const updatedReport = await db.iSLRReports.update({
                where: { id },
                data: updateData,
            });

            invalidateTaxpayerCache();

            return updatedReport;
        } catch (error: any) {
            logger.error("Error updating ISLR report", { 
                id,
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Elimina un reporte ISLR
     */
    static async delete(id: string): Promise<void> {
        try {
            await db.iSLRReports.delete({
                where: { id },
            });

            invalidateTaxpayerCache();
        } catch (error: any) {
            logger.error("Error deleting ISLR report", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Obtiene reportes ISLR por contribuyente
     */
    static async getByTaxpayer(taxpayerId: string) {
        return taxpayerRepository.findIslrReportsByTaxpayer(taxpayerId);
    }

    /**
     * Calcula la base imponible
     */
    static calculateTaxableBase(incomes: number, costs: number, expenses: number): number {
        const base = incomes - costs - expenses;
        return Math.max(0, base);
    }
}
