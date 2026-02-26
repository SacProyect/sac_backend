import type { RoleStrategy } from "./types";
import type { TxClient } from "../../utils/db-server";

export const AdminStrategy: RoleStrategy = {
    role: "ADMIN",

    async getTaxpayerVisibilityWhere(): Promise<Record<string, never>> {
        return {};
    },

    async canAccessTaxpayer(): Promise<{ allowed: boolean }> {
        return { allowed: true };
    },
};
