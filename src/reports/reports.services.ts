import { event_type } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, sumTransactions } from "./report.utils"
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

export const getPaymentHistory = async (taxpayerId?: number) => {
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
        const fines = await db.event.findMany({
            where: fineWhere
        })

        const totalAmount = sumTransactions(payments)
        const lastPayments = getLatestEvents(payments)
        const punctuallityAnalysis = getPunctuallityAnalysis(payments)
        const compliance = getComplianceRate(fines, payments)

        return {
            payments: payments,
            payments_number: payments.length,
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

        const avgDelay = getPunctuallityAnalysis(payments)
        const avgCommitment = avgValue(commitment)
        const avgFine = avgValue(fines)

        const finePuntctuallity = getPunctuallityAnalysis(finePayments)
        const commitmentPunctuallity = getPunctuallityAnalysis(commitmentPayments)

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
            }
        })
        console.log(mappedResponse)
        return mappedResponse
    } catch (error) {
        throw error;
    }
}