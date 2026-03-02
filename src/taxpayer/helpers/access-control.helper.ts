import type { UserRole } from "../../users/role-strategies";
import { getRoleStrategy } from "../../users/role-strategies";
import type { TxClient } from "../../utils/db-server";

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

