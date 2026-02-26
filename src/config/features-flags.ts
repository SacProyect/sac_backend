/**
 * Feature Flags de SAC Backend
 *
 * CÓMO ACTIVAR/DESACTIVAR:
 * En el archivo .env (o variables de entorno del servidor):
 *   FF_NEW_TAXPAYER_SERVICE=true   → activa el nuevo servicio de taxpayer
 *   FF_NEW_TAXPAYER_SERVICE=false  → usa el código actual (default)
 *
 * En producción (PM2 ecosystem.config.js):
 *   env_production: { FF_NEW_TAXPAYER_SERVICE: "false" }
 *
 * Para rollback: cambiar a "false" y hacer `restart sac_backend en render`
 */

import { env } from './env-config';

type FlagName =
  | 'FF_NEW_TAXPAYER_SERVICE'     // Fase 3.2: TaxpayerService refactorizado
  | 'FF_NEW_REPORTS_SERVICE'      // Fase 3.3: ReportsService refactorizado
  | 'FF_NEW_ERROR_HIERARCHY'      // Fase 1.1: BaseError + jerarquía
  | 'FF_BIGINT_MIDDLEWARE'        // Fase 1.3: Serializador BigInt seguro
  | 'FF_ZOD_ENV_VALIDATION'       // Fase 1.2: Validación de env vars con Zod
  | 'FF_ENV_CONFIG'               // Alias de FF_ZOD_ENV_VALIDATION
  | 'FF_DI_CONTAINER'             // Fase 1.4: Contenedor de inyección de dependencias
  | 'FF_TAXPAYER_DTOS'            // Fase 2.2: DTOs de taxpayer
  | 'FF_STRATEGY_PATTERN'         // Fase 4.2: Strategy pattern para roles
  | 'FF_NEW_TAXPAYER_REPOSITORY'; // Fase 4.1: Repositorio con interfaz

function isEnabled(flag: FlagName): boolean {
  if (flag === 'FF_ENV_CONFIG') return env.FF_ZOD_ENV_VALIDATION;
  
  // Usar el objeto env validado
  const value = (env as any)[flag];
  return value === true;
}

function isEnabledForRole(flag: FlagName, role: string, allowedRoles: string[]): boolean {
  return isEnabled(flag) && allowedRoles.includes(role);
}

export const featureFlags = {
  isEnabled,
  isEnabledForRole,
};