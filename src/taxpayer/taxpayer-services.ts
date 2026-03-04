// src/taxpayer/taxpayer-services.ts
// ==============================================
// BARREL RE-EXPORT - Backward Compatibility
// ==============================================
// Este archivo fue refactorizado. Las funciones ahora
// viven en src/taxpayer/services/*.service.ts
// Este barrel mantiene compatibilidad con imports existentes.
// ==============================================
//
// Módulos reales que componen la API (re-exportados vía services/index):
//
// Servicios:
//   - services/taxpayer-crud.service.ts    (CRUD contribuyentes)
//   - services/taxpayer-excel.service.ts   (Excel)
//   - services/event.service.ts            (eventos, multas, advertencias)
//   - services/payment.service.ts          (pagos)
//   - services/iva-report.service.ts      (reportes IVA)
//   - services/islr-report.service.ts     (reportes ISLR)
//   - services/index-iva.service.ts       (índice IVA)
//   - services/notification.service.ts    (notificaciones email)
//   - services/pdf.service.ts             (reparos, URLs descarga)
//   - services/observation.service.ts     (observaciones)
//   - services/legacy-taxpayer.service.ts (categorías, parroquias, fase, culminado, getTaxpayerData, etc.)
//
// Helpers (uso interno; URLs descarga y email están en pdf.service / notification.service):
//   - helpers/validation.helper.ts
//   - helpers/access-control.helper.ts
// ==============================================

export * from './services';
