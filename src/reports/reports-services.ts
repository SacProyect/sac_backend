/**
 * Fachada de servicios de reportes.
 * Re-exporta IVA/ISLR y el barrel de servicios modulares para compatibilidad con rutas y tests.
 */
import * as IvaReportService from "./IvaReportService";

// ─── Re-exportaciones: IVA y ISLR (compatibilidad con controladores) ───
export const calculateComplianceScore = IvaReportService.calculateComplianceScore;
export const hadGoodComplianceBeforeProcedure = IvaReportService.hadGoodComplianceBeforeProcedure;
export const getGlobalPerformance = IvaReportService.getGlobalPerformance;
export const getIvaByMonth = IvaReportService.getIvaByMonth;
export const debugQuery = IvaReportService.debugQuery;
export const getIndividualIvaReport = IvaReportService.getIndividualIvaReport;
export const getExpectedAmount = IvaReportService.getExpectedAmount;

// Re-exportar servicios modulares (historial, errores, pending-payments, grupos, KPIs, fiscal, etc.)
export * from "./services";
