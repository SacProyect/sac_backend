/**
 * PaymentService - Servicio para gestión de pagos
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import { BadRequestError } from '../../utils/errors/bad-request-error';
import type { NewPayment, Payment } from '../taxpayer-utils';
import logger from '../../utils/logger';

export class PaymentService {
    
    /**
     * Crea un nuevo pago
     * 
     * Reglas de negocio:
     * - El monto del pago no puede exceder la deuda pendiente
     * - Se actualiza la deuda del evento automáticamente
     */
    static async create(input: NewPayment): Promise<Payment | Error> {
        try {
            // Buscar el evento
            const event = await taxpayerRepository.findEventById(String(input.eventId));
            if (!event) {
                throw new Error("Event not found");
            }

            // Validar que el monto no exceda la deuda
            if (Number(event.debt) < Number(input.amount)) {
                throw BadRequestError("AmountError", "Payment can't be greater than debt");
            }

            // Crear pago y actualizar deuda en transacción
            const newPayment = await runTransaction(async (tx) => {
                const payment = await taxpayerRepository.createPayment(input, tx);
                await taxpayerRepository.updateEventDebt(input.eventId, input.amount, tx);
                return payment;
            });

            invalidateTaxpayerCache();

            return newPayment;
        } catch (error: any) {
            logger.error("Error creating payment", { 
                eventId: input?.eventId, 
                taxpayerId: input?.taxpayerId, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Actualiza el estado de un pago de multa.
     * 
     * Regla de negocio:
     * - `status = "paid"`     → el pago queda activo (status=true).
     *   - Si antes estaba en `not_paid` se vuelve a descontar su monto de la deuda del evento.
     * - `status = "not_paid"` → el pago queda inactivo (status=false).
     *   - Si antes estaba en `paid` se restaura la deuda del evento sumando el monto del pago.
     * 
     * La actualización del pago y de la deuda del evento se hace dentro de una transacción.
     */
    static async update(id: string, status: string): Promise<any> {
        try {
            const payment = await taxpayerRepository.findPaymentById(id);

            if (!payment) {
                throw new Error("Payment not found");
            }

            const targetPaid = status === "paid";

            const updatedPayment = await runTransaction(async (tx) => {
                // Estado actual en base de datos (booleano)
                const currentPaid = Boolean(payment.status);

                // Transición paid -> not_paid: restaurar deuda (incrementar)
                if (!targetPaid && currentPaid) {
                    await taxpayerRepository.restoreEventDebt(payment.eventId, payment.amount, tx);
                }

                // Transición not_paid -> paid: aplicar nuevamente el pago (decrementar deuda)
                if (targetPaid && !currentPaid) {
                    await taxpayerRepository.updateEventDebt(payment.eventId, payment.amount, tx);
                }

                return tx.payment.update({
                    where: { id },
                    data: { status: targetPaid },
                    include: {
                        event: true,
                    },
                });
            });

            invalidateTaxpayerCache();

            return updatedPayment;
        } catch (error: any) {
            logger.error("Error updating payment", {
                id,
                status,
                message: error?.message,
                stack: error?.stack,
            });
            throw error;
        }
    }

    /**
     * Elimina un pago (soft delete)
     * 
     * Al eliminar un pago, se restaura la deuda del evento
     */
    static async delete(id: string): Promise<void> {
        try {
            const payment = await taxpayerRepository.findPaymentById(id);
            
            if (!payment) {
                throw new Error("Payment not found");
            }

            // Restaurar deuda del evento y marcar pago como inactivo
            await runTransaction(async (tx) => {
                await taxpayerRepository.restoreEventDebt(payment.eventId, payment.amount, tx);
                await taxpayerRepository.deletePaymentById(id, tx);
            });

            invalidateTaxpayerCache();
        } catch (error: any) {
            logger.error("Error deleting payment", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Obtiene un pago por ID
     */
    static async getById(id: string) {
        return taxpayerRepository.findPaymentById(id);
    }

    /**
     * Obtiene pagos por contribuyente
     */
    static async getByTaxpayer(taxpayerId: string) {
        return db.payment.findMany({
            where: { taxpayerId },
            include: {
                event: true,
            },
            orderBy: { date: 'desc' },
        });
    }

    /**
     * Calcula la deuda restante de un evento
     */
    static async calculateRemainingDebt(eventId: string): Promise<number> {
        const event = await taxpayerRepository.findEventById(eventId);
        
        if (!event) {
            throw new Error("Event not found");
        }

        return Number(event.debt);
    }

    /**
     * Valida que un pago pueda realizarse
     */
    static async validatePayment(eventId: string, amount: number): Promise<boolean> {
        const event = await taxpayerRepository.findEventById(eventId);
        
        if (!event) {
            throw new Error("Event not found");
        }

        if (!event.status) {
            throw new Error("El evento está inactivo");
        }

        if (Number(event.debt) < amount) {
            throw new Error("El monto excede la deuda pendiente");
        }

        return true;
    }
}
