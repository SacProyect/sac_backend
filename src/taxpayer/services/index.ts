/**
 * Taxpayer Services - Barrel Export
 * 
 * Este archivo exporta todos los servicios modulares de contribuyentes.
 * Los servicios nuevos refactorizados están en archivos separados.
 * 
 * ESTRUCTURA:
 * - taxpayer-crud.service.ts: CRUD de contribuyentes
 * - event.service.ts: Gestión de eventos (multas, advertencias)
 * - payment.service.ts: Gestión de pagos
 * - iva-report.service.ts: Reportes IVA
 * - islr-report.service.ts: Reportes ISLR
 * - index-iva.service.ts: Índice IVA
 * - notification.service.ts: Notificaciones email
 * - pdf.service.ts: Gestión PDFs
 * - observation.service.ts: Observaciones
 */

import * as crudService from './taxpayer-crud.service';
import * as eventService from './event.service';
import * as paymentService from './payment.service';
import * as ivaReportService from './iva-report.service';
import * as islrReportService from './islr-report.service';
import * as indexIvaService from './index-iva.service';
import * as notificationService from './notification.service';
import * as pdfService from './pdf.service';
import * as observationService from './observation.service';

// Importar funciones del servicio legacy que aún no han sido refactorizadas
import * as legacyService from './legacy-taxpayer.service';

// Re-export classes
export const TaxpayerCrudService = crudService.TaxpayerCrudService;
export const EventService = eventService.EventService;
export const PaymentService = paymentService.PaymentService;
export const IvaReportService = ivaReportService.IvaReportService;
export const IslrReportService = islrReportService.IslrReportService;
export const IndexIvaService = indexIvaService.IndexIvaService;
export const NotificationService = notificationService.NotificationService;
export const PdfService = pdfService.PdfService;
export const ObservationService = observationService.ObservationService;

// ============================================
// TAXPAYER CRUD FUNCTIONS
// ============================================

export async function createTaxpayer(...args: Parameters<typeof crudService.TaxpayerCrudService.create>) {
    return crudService.TaxpayerCrudService.create(...args);
}

export async function createTaxpayerExcel(...args: Parameters<typeof crudService.TaxpayerCrudService.createTaxpayerExcel>) {
    return crudService.TaxpayerCrudService.createTaxpayerExcel(...args);
}

export async function updateTaxpayer(...args: Parameters<typeof crudService.TaxpayerCrudService.update>) {
    return crudService.TaxpayerCrudService.update(...args);
}

export async function deleteTaxpayerById(...args: Parameters<typeof crudService.TaxpayerCrudService.delete>) {
    return crudService.TaxpayerCrudService.delete(...args);
}

export async function getTaxpayers(...args: Parameters<typeof crudService.TaxpayerCrudService.getAll>) {
    return crudService.TaxpayerCrudService.getAll(...args);
}

export async function getTaxpayerById(...args: Parameters<typeof crudService.TaxpayerCrudService.getById>) {
    return crudService.TaxpayerCrudService.getById(...args);
}

export async function getTaxpayersByUser(...args: Parameters<typeof crudService.TaxpayerCrudService.getByUserId>) {
    return crudService.TaxpayerCrudService.getByUserId(...args);
}

export async function getMyCurrentYearTaxpayers(...args: Parameters<typeof crudService.TaxpayerCrudService.getMyCurrentYearTaxpayers>) {
    return crudService.TaxpayerCrudService.getMyCurrentYearTaxpayers(...args);
}

export async function getTeamCurrentYearTaxpayers(...args: Parameters<typeof crudService.TaxpayerCrudService.getTeamCurrentYearTaxpayers>) {
    return crudService.TaxpayerCrudService.getTeamCurrentYearTaxpayers(...args);
}

export async function getTaxpayersForEvents(...args: Parameters<typeof crudService.TaxpayerCrudService.getForEvents>) {
    return crudService.TaxpayerCrudService.getForEvents(...args);
}

export async function getFiscalTaxpayersForStats(...args: Parameters<typeof crudService.TaxpayerCrudService.getForStats>) {
    return crudService.TaxpayerCrudService.getForStats(...args);
}

export async function getTaxpayerCategories() {
    return legacyService.getTaxpayerCategories();
}

export async function getParishList() {
    return legacyService.getParishList();
}

// ============================================
// EVENT FUNCTIONS
// ============================================

export async function createEvent(...args: Parameters<typeof eventService.EventService.create>) {
    return eventService.EventService.create(...args);
}

export async function updateEvent(...args: Parameters<typeof eventService.EventService.update>) {
    return eventService.EventService.update(...args);
}

export async function deleteEvent(...args: Parameters<typeof eventService.EventService.delete>) {
    return eventService.EventService.delete(...args);
}

// Mantener compatibilidad con lógica legacy (usa taxpayerRepository.findEvents/findPayments),
// ya que los tests mockean esas funciones explícitamente.
export async function getEventsbyTaxpayer(...args: Parameters<typeof legacyService.getEventsbyTaxpayer>) {
    return legacyService.getEventsbyTaxpayer(...args);
}

