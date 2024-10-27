import { db } from "../utils/db.server";
import { Event, getStatistics, NewEvent, NewPayment, NewTaxpayer, Payment, StatisticsResponse, Taxpayer } from "./taxpayer.utils";


/**
 * Creates a new taxpayer.
 *
 * @param {NewTaxpayer} input - The input data for the new taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the created taxpayer or an error.
 */
export const createTaxpayer = async (input: NewTaxpayer): Promise<Taxpayer | Error> => {
    try {
        const taxpayer = await db.contribuyente.create({
            data: input
        })
        return taxpayer;
    } catch (error) {
        throw error;
    }
}

/**
 * Creates a new event.
 *
 * @param {NewEvent} input - The input data for the new event.
 * @returns {Promise<Event | Error>} A Promise resolving to the created event or an error.
 */
export const createEvent = async (input: NewEvent): Promise<Event | Error> => {
    try {
        const event = await db.evento.create({
            data: input
        })
        return event;
    } catch (error) {
        throw error;
    }
}

/**
 * Creates a new payment.
 *
 * @param {NewPayment} input - The input data for the new payment.
 * @returns {Promise<Payment | Error>} A Promise resolving to the created payment or an error.
 */
export const createPayment = async (input: NewPayment): Promise<Payment | Error> => {
    try {
        const newPayment = await db.pago.create({
            data: input,
            include: {
                evento: true
            }
        })
        return newPayment
    } catch (error) {
        throw error;
    }
}

/**
 * Gets all events for a given taxpayer.
 *
 * @param {number} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Event[] | Error>} A Promise resolving to an array of events or an error.
 */
export const getEventsbyTaxpayer = async (taxpayerId?: number, type?: string): Promise<Event[] | Error> => {
    try {

        let events: any;

        const where: any = {
            status: true
        }
        if (taxpayerId) {
            where.contribuyenteId = taxpayerId;
        }
        if (type && type !== "PAGO") {
            where.tipo = type
            events = await db.evento.findMany({
                where,
                select: {
                    id: true,
                    fecha: true,
                    monto: true,
                    tipo: true,
                    contribuyenteId: true,
                    contribuyente: {
                        select: {
                            nombre: true,
                            rif: true,
                        }
                    }

                }
            })
        } else if (type === "PAGO") {
            events = await db.pago.findMany({
                where,
                select: {
                    id: true,
                    fecha: true,
                    monto: true,
                    evento: true,
                    contribuyenteId: true,
                    contribuyente: {
                        select: {
                            nombre: true,
                            rif: true,
                        }
                    }

                }
            })
        } else {
            events = await db.evento.findMany({
                where,
                select: {
                    id: true,
                    fecha: true,
                    monto: true,
                    tipo: true,
                    contribuyenteId: true,
                    contribuyente: {
                        select: {
                            nombre: true,
                            rif: true,
                        }
                    }

                }
            })

            const payments = await db.pago.findMany({
                where,
                select: {
                    id: true,
                    fecha: true,
                    monto: true,
                    evento: true,
                    contribuyenteId: true,
                    contribuyente: {
                        select: {
                            nombre: true,
                            rif: true,
                        }
                    }

                }
            })

            events = [...events, ...payments]
        }

        const mappedResponse: Event[] = events.map((event: any) => {
            return {
                id: event.id,
                fecha: event.fecha,
                tipo: event.tipo ? event.tipo : "PAGO",
                monto: event.monto,
                contribuyenteId: event.contribuyenteId,
                contribuyente: `${event.contribuyente.nombre} RIF: ${event.contribuyente.rif}`
            }
        })
        return mappedResponse
    } catch (error) {
        throw error;
    }
}

/**
 * Gets a taxpayer by its ID.
 *
 * @param {number} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the taxpayer or an error.
 */
export const getTaxpayerById = async (taxpayerId: number): Promise<Taxpayer | Error> => {
    try {
        const taxpayer = await db.contribuyente.findUniqueOrThrow({
            where: {
                id: taxpayerId,
                status: true
            }
        });
        return taxpayer
    } catch (error) {
        throw error;
    }
}

/**
 * Gets all taxpayers associated with a given user.
 *
 * @param {string} userId - The ID of the user.
 * @returns {Promise<Taxpayer[] | Error>} A Promise resolving to an array of taxpayers or an error.
 */
