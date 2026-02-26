import type { Prisma } from "@prisma/client";
import type { TxClient } from "../../utils/db-server";

/**
 * Contrato para estrategias de visibilidad y permisos por rol.
 * Cada rol implementa sus propias reglas sin condicionales en el código central.
 */
export interface RoleStrategy {
    readonly role: string;

    /**
     * Where de Prisma para filtrar contribuyentes visibles por este usuario.
     * Se combina con status: true y otros filtros en el repositorio.
     */
    getTaxpayerVisibilityWhere(client: TxClient, userId: string): Promise<Prisma.taxpayerWhereInput>;

    /**
     * Indica si el usuario puede acceder a un contribuyente concreto (ej. subir acta de reparo).
     */
    canAccessTaxpayer(
        client: TxClient,
        userId: string,
        taxpayerId: string
    ): Promise<{ allowed: boolean; reason?: string }>;
}

export type UserRole = "ADMIN" | "FISCAL" | "COORDINATOR" | "SUPERVISOR";
