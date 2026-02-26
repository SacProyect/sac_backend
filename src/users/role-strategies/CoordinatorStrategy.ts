import type { RoleStrategy } from "./types";
import type { TxClient } from "../../utils/db-server";

export const CoordinatorStrategy: RoleStrategy = {
    role: "COORDINATOR",

    async getTaxpayerVisibilityWhere(client: TxClient, userId: string) {
        const group = await client.fiscalGroup.findUnique({
            where: { coordinatorId: userId },
            select: { members: { select: { id: true } } },
        });
        if (!group || group.members.length === 0) {
            return { id: "impossible-id-no-members" };
        }
        const memberIds = group.members.map((m) => m.id);
        return { officerId: { in: memberIds } };
    },

    async canAccessTaxpayer(client: TxClient, userId: string, taxpayerId: string) {
        const group = await client.fiscalGroup.findUnique({
            where: { coordinatorId: userId },
            select: { members: { select: { id: true } } },
        });
        if (!group) return { allowed: false, reason: "Grupo no encontrado" };
        const memberIds = group.members.map((m) => m.id);
        const taxpayer = await client.taxpayer.findUnique({
            where: { id: taxpayerId },
            select: { officerId: true },
        });
        if (!taxpayer) return { allowed: false, reason: "Contribuyente no encontrado" };
        const allowed = taxpayer.officerId != null && memberIds.includes(taxpayer.officerId);
        return { allowed };
    },
};
