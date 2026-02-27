/**
 * PdfService - Servicio para gestión de PDFs
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import { storageService } from '../../services/StorageService';
import logger from '../../utils/logger';

export class PdfService {
    
    /**
     * Sube un reporte de reparación
     */
    static async uploadRepairReport(taxpayerId: string, pdf_url: string): Promise<any> {
        try {
            const newRepairReport = await runTransaction((tx) =>
                taxpayerRepository.createRepairReport(taxpayerId, pdf_url, tx)
            );

            invalidateTaxpayerCache();

            return newRepairReport;
        } catch (error: any) {
            logger.error("Can't create the repair report", { 
                taxpayerId, 
                pdf_url,
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error("Can't create the repair report");
        }
    }

    /**
     * Actualiza la URL del PDF del reporte de reparación
     */
    static async updateRepairReportPdfUrl(id: string, pdf_url: string): Promise<any> {
        try {
            return await runTransaction((tx) =>
                tx.repairReport.update({
                    where: { id },
                    data: { pdf_url },
                })
            );
        } catch (error: any) {
            logger.error("Failed to update pdf_url for RepairReport", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error("Could not update pdf_url for RepairReport");
        }
    }

    /**
     * Elimina un reporte de reparación
     */
    static async deleteRepairReportById(id: string): Promise<void> {
        try {
            await runTransaction((tx) => 
                taxpayerRepository.deleteRepairReportById(id, tx)
            );

            invalidateTaxpayerCache();
        } catch (error: any) {
            logger.error("Failed to delete RepairReport", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error("Could not delete RepairReport");
        }
    }

    /**
     * Genera URL firmada para descargar reporte de reparación
     */
    static async generateDownloadRepairUrl(key: string): Promise<string> {
        return storageService.getSignedDownloadUrl(key, 180);
    }

    /**
     * Genera URL firmada para descargar PDF de investigación
     */
    static async generateDownloadInvestigationPdfUrl(key: string): Promise<string> {
        return storageService.getSignedDownloadUrl(key, 180);
    }

    /**
     * Obtiene reportes de reparación por contribuyente
     */
    static async getRepairReportsByTaxpayer(taxpayerId: string) {
        return db.repairReport.findMany({
            where: { taxpayerId },
            orderBy: { id: 'desc' },
        });
    }

    /**
     * Obtiene PDFs de investigación por contribuyente
     */
    static async getInvestigationPdfsByTaxpayer(taxpayerId: string) {
        return db.investigationPdf.findMany({
            where: { taxpayerId },
            orderBy: { id: 'desc' },
        });
    }
}