export const getTaxpayersByUser = async (userId: string): Promise<Taxpayer[] | Error> => {
    try {
        const taxpayers = await db.contribuyente.findMany({
            where: {
                funcionarioId: userId,
                status: true
            }
        })
        return taxpayers
    } catch (error) {
        throw error
    }
}

/**
 * Deletes a taxpayer by changing their status to false.
 * 
 * @param {number}taxpayerId The ID of the taxpayer to delete.
 * @returns The updated taxpayer object or an error if the operation fails.
 */
export const deleteTaxpayerById = async (taxpayerId: number): Promise<Taxpayer | Error> => {
    try {
        const updatedTaxpayer = await db.contribuyente.update({
            where: {
                id: taxpayerId
            },
            data: {
                status: false
            }
        });
        await db.evento.updateMany({
            where: {
                contribuyenteId: taxpayerId,
                status: true
            },
            data: {
                status: false
            }
        });
        await db.pago.updateMany({
            where: {
                contribuyenteId: taxpayerId,
                status: true
            },
            data: {
                status: false
            }
        });
        return updatedTaxpayer;
    } catch (error) {
        throw error;
    }
}

/**
 * Deletes a taxpayer by changing their status to false.
 * 
 * @param {number}eventId The ID of the taxpayer to delete.
 * @returns The updated taxpayer object or an error if the operation fails.
 */
export const deleteEvent = async (eventId: number): Promise<Event | Error> => {
    try {
        const updatedEvent = await db.evento.update({
            where: {
                id: eventId
            },
            data: {
                status: false
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
    }
}

/**
 * Deletes a payment by changing their status to false.
 * 
 * @param {number}eventId The ID of the payment to delete.
 * @returns The updated payment object or an error if the operation fails.
 */
export const deletePayment = async (eventId: number): Promise<Payment | Error> => {
    try {
        const updatedEvent = await db.pago.update({
            where: {
                id: eventId
            },
            include: {
                evento: true
            },
            data: {
                status: false
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates a contribuyente object.
 * 
 * @param contribuyenteId The ID of the contribuyente to update.
 * @param data The updated data for the contribuyente.
 * @returns The updated contribuyente object or an error if the operation fails.
 */
export const updateTaxpayer = async (contribuyenteId: number, data: Partial<NewTaxpayer>): Promise<Taxpayer | Error> => {
    try {
        const updatedTaxpayer = await db.contribuyente.update({
            where: {
                id: contribuyenteId
            },
            data: {
                ...data
            }
        });
        return updatedTaxpayer;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates an evento object.
 * 
 * @param eventoId The ID of the evento to update.
 * @param data The updated data for the evento.
 * @returns The updated evento object or an error if the operation fails.
 */
export const updateEvent = async (eventoId: number, data: Partial<NewEvent>): Promise<Event | Error> => {
    try {
        const updatedEvent = await db.evento.update({
            where: {
                id: eventoId
            },
            data: {
                ...data
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
    }
}

/**
 * Updates a payment object.
 * 
 * @param eventoId The ID of the payment to update.
 * @param data The updated data for the payment.
 * @returns The updated payment object or an error if the operation fails.
 */
export const updatePayment = async (eventoId: number, data: Partial<NewPayment>): Promise<Payment | Error> => {
    try {
        const updatedEvent = await db.pago.update({
            where: {
                id: eventoId
            },
            include: {
                evento: true
            },
            data: {
                ...data
            }
        });
        return updatedEvent;
    } catch (error) {
        throw error;
    }
}

export const getPendingPayments = async (taxpayerId?: number): Promise<Event[]> => {
    try {
        const where: any = {
            pago: {
                is: null,
            }
        }
        if (taxpayerId) {
            where.contribuyenteId = taxpayerId
        }
        const pendingPayments = await db.evento.findMany({
            select: {
                id: true,
                fecha: true,
                monto: true,
                tipo: true,
                contribuyenteId: true,
                contribuyente: {
                    select: {
                        nombre: true,
                        rif: true,
                    }
                }

            },
            where
        })
        const mappedResponse: Event[] = pendingPayments.map((event: any) => {
            return {
                id: event.id,
                fecha: event.fecha,
                tipo: event.tipo ? event.tipo : "PAGO",
                monto: event.monto,
                contribuyenteId: event.contribuyenteId,
                contribuyente: `${event.contribuyente.nombre} RIF: ${event.contribuyente.rif}`
            }
        })
        return mappedResponse
    } catch (error) {
        throw error;
    }
}
