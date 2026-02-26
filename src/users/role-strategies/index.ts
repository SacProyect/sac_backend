import type { RoleStrategy, UserRole } from "./types";
import { AdminStrategy } from "./AdminStrategy";
import { FiscalStrategy } from "./FiscalStrategy";
import { CoordinatorStrategy } from "./CoordinatorStrategy";
import { SupervisorStrategy } from "./SupervisorStrategy";

const strategies: Record<string, RoleStrategy> = {
    ADMIN: AdminStrategy,
    FISCAL: FiscalStrategy,
    COORDINATOR: CoordinatorStrategy,
    SUPERVISOR: SupervisorStrategy,
};

/**
 * Devuelve la estrategia asociada al rol. Si el rol no existe, se usa FISCAL por defecto
 * (comportamiento más restrictivo).
 */
export function getRoleStrategy(role: string): RoleStrategy {
    const r = (role?.toUpperCase?.() || "") as UserRole;
    return strategies[r] ?? FiscalStrategy;
}

export type { RoleStrategy, UserRole } from "./types";
export { AdminStrategy, FiscalStrategy, CoordinatorStrategy, SupervisorStrategy };
