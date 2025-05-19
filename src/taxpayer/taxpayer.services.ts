import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { db } from "../utils/db.server";
import { Event, getStatistics, NewEvent, NewFase, NewIvaReport, NewObservation, NewPayment, NewTaxpayer, Payment, StatisticsResponse, Taxpayer } from "./taxpayer.utils";
import { BadRequestError } from "../utils/errors/BadRequestError";
import { Taxpayer_Fases } from "@prisma/client";
import { Resend } from 'resend';


const resend = new Resend(process.env.RESEND_API_KEY);




/**
 * Creates a new taxpayer.
 *
 * @param {NewTaxpayer} input - The input data for the new taxpayer.
 * @returns {Promise<Taxpayer | Error>} A Promise resolving to the created taxpayer or an error.
 */
export const createTaxpayer = async (input: NewTaxpayer): Promise<Taxpayer | Error> => {
    try {

        // console.log("Received input:", JSON.stringify(input, null, 2));

        const userName = await db.user.findFirst(({
            where: {
                id: input.userId,
            },
            select: {
                name: true,
            }

        }))

        if (input.process === "AF") {
            if (!userName?.name) {
                throw new Error("El nombre del fiscal no se pudo obtener.");
            }

            const emailHtml = `
            <div style="font-family: Arial, sans-serif; color: #333;">
                <h2 style="color: #2c3e50;">🆕 Nuevo Contribuyente para Auditoría Fiscal</h2>
                <p><strong>Fiscal Responsable:</strong> ${userName.name}</p>
                <p>Se ha creado un nuevo contribuyente con el procedimiento <strong>Auditoría Fiscal (AF)</strong>.</p>
                
                <h3 style="margin-top: 20px; color: #2980b9;">📋 Detalles del Contribuyente</h3>
                <ul style="line-height: 1.6;">
                <li><strong>Nombre:</strong> ${input.name}</li>
                <li><strong>RIF:</strong> ${input.rif}</li>
                <li><strong>Tipo de contrato:</strong> ${input.contract_type == "SPECIAL"? "ESPECIAL" : "ORDINARIO"}</li>
                <li><strong>Número de providencia:</strong> ${input.providenceNum}</li>
                <li><strong>Fecha de emisión:</strong> ${new Date(input.emition_date).toLocaleDateString()}</li>
                <li><strong>Dirección:</strong> ${input.address}</li>
                </ul>

                <p style="margin-top: 20px;">
                Puede acceder a la información y fases de este contribuyente a través del sistema:
                </p>

                <a href="https://sac-app.com" target="_blank" 
                style="
                    display: inline-block;
                    background-color: #2980b9;
                    color: white;
                    padding: 10px 20px;
                    text-decoration: none;
                    border-radius: 5px;
                    margin-top: 10px;
                ">
                🔗 Ir a SAC App
                </a>

                <hr style="margin-top: 30px;" />
                <footer style="font-size: 12px; color: #888;">
                Este correo fue generado automáticamente por el sistema de gestión fiscal.
                </footer>
            </div>
            `;

            await resend.emails.send({
                from: 'onboarding@resend.dev',
                to: 'victorenrique2002@gmail.com',
                subject: '🔍 Nuevo contribuyente creado para Auditoría Fiscal',
                html: emailHtml
            });
        }


        const existingTaxpayer = await db.taxpayer.findUnique({
            where: {
                rif: input.rif,
            }
        })

        if (existingTaxpayer) throw new Error("El rif ya fue registrado, por favor, corrija el número de rif.")

        // Ensure at least one PDF is provided
        if (!input.pdfs || input.pdfs.length === 0) {
            throw new Error("At least one PDF must be uploaded.");
        }

        const emitionDate = new Date(input.emition_date);

        const taxpayer = await db.taxpayer.create({
            data: {
                providenceNum: input.providenceNum,
                process: input.process,
                name: input.name,
                contract_type: input.contract_type,
                officerId: input.officerId,
                rif: input.rif,
                address: input.address,
                emition_date: emitionDate.toISOString(),
            }
        })

        // Insert PDFs linked to this taxpayer
        await db.investigationPdf.createMany({
            data: input.pdfs.map((pdf) => ({
                pdf_url: pdf.pdf_url,
                taxpayerId: taxpayer.id,
            })),
        });

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

        // console.log("INPUT: " + JSON.stringify(input))

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
                    description: true,
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
                    description: true,
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
                description: event.description,
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


export const deleteObservation = async (id: string) => {
    try {
        const deleteEvent = await db.observations.delete({
            where: {
                id: id,
            }
        })

        return deleteEvent;
    } catch (e) {
        console.error("Error erasing the observation: ", e);
        throw new Error("Error erasing the observation");
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
// export const updatePayment = async (eventId: string, data: Partial<NewPayment>): Promise<Payment | Error> => {
//     try {
//         const updatedEvent = await db.payment.update({
//             where: {
//                 id: eventId
//             },
//             include: {
//                 event: true
//             },
//             data: {
//                 ...data
//             }
//         });
//         return updatedEvent;
//     } catch (error) {
//         throw error;
//     }
// }

export const updateObservation = async (id: string, newDescription: string) => {
    try {
        const updatedObservation = await db.observations.update({
            where: {
                id: id,
            },
            data: {
                description: newDescription,
            },
        })

        return updatedObservation
    } catch (e) {
        console.error("Error updating observation:", e)
        throw new Error("Error updating observation")
    }
}

export const updateFase = async (data: NewFase) => {

    try {
        const updatedTaxpayerFase = await db.taxpayer.update({
            where: {
                id: data.id,
            },
            data: {
                fase: data.fase,
            }
        })

        return updatedTaxpayerFase

    } catch (e) {
        console.error(e);
        throw new Error("Could not update the fase")
    }
}


export const updatePayment = async (id: string, newStatus: string) => {

    try {
        let updatedPayment;

        if (newStatus === "paid") {
            updatedPayment = await db.event.update({
                where: {
                    id: id,
                },
                data: {
                    debt: 0,
                }
            })
        } else {
            const getFineAmount = await db.event.findFirst({
                where: {
                    id: id,
                }
            })

            if (getFineAmount) {

                const amount = getFineAmount.amount;

                updatedPayment = await db.event.update({
                    where: {
                        id: id,
                    },
                    data: {
                        debt: amount,
                    }
                })
            }
        }

        return updatedPayment

    } catch (e) {
        console.error(e);
        throw new Error("Can not update the debt for this fine.")
    }
}





export const notifyTaxpayer = async (id: string) => {

    try {
        const notifiedTaxpayer = await db.taxpayer.update({
            where: {
                id: id,
            },
            data: {
                notified: true,
            }
        })

        return notifiedTaxpayer;
    } catch (e) {
        console.error(e);
        throw new Error("error marking the taxpayer as notified")
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
        throw new Error("Error getting the taxpayer data ");
    }
}

export async function getObservations(taxpayerId: string) {
    try {

        const taxpayerObservations = await db.observations.findMany({
            where: {
                taxpayerId: taxpayerId,
            }
        })

        return taxpayerObservations
    } catch (e) {
        console.error(e)
        throw new Error("Error getting the observations")
    }
}

export async function getTaxpayerSummary(taxpayerId: string) {

    try {
        const taxpayerSummary = await db.iVAReports.findMany({
            where: {
                taxpayerId: taxpayerId,
            }
        })

        return taxpayerSummary;

    } catch (e) {
        console.error(e);
        throw new Error("Error getting the taxpayer summary");
    }
}



export const createObservation = async (input: NewObservation) => {
    if (!input.taxpayerId) {
        throw new Error("Missing taxpayerId for observation");
    }

    try {
        const observation = db.observations.create({
            data: {
                taxpayerId: input.taxpayerId,
                description: input.description,
                date: new Date(input.date),
            }
        })

        return observation

    } catch (e) {
        console.error("Error", e)
        throw new Error("Error when creating observation")
    }
}

export const createIVA = async (data: NewIvaReport) => {
    // 1. Validar duplicados para el mes
    const reportDate = new Date(data.date);
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const existing = await db.iVAReports.findFirst({
        where: {
            taxpayerId: data.taxpayerId,
            date: { gte: startDate, lte: endDate },
        },
    });
    if (existing) {
        throw new Error("IVA report for this taxpayer and month already exists.");
    }

    // 2. Obtener el 'excess' del último reporte
    const latest = await db.iVAReports.findFirst({
        where: { taxpayerId: data.taxpayerId },
        orderBy: { date: 'desc' },
        select: { excess: true },
    });
    const previousExcess = latest?.excess ?? 0;

    // 3. Construir el objeto de creación
    const createData: any = {
        taxpayerId: data.taxpayerId,
        purchases: data.purchases,
        sells: data.sells,
        date: data.date,
        ...(data.iva != null && { iva: data.iva }),
        excess:
            data.excess != null
                ? data.excess
                : (() => {
                    const calculatedExcess = BigInt(previousExcess) - BigInt(data.iva);
                    return calculatedExcess > BigInt(0) ? calculatedExcess : BigInt(0);
                })(),
    };

    // 4. Crear y devolver
    const report = await db.iVAReports.create({
        data: createData,
    });
    return report;
};
