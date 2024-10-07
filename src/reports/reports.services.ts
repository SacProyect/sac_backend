import { TipoEvento } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, sumTransactions } from "./report.utils"
import { Payment } from "../taxpayer/taxpayer.utils"

export const getFineHistory = async (taxpayerid?: number) => {
    try {
        const where = {
            tipo: TipoEvento.MULTA
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

export const getPaymentHistory = async (taxpayerid?: number) => {
    try {
        const payments = await db.pago.findMany({
            include: {
                evento: true,
            },
            where: {
                evento: {
                    tipo: TipoEvento.MULTA
                }
            }
        })
        const fines = await db.evento.findMany({
            where: {
                tipo: TipoEvento.MULTA
            }
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