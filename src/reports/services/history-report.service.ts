import { event_type } from "@prisma/client";
import { db } from "../../utils/db-server";
import logger from "../../utils/logger";
import { sumTransactions, getLatestEvents, getPunctuallityAnalysis, getComplianceRate } from "../report-utils";
import type { Event, Payment } from "../../taxpayer/taxpayer-utils";

/**
 * Historial de multas por contribuyente (o global).
 */
export const getFineHistory = async (taxpayerId?: string) => {
  try {
    const where: any = {
      type: event_type.FINE,
    };

    if (taxpayerId) {
      where.taxpayerId = taxpayerId;
    }

    const fines = await db.event.findMany({
      where,
      select: {
        id: true,
        date: true,
        amount: true,
        type: true,
        status: true,
        debt: true,
        description: true,
        taxpayerId: true,
        expires_at: true,
        updated_at: true,
      },
    });

    const totalAmount = sumTransactions(fines as unknown as Event[]);

    return {
      FINEs: fines,
      fines_quantity: fines.length,
      total_amount: totalAmount,
    };
  } catch (error) {
    logger.error("[REPORTS] getFineHistory failed", {
      taxpayerId: taxpayerId ?? null,
      error,
    });
    throw error;
  }
};

/**
 * Historial de pagos asociados a multas por contribuyente (o global).
 */
export const getPaymentHistory = async (taxpayerId?: string) => {
  try {
    const fineWhere: any = {
      type: event_type.FINE,
    };

    const paymentWhere: any = {
      event: {
        type: event_type.FINE,
      },
    };

    if (taxpayerId) {
      fineWhere.taxpayerId = taxpayerId;
      paymentWhere.taxpayerId = taxpayerId;
    }

    const payments = await db.payment.findMany({
      where: paymentWhere,
      select: {
        id: true,
        amount: true,
        date: true,
        eventId: true,
        taxpayerId: true,
        event: { select: { id: true, amount: true, type: true, date: true, taxpayerId: true } },
      },
    });

    const fines = await db.event.findMany({
      where: fineWhere,
      select: {
        id: true,
        date: true,
        amount: true,
        type: true,
        debt: true,
        taxpayerId: true,
        payment: { select: { date: true } },
      },
    });

    const totalAmount = sumTransactions(payments as unknown as Payment[]);
    const lastPayments = getLatestEvents(payments as unknown as Payment[]);
    const punctuallityAnalysis = getPunctuallityAnalysis(fines as unknown as Event[]);
    const compliance = getComplianceRate(fines as unknown as Event[], payments as unknown as Payment[]);

    const totalPayments: Payment[] = [];

    (payments as unknown as Payment[]).forEach((payment: Payment) => {
      if (payment.event.amount.equals(payment.amount)) {
        totalPayments.push(payment);
      }
    });

    return {
      payments,
      payments_number: payments.length,
      total_payments: totalPayments.length,
      total_amount: totalAmount,
      last_payments: lastPayments,
      compliance_rate: compliance,
      average_delay: punctuallityAnalysis,
    };
  } catch (error) {
    logger.error("[REPORTS] getPaymentHistory failed", {
      taxpayerId: taxpayerId ?? null,
      error,
    });
    throw error;
  }
};

