# Módulo de Reportes

Estructura modular de servicios de reportes, refactorizada para separar dominios y mantener compatibilidad con rutas y tests existentes.

## Estructura

- **`reports-services.ts`** — Fachada: re-exporta IVA/ISLR y el barrel `services/index.ts`. Las rutas y tests importan desde aquí (`import * as ReportService from './reports-services'`).

- **`services/index.ts`** — Barrel que re-exporta todos los sub-servicios y los namespaces `IvaReportService` e `IslrReportService`.

- **`report-utils.ts`** — Utilidades compartidas: `sumTransactions`, `getLatestEvents`, `getComplianceRate`, `getTaxpayerComplianceRate`, tipos `InputError`, `InputGroupRecords`, `CompleteReportInput`, etc.

- **`helpers/`** — Helpers reutilizables: `date-range.helper.ts` (rangos de año/mes UTC), `aggregation.helper.ts` (sumatorias con `Decimal`). Opcionalmente se puede compartir lógica de access-control con el módulo taxpayer.

## Servicios por dominio

| Servicio | Responsabilidad | Funciones principales |
|----------|-----------------|------------------------|
| **error-report.service** | Bitácora de errores | `createError` |
| **history-report.service** | Historial de multas y pagos | `getFineHistory`, `getPaymentHistory` |
| **pending-payments-report.service** | Pagos pendientes por rol | `getPendingPayments` |
| **group-record.service** | Registros y grupos fiscales | `getGroupRecord`, `getFiscalGroups` |
| **kpi-report.service** | KPIs globales y cumplimiento | `getGroupPerformance`, `getGlobalKPI`, `getMonthlyCompliance`, `getTaxpayerCompliance`, `getCompleteReport` |
| **fiscal-performance.service** | Métricas por fiscal y coordinación | `getFiscalInfo`, `getFiscalTaxpayers`, `getMonthyCollect`, `getMontlyPerformance`, `getComplianceByProcess`, `getFiscalTaxpayerCompliance`, `getCoordinationPerformance`, `getFiscalCollectAnalisis`, `getBestSupervisorByGroups`, `getTopFiscals`, `getTopFiveByGroup` |

## Dependencias con taxpayer

- Consultas usan relaciones: `fiscalGroup` → `members` → `taxpayer` → `IVAReports`, `ISLRReports`, `event`, `payment`.
- Tipos `Event` y `Payment` se importan desde `taxpayer/taxpayer-utils`.
- La lógica de **pending payments** y filtros por rol (ADMIN/COORDINATOR/FISCAL/SUPERVISOR) debe mantenerse alineada con taxpayer para evitar divergencias.
- `IvaReportService` y `IslrReportService` siguen siendo la fuente única para cálculos de IVA/ISLR; los sub-servicios de reports los reutilizan (p. ej. `calculateCreditSurplus`, `calculateComplianceScore`).

## Contratos

Las firmas públicas exportadas desde `reports-services.ts` no deben cambiar para no romper `reports-routes.ts` ni los tests (`reports-services.test.ts`, `taxpayer-index-iva.test.ts`, etc.). Toda nueva función se expone vía `services/index.ts` y se re-exporta con `export * from "./services"`.
