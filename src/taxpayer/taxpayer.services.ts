import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { db } from "../utils/db.server";
import { Event, getStatistics, NewEvent, NewPayment, NewTaxpayer, Payment, StatisticsResponse, Taxpayer } from "./taxpayer.utils";
import { BadRequestError } from "../utils/errors/BadRequestError";


/**
 * Creates a new taxpayer.
 *
 * @param {NewTaxpayer} input - The input data for the new taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the created taxpayer or an error.
 */
export const createTaxpayer = async (input: NewTaxpayer): Promise<Taxpayer | Error> => {
    try {

        console.log("Received input:", JSON.stringify(input, null, 2));


        const existingTaxpayer = await db.taxpayer.findUnique({
            where: {
                rif: input.rif,
            }
        })

        if (existingTaxpayer) throw new Error("El rif ya fue registrado, por favor, corrija el número de rif.")

        // Ensure at least one PDF is provided
        // if (!input.pdfs || input.pdfs.length === 0) {
        //     throw new Error("At least one PDF must be uploaded.");
        // }


        const taxpayer = await db.taxpayer.create({
            data: {
                providenceNum: input.providenceNum,
                process: input.process,
                name: input.name,
                contract_type: input.contract_type,
                officerId: input.officerId,
                rif: input.rif
            }
        })

        // Insert PDFs linked to this taxpayer
        // await db.investigationPdf.createMany({
        //     data: input.pdfs.map((pdf) => ({
        //         pdf_url: pdf.pdf_url,
        //         taxpayerId: taxpayer.id,
        //     })),
        // });

        return taxpayer;

    } catch (error: any) {
        console.error(error)
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

        console.log("INPUT: " + JSON.stringify(input))

        if (input.type == "PAYMENT_COMPROMISE") {
            const verifyEvent = await db.event.findUnique({
                where: { id: input.fineEventId }
            })

            if (verifyEvent) {
                if (input.amount !== undefined && input.amount > verifyEvent.debt) {
                    throw BadRequestError("AmountError", "Amount can't be greater than the debt of the fine")
                }
            }
        }

         // Set expires_at to 25 days from now if it's not provided
         const expiresAt = input.expires_at ?? new Date(Date.now() + 25 * 24 * 60 * 60 * 1000);


        const event = await db.event.create({
            data: {
                ...input,
                expires_at: expiresAt,
            }
        })


        return event;

    } catch (error) {
        console.error("Error creating event: " + error)
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

        const verifyPayment = await db.event.findFirst({
            where: { id: input.eventId }
        })

        if (verifyPayment) {
            if (verifyPayment.debt < input.amount) {
                throw BadRequestError("AmountError", "Payment can't be greater than debt")
            }
        }

        const newPayment = await db.payment.create({
            data: input,
            include: {
                event: true
            }
        })

        await db.event.update({
            where: { id: input.eventId },
            data: { debt: { decrement: input.amount } }
        })


        return newPayment
    } catch (error) {
        throw error;
    }
}

/**
 * Gets all events for a given taxpayer.
 *
 * @param {string} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Event[] | Error>} A Promise resolving to an array of events or an error.
 */
