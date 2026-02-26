import type { RoleStrategy } from "./types";
import type { TxClient } from "../../utils/db-server";

export const SupervisorStrategy: RoleStrategy = {
    role: "SUPERVISOR",

    async getTaxpayerVisibilityWhere(client: TxClient, userId: string) {
        const user = await client.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                supervised_members: { select: { id: true } },
            },
        });
        if (!user) return { id: "impossible-id-user-not-found" };
        const officerIds = [user.id, ...user.supervised_members.map((m) => m.id)];
        return { officerId: { in: officerIds } };
    },

    async canAccessTaxpayer(client: TxClient, userId: string, taxpayerId: string) {
        const user = await client.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                supervised_members: { select: { id: true } },
            },
        });
        if (!user) return { allowed: false, reason: "Usuario no encontrado" };
        const officerIds = [user.id, ...user.supervised_members.map((m) => m.id)];
        const taxpayer = await client.taxpayer.findUnique({
            where: { id: taxpayerId },
            select: { officerId: true },
        });
        if (!taxpayer) return { allowed: false, reason: "Contribuyente no encontrado" };
        const allowed = taxpayer.officerId != null && officerIds.includes(taxpayer.officerId);
        return { allowed };
    },
};
