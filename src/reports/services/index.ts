/**
 * Reports Services - Barrel Export
 *
 * Punto único de entrada para los servicios de reports.
 * Re-exporta sub-servicios modulares y mantiene compatibilidad
 * con los controladores y tests existentes.
 */

// Servicios especializados existentes (IVA / ISLR)
export * as IvaReportService from "../IvaReportService";
export * as IslrReportService from "../IslrReportService";

// Dominios extraídos desde reports-services.ts
export * from "./error-report.service";
export * from "./history-report.service";
export * from "./pending-payments-report.service";
export * from "./group-record.service";
export * from "./kpi-report.service";
export * from "./fiscal-performance.service";


