import { db } from "../utils/db.server";
import { Event, getStatistics, NewEvent, NewTaxpayer, StatisticsResponse, Taxpayer } from "./taxpayer.utils";


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
 * Gets all events for a given taxpayer.
 *
 * @param {number} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Event[] | Error>} A Promise resolving to an array of events or an error.
 */
export const getEventsbyTaxpayer = async (taxpayerId: number): Promise<Event[] | Error> => {
    try {
        const events = await db.evento.findMany({
            where: {
                contribuyenteId: taxpayerId,
                status: true
            }
        })
        return events
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

export const getFullStatistics = async (userId: string, taxpayerId?: number): Promise<{ ano?: StatisticsResponse[] | Error, mes: StatisticsResponse[] | Error, dia: StatisticsResponse[] | Error, general: StatisticsResponse[] | Error } | Error> => {
    const getStats = async (period: string) => await getStatistics(userId, period, taxpayerId);
    const periods = !taxpayerId ? ["year", "month", "day", ""] : ["month", "day", ""];
    const promises = periods.map((period) => getStats(period));
    try {
        const results = await Promise.all(promises);
        return !taxpayerId
            ? { ano: results[0], mes: results[1], dia: results[2], general: results[3] }
            : { mes: results[0], dia: results[1], general: results[2] };
    } catch (error) {
        throw error;
    }
};