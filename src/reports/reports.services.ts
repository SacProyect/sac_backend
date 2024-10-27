import { TipoEvento } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, sumTransactions } from "./report.utils"
import { Event, Payment } from "../taxpayer/taxpayer.utils"

export const getFineHistory = async (taxpayerId?: number) => {
    try {
        const where: any = {
            tipo: TipoEvento.MULTA
        }

        if (taxpayerId) {
            where.contribuyenteId = taxpayerId;
        }
        const fines = await db.evento.findMany({
            where
        })
        const totalAmount = sumTransactions(fines)
        return {
            multas: fines,
            numeroMultas: fines.length,
            montoTotal: totalAmount
        }
    } catch (error) {
        throw error
    }
}

export const getPaymentHistory = async (taxpayerId?: number) => {
    try {

        const fineWhere: any = {
            tipo: TipoEvento.MULTA
        }
        const paymentWhere: any = {
            evento: {
                tipo: TipoEvento.MULTA
            }
        }

        if (taxpayerId) {
            fineWhere.contribuyenteId = taxpayerId;
            paymentWhere.contribuyenteId = taxpayerId;
        }

        const payments = await db.pago.findMany({
            include: {
                evento: true,
            },
            where: paymentWhere
        })
        const fines = await db.evento.findMany({
            where: fineWhere
        })

        const totalAmaount = sumTransactions(payments)
        const lastPayments = getLatestEvents(payments)
        const punctullityAnalysis = getPunctuallityAnalysis(payments)
        const compliance = getComplianceRate(fines, payments)
        return {
            pagos: payments,
            numeroPagos: payments.length,
            montoTotal: totalAmaount,
            ultimosPagos: lastPayments,
            tasaCumplimiento: compliance,
            demoraPromedio: punctullityAnalysis

        }
    } catch (error) {
        throw error
    }
}

export const getKPI = async () => {
    try {
        const taxpayers = await db.contribuyente.findMany({})
        const events = await db.evento.findMany({
            where: {
                NOT: {
                    tipo: TipoEvento.AVISO
                }
            }
        })
        const payments = await db.pago.findMany({
            include: {
                evento: true
            }
        })
        const fines = events.filter(event => event.tipo == TipoEvento.MULTA)
        const commitment = events.filter(event => event.tipo == TipoEvento.COMPROMISO_PAGO)
        const finePayments: Payment[] = [];
        const commitmentPayments: Payment[] = [];

        payments.forEach(
            payment =>
                payment.evento.tipo === TipoEvento.MULTA ?
                    finePayments.push(payment) :
                    commitmentPayments.push(payment)
        );

        const commitmentCompliance = getComplianceRate(commitment, commitmentPayments)
        const finesCompliance = getComplianceRate(fines, finePayments)
        const gralCompliance = getTaxpayerComplianceRate(taxpayers, payments, events)

        const avgDelay = getPunctuallityAnalysis(payments)
        const avgCommitment = avgValue(commitment)
        const avgFine = avgValue(fines)

        const finePuntctuallity = getPunctuallityAnalysis(finePayments)
        const commitmentPunctuallity = getPunctuallityAnalysis(commitmentPayments)

        return {
            cumplimientoCompromisos: commitmentCompliance,
            promedioCompromisos: avgCommitment,
            puntualidadCompromisos: commitmentPunctuallity,
            cumplimientoMultas: finesCompliance,
            promedioMultas: avgFine,
            puntualidadMultas: finePuntctuallity,
            cumplimientoGeneral: gralCompliance,
            promedioDemora: avgDelay

        }
    } catch (error) {
        throw error
    }
}
export const getPendingPayments = async (taxpayerId?: number): Promise<Event[]> => {
    try {
        const where: any = {
            pago: {
                is: null,
            },
            contribuyente: {
                status: true
            },
            NOT: {
                tipo: TipoEvento.AVISO
            }
        }
        if (taxpayerId) {
            where.contribuyenteId = taxpayerId
        }
        const pendingPayments = await db.evento.findMany({
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
        console.log(mappedResponse)
        return mappedResponse
    } catch (error) {
        throw error;
    }
}