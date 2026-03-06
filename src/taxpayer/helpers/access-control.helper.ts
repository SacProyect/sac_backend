import type { UserRole } from "../../users/role-strategies";
import { getRoleStrategy } from "../../users/role-strategies";
import type { TxClient } from "../../utils/db-server";
import { db } from "../../utils/db-server";

export interface AccessCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Resuelve la estrategia de rol y ejecuta getTaxpayerVisibilityWhere.
 */
export async function getVisibilityFilterForRole(
  client: TxClient,
  userId: string,
  role: UserRole | string,
) {
  const strategy = getRoleStrategy(role);
  return strategy.getTaxpayerVisibilityWhere(client, userId);
}

/**
 * Helper de alto nivel para verificar acceso a un contribuyente.
 * Normaliza el rol y centraliza el uso de las RoleStrategies.
 */
export async function canUserAccessTaxpayer(
  client: TxClient,
  userId: string,
  role: UserRole | string,
  taxpayerId: string,
): Promise<AccessCheckResult> {
  const strategy = getRoleStrategy(role);
  const result = await strategy.canAccessTaxpayer(client, userId, taxpayerId);
  return {
    allowed: !!result.allowed,
    reason: result.reason,
  };
}

/**
 * Verifica acceso de un fiscal a un contribuyente (crear/editar, no solo lectura).
 * Equivalente a canUserAccessTaxpayer con rol FISCAL.
 */
export async function validateFiscalAccess(
  client: TxClient,
  userId: string,
  taxpayerId: string,
): Promise<AccessCheckResult> {
  return canUserAccessTaxpayer(client, userId, "FISCAL", taxpayerId);
}

/**
 * Verifica acceso de un fiscal para crear/editar reportes (IVA/ISLR) del contribuyente.
 * Misma lógica que validateFiscalAccess; nombre explícito para uso en reportes.
 */
export async function validateFiscalAccessForReport(
  client: TxClient,
  userId: string,
  taxpayerId: string,
): Promise<AccessCheckResult> {
  return validateFiscalAccess(client, userId, taxpayerId);
}

const defaultFiscalError = "No tienes permisos para esta operación.";

/**
 * Verifica que el usuario (fiscal) tenga acceso al contribuyente (officer, supervisor o miembro del grupo).
 * Lanza si no tiene permiso. Usar en servicios que requieren permiso de escritura.
 */
export async function validateFiscalAccessAndThrow(
  userId: string,
  taxpayerId: string,
  errorMessage?: string,
): Promise<void> {
  const result = await validateFiscalAccess(db as TxClient, userId, taxpayerId);
  if (!result.allowed) {
    throw new Error(errorMessage ?? result.reason ?? defaultFiscalError);
  }
}