export const getEventsbyTaxpayer = async (taxpayerId?: string, type?: string): Promise<Event[] | Error> => {
    try {

        let events: any;

        const where: any = {
            status: true
        }

        if (taxpayerId) {
            where.taxpayerId = taxpayerId;
        }

        if (type && type !== "payment") {
            where.type = type
            events = await db.event.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    taxpayerId: true,
                    debt: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })
        } else if (type === "payment") {
            events = await db.payment.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    event: true,
                    taxpayerId: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })
        } else {
            events = await db.event.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    type: true,
                    taxpayerId: true,
                    debt: true,
                    taxpayer: {
                        select: {
                            name: true,
                            rif: true,
                        }
                    }

                }
            })

            const payments = await db.payment.findMany({
                where,
                select: {
                    id: true,
                    date: true,
                    amount: true,
                    event: true,
                    taxpayerId: true,
                    taxpayer: {
                        select: {
                            name: true,
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
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                debt: event.debt,
                taxpayerId: event.taxpayerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`
            }
        })

        return mappedResponse
    } catch (error) {
        console.error(error)
        throw error;
    }
}

/**
 * Gets a taxpayer by its ID.
 *
 * @param {number} taxpayerId - The ID of the taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the taxpayer or an error.
 */
export const getTaxpayerById = async (taxpayerId: string): Promise<Taxpayer | Error> => {


    try {
        const taxpayer = await db.taxpayer.findUniqueOrThrow({
            where: {
                id: taxpayerId,
                status: true
            }
        });

        if (!taxpayer) {
            throw new Error(`No active taxpayer found with ID ${taxpayerId}`);
        }

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
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: userId,
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
export const deleteTaxpayerById = async (taxpayerId: string): Promise<Taxpayer | Error> => {
    try {
        const updatedTaxpayer = await db.taxpayer.update({
            where: {
                id: taxpayerId
            },
            data: {
                status: false
            }
        });
        await db.event.updateMany({
            where: {
                taxpayerId: taxpayerId,
                status: true
            },
            data: {
                status: false
            }
        });
        await db.payment.updateMany({
            where: {
                taxpayerId: taxpayerId,
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
 * @param {string} eventId The ID of the taxpayer to delete.
 * @returns The updated taxpayer object or an error if the operation fails.
 */
export const deleteEvent = async (eventId: string): Promise<Event | Error> => {
    try {
        const updatedEvent = await db.event.update({
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
 * @param {string}eventId The ID of the payment to delete.
 * @returns The updated payment object or an error if the operation fails.
 */
export const deletePayment = async (eventId: string): Promise<Payment | Error> => {
    try {
        const updatedEvent = await db.payment.update({
            where: {
                id: eventId
            },
            include: {
                event: true
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
 * Updates a taxpayer object.
 * 
 * @param taxpayerId The ID of the taxpayer to update.
 * @param data The updated data for the taxpayer.
 * @returns The updated taxpayer object or an error if the operation fails.
 */
export const updateTaxpayer = async (taxpayerId: string, data: Partial<NewTaxpayer>): Promise<Taxpayer | Error> => {
    try {
        const updatedTaxpayer = await db.taxpayer.update({
            where: {
                id: taxpayerId
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
 * Updates an event object.
 * 
 * @param eventId The ID of the event to update.
 * @param data The updated data for the event.
 * @returns The updated event object or an error if the operation fails.
 */
export const updateEvent = async (eventId: string, data: Partial<NewEvent>): Promise<Event | Error> => {
    try {
        const updatedEvent = await db.event.update({
            where: {
                id: eventId
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
 * @param eventId The ID of the payment to update.
 * @param data The updated data for the payment.
 * @returns The updated payment object or an error if the operation fails.
 */
export const updatePayment = async (eventId: string, data: Partial<NewPayment>): Promise<Payment | Error> => {
    try {
        const updatedEvent = await db.payment.update({
            where: {
                id: eventId
            },
            include: {
                event: true
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

export const getPendingPayments = async (taxpayerId?: string): Promise<Event[]> => {
    try {
        const where: any = {
            payment: {
                is: null,
            }
        }
        if (taxpayerId) {
            where.taxpayerId = taxpayerId
        }
        const pendingPayments = await db.event.findMany({
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                taxpayerId: true,
                taxpayer: {
                    select: {
                        name: true,
                        rif: true,
                    }
                }

            },
            where
        })
        const mappedResponse: Event[] = pendingPayments.map((event: any) => {
            return {
                id: event.id,
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                taxpayerId: event.taxpayerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`
            }
        })
        return mappedResponse
    } catch (error) {
        throw error;
    }
}

export async function getTaxpayerData(id: string) {

    try {

        const taxpayerData = await db.taxpayer.findUnique({
            where: {
                id: id
            }
        });

        return taxpayerData

    } catch (e) {
        console.error(e);
        throw new Error("Error obteniendo la respuesta");
    }
}
