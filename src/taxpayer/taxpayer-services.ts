// src/taxpayer/taxpayer-services.ts
// ==============================================
// BARREL RE-EXPORT - Backward Compatibility
// ==============================================
// Este archivo fue refactorizado. Las funciones ahora
// viven en src/taxpayer/services/*.service.ts
// Este barrel mantiene compatibilidad con imports existentes.
// ==============================================

// Helpers (exportados para uso externo si necesario)
// → generateDownloadRepairUrl, generateDownloadInvestigationPdfUrl: ./services/pdf.service
// → sendEmailWithRetry: src/services/EmailService (fuera del módulo taxpayer)

// Services (todos re-exportados vía index para mantener wrappers: createTaxpayer, getTaxpayerCategories, etc.)
export * from './services';

// ==============================================
// Criterios de aceptación
// ==============================================
// [x] El archivo original pasa de ~2388 líneas a ~20 líneas
// [x] Todos los imports existentes siguen funcionando
// [x] npx tsc --noEmit pasa sin errores
// [x] El servidor arranca correctamente
// [x] No hay funciones perdidas (contar exports)
