import { db } from "../utils/db.server";
import logger from "../utils/logger";

/**
 * Creates a new custom IVA index for a taxpayer.
 * Automatically deactivates any previously active index for the same taxpayer.
 */
export async function createTaxpayerIndexIva(data: {
    taxpayerId: string;
    baseAmount: number;
    assignedById: string;
    notes?: string;
    expiresAt?: Date;
}) {
    const { taxpayerId, baseAmount, assignedById, notes, expiresAt } = data;

    if (baseAmount <= 0) {
        throw new Error("El monto base del índice IVA debe ser mayor a 0.");
    }

    // Verify taxpayer exists
    const taxpayer = await db.taxpayer.findUnique({ where: { id: taxpayerId } });
    if (!taxpayer) {
        throw new Error("El contribuyente no existe.");
    }

    // Deactivate any currently active index for this taxpayer
    await db.taxpayerIndexIva.updateMany({
        where: {
            taxpayerId,
            active: true,
        },
        data: {
            active: false,
        },
    });

    // Create the new index
    const newIndex = await db.taxpayerIndexIva.create({
        data: {
            base_amount: baseAmount,
            taxpayerId,
            assignedById,
            notes: notes || "",
            active: true,
            expires_at: expiresAt || null,
        },
        include: {
            taxpayer: { select: { name: true, rif: true } },
            assignedBy: { select: { name: true } },
        },
    });

    logger.info("[TAXPAYER_INDEX_IVA] Created custom IVA index", {
        id: newIndex.id,
        taxpayerId,
        baseAmount,
        assignedById,
    });

    return newIndex;
}

/**
 * Returns the active and non-expired custom IVA index for a taxpayer.
 * Returns null if no active index exists.
 */
export async function getActiveTaxpayerIndexIva(taxpayerId: string) {
    const now = new Date();

    const activeIndex = await db.taxpayerIndexIva.findFirst({
        where: {
            taxpayerId,
            active: true,
            OR: [
                { expires_at: null },
                { expires_at: { gt: now } },
            ],
        },
        include: {
            assignedBy: { select: { name: true } },
        },
        orderBy: { created_at: "desc" },
    });

    return activeIndex;
}

/**
 * Returns the full history of IVA indices for a taxpayer (active and inactive).
 */
export async function getTaxpayerIndexIvaHistory(taxpayerId: string) {
    const history = await db.taxpayerIndexIva.findMany({
        where: { taxpayerId },
        include: {
            assignedBy: { select: { name: true } },
        },
        orderBy: { created_at: "desc" },
    });

    return history;
}

/**
 * Deactivates a specific custom IVA index.
 */
export async function deactivateTaxpayerIndexIva(id: string) {
    const existing = await db.taxpayerIndexIva.findUnique({ where: { id } });
    if (!existing) {
        throw new Error("El índice IVA personalizado no existe.");
    }

    const updated = await db.taxpayerIndexIva.update({
        where: { id },
        data: { active: false },
    });

    logger.info("[TAXPAYER_INDEX_IVA] Deactivated custom IVA index", { id });

    return updated;
}

/**
 * Gets a map of active custom IVA indices keyed by taxpayerId.
 * Useful for bulk operations in compliance calculations.
 */
export async function getActiveCustomIndicesMap(
    taxpayerIds: string[]
): Promise<Map<string, number>> {
    const now = new Date();

    const activeIndices = await db.taxpayerIndexIva.findMany({
        where: {
            taxpayerId: { in: taxpayerIds },
            active: true,
            OR: [
                { expires_at: null },
                { expires_at: { gt: now } },
            ],
        },
        orderBy: { created_at: "desc" },
    });

    // Build map: taxpayerId -> base_amount (only the most recent active one)
    const map = new Map<string, number>();
    for (const idx of activeIndices) {
        if (!map.has(idx.taxpayerId)) {
            map.set(idx.taxpayerId, Number(idx.base_amount));
        }
    }

    return map;
}
