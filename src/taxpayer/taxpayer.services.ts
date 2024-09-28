import { db } from "../utils/db.server";
import { Event, NewEvent, NewTaxpayer, Taxpayer } from "./taxpayer.utils";

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
                contribuyenteId: taxpayerId
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
                id: taxpayerId
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
                funcionarioId: userId
            }
        })
        return taxpayers
    } catch (error) {
        throw error
    }
}
