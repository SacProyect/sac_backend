/**
 * PdfService - Servicio de gestión de PDFs (reparo e investigación).
 * Operaciones de reportes de reparo delegadas en repair-report.service.
 */

import { db } from '../../utils/db-server';
import { generateDownloadInvestigationPdfUrl as getInvestigationPdfUrl } from '../helpers/s3.helper';
import * as repairReportService from './repair-report.service';

// PdfService actúa como fachada: reparos → repair-report.service; investigación → s3.helper + db

export class PdfService {
    /** Crea registro de reporte de reparo en BD (delega en repair-report.service). */
    static async uploadRepairReport(taxpayerId: string, pdf_url: string): Promise<any> {
        return repairReportService.uploadRepairReport(taxpayerId, pdf_url);
    }

    /** Actualiza URL del PDF del reporte de reparo (delega en repair-report.service). */
    static async updateRepairReportPdfUrl(id: string, pdf_url: string): Promise<any> {
        return repairReportService.updateRepairReportPdfUrl(id, pdf_url);
    }

    /** Elimina reporte de reparo (delega en repair-report.service). */
    static async deleteRepairReportById(id: string): Promise<void> {
        return repairReportService.deleteRepairReportById(id);
    }

    /** Genera URL firmada para descargar reporte de reparación (vía repair-report.service / s3.helper). */
    static async generateDownloadRepairUrl(key: string): Promise<string> {
        return repairReportService.getRepairReportUrl(key);
    }

    /**
     * Genera URL firmada para descargar PDF de investigación
     */
    static async generateDownloadInvestigationPdfUrl(key: string): Promise<string> {
        return getInvestigationPdfUrl(key);
    }

    /** Obtiene reportes de reparación por contribuyente (delega en repair-report.service). */
    static async getRepairReportsByTaxpayer(taxpayerId: string) {
        return repairReportService.getRepairReportsByTaxpayer(taxpayerId);
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
