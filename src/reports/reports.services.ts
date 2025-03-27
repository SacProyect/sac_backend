import { event_type } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, InputError, sumTransactions } from "./report.utils"
import { Event, Payment } from "../taxpayer/taxpayer.utils"






export const getFineHistory = async (taxpayerId?: string) => {
    try {
        const where: any = {
            type: event_type.FINE
        }

        if (taxpayerId) {
            where.taxpayerId = taxpayerId;
        }
        const fines = await db.event.findMany({
            where
        })
        const totalAmount = sumTransactions(fines)
        return {
            FINEs: fines,
            fines_quantity: fines.length,
            total_amount: totalAmount
        }
    } catch (error) {
        throw error
    }
}

export const getPaymentHistory = async (taxpayerId?: string) => {
    try {

        const fineWhere: any = {
            type: event_type.FINE
        }

        const paymentWhere: any = {
            event: {
                type: event_type.FINE
            }
        }

        if (taxpayerId) {
            fineWhere.taxpayerId = taxpayerId;
            paymentWhere.taxpayerId = taxpayerId;
        }

        const payments = await db.payment.findMany({
            include: {
                event: true,
            },
            where: paymentWhere
        })

        // Finding all the fines related to the taxpayer.
        const fines = await db.event.findMany({
            where: fineWhere,
            include: {
                payment: {
                    include: { event: true }
                },
            }
        })

        const totalAmount = sumTransactions(payments)
        const lastPayments = getLatestEvents(payments)
        const punctuallityAnalysis = getPunctuallityAnalysis(fines)
        const compliance = getComplianceRate(fines, payments)

        const totalPayments: Payment[] = []
        // console.log("PAYMENTS REPORT SERVICES: " + JSON.stringify(payments[0]))

        payments.forEach((payment) => {
            if (payment.event.amount.equals(payment.amount)) {
                totalPayments.push(payment)
            }
        })


        return {
            payments: payments,
            payments_number: payments.length,
            total_payments: totalPayments.length,
            total_amount: totalAmount,
            last_payments: lastPayments,
            compliance_rate: compliance,
            average_delay: punctuallityAnalysis

        }
    } catch (error) {
        throw error
    }
}

export const getKPI = async () => {
    try {
        const taxpayers = await db.taxpayer.findMany({})
        const events = await db.event.findMany({
            where: {
                NOT: {
                    type: event_type.WARNING
                }
            }
        })
        const payments = await db.payment.findMany({
            include: {
                event: true
            }
        })
        const fines = events.filter(event => event.type == event_type.FINE)
        const commitment = events.filter(event => event.type == event_type.PAYMENT_COMPROMISE)
        const finePayments: Payment[] = [];
        const commitmentPayments: Payment[] = [];

        payments.forEach(
            payment =>
                payment.event.type === event_type.FINE ?
                    finePayments.push(payment) :
                    commitmentPayments.push(payment)
        );

        const commitmentCompliance = getComplianceRate(commitment, commitmentPayments)
        const finesCompliance = getComplianceRate(fines, finePayments)

        const mappedTaxpayers = taxpayers.map(taxpayer => ({
            ...taxpayer,
            providenceNum: taxpayer.providenceNum
        }));
        const gralCompliance = getTaxpayerComplianceRate(mappedTaxpayers, payments, events)

        const avgDelay = getPunctuallityAnalysis(fines)
        const avgCommitment = avgValue(commitment)
        const avgFine = avgValue(fines)

        const finePuntctuallity = getPunctuallityAnalysis(fines)
        const commitmentPunctuallity = getPunctuallityAnalysis(fines)

        return {
            cumplimientoCompromisos: commitmentCompliance,
            promedioCompromisos: avgCommitment,
            puntualidadCompromisos: commitmentPunctuallity,
            cumplimientoFINEs: finesCompliance,
            promedioFINEs: avgFine,
            puntualidadFINEs: finePuntctuallity,
            cumplimientoGeneral: gralCompliance,
            promedioDemora: avgDelay

        }
    } catch (error) {
        throw error
    }
}

export const getPendingPayments = async (taxpayerId?: string): Promise<Event[]> => {
    try {
        const where: any = {
            debt: {
                gt: 0,
            },
            taxpayer: {
                status: true
            },
            NOT: {
                type: event_type.WARNING
            }
        }

        // Ensure taxpayerId filtering works properly
        if (taxpayerId) {
            where.taxpayer = {
                ...where.taxpayer, // Preserve existing conditions
                id: taxpayerId, // Ensure only events for this taxpayer are retrieved
            };
        }

        const pendingPayments = await db.event.findMany({
            where,
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
                    }
                }

            }
        })

        const mappedResponse: Event[] = pendingPayments.map((event: any) => {
            return {
                id: event.id,
                date: event.date,
                type: event.type ? event.type : "payment",
                amount: event.amount,
                taxpayerId: event.taxpayerId,
                taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`,
                debt: event.debt,
                expires_at: event.expires_at,
            }
        })
        console.log(mappedResponse)
        return mappedResponse
    } catch (error) {
        throw error;
    }
}


/**
 * Creates a new error.
 *
 * @param {InputError} input - The input data for the new error.
 * @returns {Promise<InputError | Error>} A Promise resolving to the created error or an exception.
 */
export const createError = async (input: InputError): Promise<InputError | Error> => {

    try {
        const createdError = db.errors.create({
            data: {
                title: input.title ?? undefined,
                description: input.description,
                type: input.type,
                userId: input.userId,
                errorImages: {
                    create: input.images?.map((img) => ({
                        img_src: img.img_src,
                        img_alt: img.img_alt
                    })) || []
                }
            }
        })

        return createdError;
    } catch (e) {
        console.error("Error during creation: " + e)
        throw e
    }

}



