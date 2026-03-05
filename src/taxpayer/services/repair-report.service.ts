/**
 * Servicio de reportes de reparo.
 * Gestiona registros en BD y URLs firmadas (vía s3.helper) para PDFs subidos a S3.
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import { generateSignedUrl } from '../helpers/s3.helper';
import logger from '../../utils/logger';

/**
 * Crea un registro de reporte de reparo en la BD asociado al contribuyente.
 * Se usa después de subir el PDF a S3.
 */
export async function uploadRepairReport(taxpayerId: string, pdf_url: string): Promise<any> {
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
            stack: error?.stack,
        });
        throw new Error("Can't create the repair report");
    }
}

/**
 * Actualiza la URL del PDF del reporte de reparo después de subir exitosamente a S3.
 */
export async function updateRepairReportPdfUrl(id: string, pdf_url: string): Promise<any> {
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
            stack: error?.stack,
        });
        throw new Error("Could not update pdf_url for RepairReport");
    }
}

/**
 * Elimina un reporte de reparo. Se usa cuando falla la subida a S3.
 */
export async function deleteRepairReportById(id: string): Promise<void> {
    try {
        await runTransaction((tx) => taxpayerRepository.deleteRepairReportById(id, tx));
        invalidateTaxpayerCache();
    } catch (error: any) {
        logger.error("Failed to delete RepairReport", {
            id,
            message: error?.message,
            stack: error?.stack,
        });
        throw new Error("Could not delete RepairReport");
    }
}

/**
 * Obtiene URL firmada para descargar el reporte de reparo (delega en s3.helper).
 */
export async function getRepairReportUrl(key: string): Promise<string> {
    return generateSignedUrl(key);
}

/**
 * Lista reportes de reparación por contribuyente.
 */
export async function getRepairReportsByTaxpayer(taxpayerId: string) {
    return db.repairReport.findMany({
        where: { taxpayerId },
        orderBy: { id: 'desc' },
    });
}