export async function getPendingPayments(taxpayerId?: string) {
    return eventService.EventService.getPendingPayments(taxpayerId);
}

// ============================================
// PAYMENT FUNCTIONS
// ============================================

export async function createPayment(...args: Parameters<typeof paymentService.PaymentService.create>) {
    return paymentService.PaymentService.create(...args);
}

export async function updatePayment(...args: Parameters<typeof paymentService.PaymentService.update>) {
    return paymentService.PaymentService.update(...args);
}

export async function deletePayment(...args: Parameters<typeof paymentService.PaymentService.delete>) {
    return paymentService.PaymentService.delete(...args);
}

// ============================================
// IVA REPORT FUNCTIONS
// ============================================

// Mantener lógica legacy de permisos y duplicados para IVA (tests actuales dependen de taxpayer-services.createIVA)
export async function createIVA(...args: Parameters<typeof legacyService.createIVA>) {
    return legacyService.createIVA(...args);
}

export async function updateIvaReport(...args: Parameters<typeof ivaReportService.IvaReportService.update>) {
    return ivaReportService.IvaReportService.update(...args);
}

export async function deleteIva(...args: Parameters<typeof ivaReportService.IvaReportService.delete>) {
    return ivaReportService.IvaReportService.delete(...args);
}

// ============================================
// ISLR REPORT FUNCTIONS
// ============================================

export async function createISLR(...args: Parameters<typeof islrReportService.IslrReportService.create>) {
    return islrReportService.IslrReportService.create(...args);
}

export async function updateIslr(...args: Parameters<typeof islrReportService.IslrReportService.update>) {
    return islrReportService.IslrReportService.update(...args);
}

export async function deleteIslr(...args: Parameters<typeof islrReportService.IslrReportService.delete>) {
    return islrReportService.IslrReportService.delete(...args);
}

export async function getIslrReports(...args: Parameters<typeof islrReportService.IslrReportService.getByTaxpayer>) {
    return islrReportService.IslrReportService.getByTaxpayer(...args);
}

// ============================================
// INDEX IVA FUNCTIONS
// ============================================

export async function createIndexIva(...args: Parameters<typeof indexIvaService.IndexIvaService.create>) {
    return indexIvaService.IndexIvaService.create(...args);
}

export async function modifyIndexIva(...args: Parameters<typeof indexIvaService.IndexIvaService.modify>) {
    return indexIvaService.IndexIvaService.modify(...args);
}

// ============================================
// NOTIFICATION FUNCTIONS
// ============================================

export async function notifyTaxpayer(...args: Parameters<typeof notificationService.NotificationService.notifyTaxpayer>) {
    return notificationService.NotificationService.notifyTaxpayer(...args);
}

// ============================================
// PDF FUNCTIONS
// ============================================

export async function uploadRepairReport(...args: Parameters<typeof pdfService.PdfService.uploadRepairReport>) {
    return pdfService.PdfService.uploadRepairReport(...args);
}

export async function updateRepairReportPdfUrl(...args: Parameters<typeof pdfService.PdfService.updateRepairReportPdfUrl>) {
    return pdfService.PdfService.updateRepairReportPdfUrl(...args);
}

export async function deleteRepairReportById(...args: Parameters<typeof pdfService.PdfService.deleteRepairReportById>) {
    return pdfService.PdfService.deleteRepairReportById(...args);
}

export async function generateDownloadRepairUrl(...args: Parameters<typeof pdfService.PdfService.generateDownloadRepairUrl>) {
    return pdfService.PdfService.generateDownloadRepairUrl(...args);
}

export async function generateDownloadInvestigationPdfUrl(...args: Parameters<typeof pdfService.PdfService.generateDownloadInvestigationPdfUrl>) {
    return pdfService.PdfService.generateDownloadInvestigationPdfUrl(...args);
}

// ============================================
// OBSERVATION FUNCTIONS
// ============================================

export async function createObservation(...args: Parameters<typeof observationService.ObservationService.create>) {
    return observationService.ObservationService.create(...args);
}

export async function updateObservation(...args: Parameters<typeof observationService.ObservationService.update>) {
    return observationService.ObservationService.update(...args);
}

export async function deleteObservation(...args: Parameters<typeof observationService.ObservationService.delete>) {
    return observationService.ObservationService.delete(...args);
}

export async function getObservations(...args: Parameters<typeof observationService.ObservationService.getByTaxpayer>) {
    return observationService.ObservationService.getByTaxpayer(...args);
}

// ============================================
// LEGACY FUNCTIONS (not yet refactored)
// ============================================

export const updateCulminated = legacyService.updateCulminated;
export const getTaxpayerData = legacyService.getTaxpayerData;
export const getTaxpayerSummary = legacyService.getTaxpayerSummary;
export const CreateTaxpayerCategory = legacyService.CreateTaxpayerCategory;
export const updateFase = legacyService.updateFase;
