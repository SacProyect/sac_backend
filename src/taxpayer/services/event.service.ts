/**
 * EventService - Servicio para gestión de eventos (multas, advertencias)
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import type { NewEvent, Event } from '../taxpayer-utils';
import { BadRequestError } from '../../utils/errors/bad-request-error';
import logger from '../../utils/logger';

export class EventService {
    
    /**
     * Crea un nuevo evento (multa, advertencia, compromiso de pago)
     */
    static async create(input: NewEvent): Promise<Event | Error> {
        try {
            // Validar campos requeridos
            if (!input.date) {
                throw new Error("La fecha es requerida para crear un evento.");
            }

            if (!input.taxpayerId) {
                throw new Error("El ID del contribuyente es requerido.");
            }

            // Validar que la fecha sea válida
            const eventDate = new Date(input.date);
            if (isNaN(eventDate.getTime())) {
                throw new Error(`Fecha inválida: ${input.date}`);
            }

            // Validar que el contribuyente exista y esté activo
            const taxpayer = await taxpayerRepository.findById(input.taxpayerId);
            if (!taxpayer) {
                throw new Error(`Contribuyente con ID ${input.taxpayerId} no encontrado`);
            }
            if (taxpayer.status === false) {
                throw new Error(`Contribuyente con ID ${input.taxpayerId} no encontrado`);
            }

            // PAYMENT_COMPROMISE: validar fineEventId y monto <= deuda del evento referenciado
            if (input.type === "PAYMENT_COMPROMISE") {
                if (!input.fineEventId) {
                    throw new Error("fineEventId es requerido");
                }
                const fineEvent = await taxpayerRepository.findEventById(input.fineEventId);
                if (!fineEvent) {
                    throw new Error("Evento de multa no encontrado");
                }
                const debt = Number(fineEvent.debt);
                const amount = Number(input.amount ?? 0);
                if (amount > debt) {
                    throw BadRequestError("AmountError", "El monto no puede ser mayor que la deuda de la multa referenciada.");
                }
            }

            // Set expires_at to 15 days from now if not provided
            const expiresAt = input.expires_at ?? 
                new Date(new Date(input.date).getTime() + 15 * 24 * 60 * 60 * 1000);

            const event = await runTransaction((tx) =>
                taxpayerRepository.createEvent({
                    ...input,
                    expires_at: expiresAt,
                }, tx)
            );

            invalidateTaxpayerCache();

            return event;
        } catch (error) {
            logger.error("Error creating event: ", error);
            throw error;
        }
    }

    /**
     * Actualiza un evento existente
     */
    static async update(eventId: string, data: Partial<NewEvent>): Promise<Event> {
        try {
            logger.info("EVENT ID: " + eventId);
            logger.info("DATA: " + JSON.stringify(data));
            
            const updatedEvent = await runTransaction((tx) =>
                db.event.update({
                    where: { id: eventId },
                    data: { ...data }
                })
            );
            
            invalidateTaxpayerCache();
            
            return updatedEvent;
        } catch (error) {
            logger.error(error);
            throw error;
        }
    }

    /**
     * Elimina un evento (soft delete)
     */
    static async delete(id: string): Promise<void> {
        try {
            await runTransaction((tx) =>
                taxpayerRepository.deleteEventById(id, tx)
            );
            
            invalidateTaxpayerCache();
        } catch (error: any) {
            logger.error("Error deleting event", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Obtiene eventos por contribuyente (legacy semantics).
     *
     * Regla de negocio:
     * - Si `type` es distinto de "payment" → busca en tabla `event`.
     * - Si `type === "payment"` → busca en tabla `payment`.
     * - Si no hay `type` → combina eventos + pagos.
     *
     * El shape de respuesta se mantiene unificado para frontend.
     */
    static async getEventsbyTaxpayer(taxpayerId?: string, type?: string): Promise<Event[]> {
        try {
            let events: any;
            const where: any = { status: true };

            if (taxpayerId) where.taxpayerId = taxpayerId;

            if (type && type !== "payment") {
                where.type = type;
                events = await taxpayerRepository.findEvents(where);
            } else if (type === "payment") {
                events = await taxpayerRepository.findPayments(where);
            } else {
                const foundEvents = await taxpayerRepository.findEvents(where);
                const payments = await taxpayerRepository.findPayments(where);
                events = [...foundEvents, ...payments];
            }

            const mappedResponse: Event[] = events.map((event: any) => ({
                id: event.id,
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                debt: event.debt,
                description: event.description,
                taxpayerId: event.taxpayerId,
                officerId: event.taxpayer.officerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`,
            }));

            return mappedResponse;
        } catch (error: any) {
            logger.error("Error getEventsbyTaxpayer", {
                message: error?.message,
                stack: error?.stack,
            });
            throw error;
        }
    }

    /**
     * Alias hacia getEventsbyTaxpayer para mantener naming consistente con otros servicios.
     */
    static async getByTaxpayer(taxpayerId?: string, type?: string) {
        return this.getEventsbyTaxpayer(taxpayerId, type);
    }

    /**
     * Obtiene pagos pendientes
     */
    static async getPendingPayments(taxpayerId?: string): Promise<Event[]> {
        try {
            const where: any = {
                payment: { is: null },
            };
            
            if (taxpayerId) {
                where.taxpayerId = taxpayerId;
            }

            const pendingPayments = await taxpayerRepository.findPendingPayments(where);

            const mappedResponse: Event[] = pendingPayments.map((event: any) => ({
                id: event.id,
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                taxpayerId: event.taxpayerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`
            }));
            
            return mappedResponse;
        } catch (error: any) {
            logger.error("Error getPendingPayments", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Valida datos de entrada para evento
     */
    static validateInput(input: Partial<NewEvent>): void {
        if (input.date && isNaN(new Date(input.date).getTime())) {
            throw new Error("Fecha inválida");
        }

        if (input.amount !== undefined) {
            const amountNum = typeof input.amount === 'number' ? input.amount : Number(input.amount);
            if (amountNum <= 0) {
                throw new Error("El monto debe ser mayor a 0");
            }
        }

        if (input.type && !['FINE', 'WARNING', 'PAYMENT_COMPROMISE'].includes(input.type)) {
            throw new Error("Tipo de evento inválido");
        }
    }
}
