import { event_type } from "@prisma/client";
import { db } from "../../utils/db-server";
import logger from "../../utils/logger";
import type { Event } from "../../taxpayer/taxpayer-utils";

/**
 * Obtiene eventos con deuda pendiente (debt > 0) según visibilidad del usuario.
 */
export const getPendingPayments = async (
  user: { id: string; role: string },
  taxpayerId?: string,
): Promise<Event[]> => {
  const userId = user.id;
  const userRole = user.role;

  try {
    const baseWhere: any = {
      debt: { gt: 0 },
      taxpayer: { status: true },
      NOT: { type: event_type.WARNING },
    };

    if (taxpayerId) {
      baseWhere.taxpayer.id = taxpayerId;
    } else {
      if (userRole === "FISCAL") {
        baseWhere.taxpayer.officerId = userId;
      }

      if (userRole === "COORDINATOR") {
        const group = await db.fiscalGroup.findUnique({
          where: { coordinatorId: userId },
          select: { id: true, members: { select: { id: true } } },
        });
        const memberIds = group?.members.map((m) => m.id) || [];
        baseWhere.taxpayer.officerId = { in: memberIds };
      }

      if (userRole === "SUPERVISOR") {
        const supervisor = await db.user.findUnique({
          where: { id: userId },
          include: { supervised_members: { select: { id: true } } },
        });
        const memberIds = [...(supervisor?.supervised_members.map((m) => m.id) ?? []), userId];
        baseWhere.taxpayer.officerId = { in: memberIds };
      }
    }

    const pendingPayments = await db.event.findMany({
      where: baseWhere,
      select: {
        id: true,
        date: true,
        amount: true,
        type: true,
        debt: true,
        expires_at: true,
        taxpayerId: true,
        taxpayer: {
          select: {
            name: true,
            rif: true,
          },
        },
      },
    });

    const mappedResponse: Event[] = pendingPayments.map((event) => ({
      id: event.id,
      date: event.date,
      type: (event.type as any) ?? "payment",
      amount: event.amount as any,
      taxpayerId: event.taxpayerId,
      taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`,
      debt: event.debt as any,
      expires_at: event.expires_at as any,
    }));

    return mappedResponse;
  } catch (error) {
    logger.error("[REPORTS] getPendingPayments failed", {
      userId,
      userRole,
      taxpayerId: taxpayerId ?? null,
      error,
    });
    throw error;
  }
};

