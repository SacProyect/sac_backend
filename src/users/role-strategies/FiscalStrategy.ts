import type { RoleStrategy } from "./types";
import type { TxClient } from "../../utils/db-server";

export const FiscalStrategy: RoleStrategy = {
    role: "FISCAL",

    async getTaxpayerVisibilityWhere(_client: TxClient, userId: string) {
        return { officerId: userId };
    },

    async canAccessTaxpayer(client: TxClient, userId: string, taxpayerId: string) {
        const taxpayer = await client.taxpayer.findUnique({
            where: { id: taxpayerId },
            include: {
                user: {
                    include: {
                        supervisor: { select: { id: true } },
                        group: {
                            include: {
                                members: {
                                    where: { supervisorId: userId },
                                    select: { id: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        if (!taxpayer) return { allowed: false, reason: "Contribuyente no encontrado" };
        const isOfficer = taxpayer.officerId === userId;
        const isSupervisor = taxpayer.user?.supervisor?.id === userId;
        if (isOfficer || isSupervisor) return { allowed: true };
        const isSupervisorOfGroupMember =
            taxpayer.user?.group?.members && taxpayer.user.group.members.length > 0;
        return {
            allowed: !!isSupervisorOfGroupMember,
            reason: isSupervisorOfGroupMember
                ? undefined
                : "No tienes permisos para subir actas de reparo de este contribuyente.",
        };
    },
};
