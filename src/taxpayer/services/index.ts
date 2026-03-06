/**
 * Taxpayer Services - Barrel Export (Sprint 2 + Sprint 3)
 *
 * Todas las funciones de Sprint 2 y 3 son accesibles vía import from './services'.
 *
 * Barrel Sprint 2 (un solo path):
 *   import { createTaxpayer, updateFase } from './services';
 */

// ---------------------------------------------------------------------------
// Sprint 2 - Barrel export (re-export de todos los servicios del módulo)
// ---------------------------------------------------------------------------
export * from './taxpayer-crud.service';
// taxpayer-excel: no export * para evitar conflicto con createTaxpayerExcel (wrapper explícito abajo)
export { createTaxpayerExcel } from './taxpayer-excel.service';
export * from './taxpayer-queries.service';
export * from './taxpayer-state.service';

// ---------------------------------------------------------------------------
// Sprint 2 - Resto (category-parish, legacy) y wrappers explícitos
// ---------------------------------------------------------------------------
import * as crudService from './taxpayer-crud.service';
import * as legacyService from './legacy-taxpayer.service';
import * as categoryParishService from './category-parish.service';
// taxpayer-queries: getTaxpayersForEvents, getFiscalTaxpayersForStats, getTaxpayerData, getTaxpayerSummary, getEventsbyTaxpayer vía export *

// ---------------------------------------------------------------------------
// Sprint 3 - Sub-entidades
// ---------------------------------------------------------------------------
import * as eventService from './event.service';
import * as paymentService from './payment.service';
import * as observationService from './observation.service';
import * as pdfService from './pdf.service';

// ---------------------------------------------------------------------------
// Reportes / Otros
// ---------------------------------------------------------------------------
import * as ivaReportService from './iva-report.service';
import * as islrReportService from './islr-report.service';
import * as indexIvaService from './index-iva.service';
import * as notificationService from './notification.service';

// ---------------------------------------------------------------------------
// Re-export classes
// ---------------------------------------------------------------------------
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

// createTaxpayerExcel → exportado vía export { createTaxpayerExcel } from './taxpayer-excel.service'

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

// getTaxpayersForEvents, getFiscalTaxpayersForStats → exportados vía export * from './taxpayer-queries.service'

export async function getTaxpayerCategories() {
    return categoryParishService.getTaxpayerCategories();
}

export async function getParishList() {
    return categoryParishService.getParishList();
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

// getEventsbyTaxpayer → exportado vía export * from './taxpayer-queries.service'

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
// updateCulminated, getTaxpayerData, getTaxpayerSummary, updateFase → exportados vía export * from taxpayer-queries / taxpayer-state

export const CreateTaxpayerCategory = categoryParishService.CreateTaxpayerCategory;
