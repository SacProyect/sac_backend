import { Decimal } from "@prisma/client/runtime/library"
import { db } from "../utils/db.server"
import { TipoContrato, TipoProcedimiento } from "@prisma/client"

export type Taxpayer = {
    nroProvidencia: number
    id: bigint
    procedimiento: string
    nombre: string
    rif: string
    tipoContrato: string
    eventos?: Event[]
}

export type NewTaxpayer = {
    nroProvidencia: number
    procedimiento: TipoProcedimiento
    nombre: string
    rif: string
    tipoContrato: TipoContrato
    funcionarioId: string
}

export type Event = {
    id: bigint;
    fecha: Date
    monto: Decimal
    tipo: string
    contribuyenteId: bigint
    constribuyente?: string
}

export type NewEvent = {
    fecha: Date
    monto?: Decimal
    tipo: EventType
    contribuyenteId: bigint
}

export type Payment = {
    id: bigint;
    fecha: Date
    monto: Decimal
    evento: Event
    contribuyenteId: bigint
    constribuyente?: string
}
export type NewPayment = {
    fecha: Date
    monto: Decimal
    eventoId: number
    contribuyenteId: bigint
}

export type StatisticsResponse = {
    tipo: string,
    total: number,
    porcentaje: Decimal
}

export const EventType: { [x: string]: 'MULTA' | 'AVISO' | 'COMPROMISO_PAGO' } = {
    MULTA: 'MULTA',
    AVISO: 'AVISO',
    COMPROMISO_PAGO: 'COMPROMISO_PAGO',
}
export type EventType = typeof EventType[keyof typeof EventType]

export const getStatistics = async (userId: string, timeframe?: string, taxpayerId?: number): Promise<StatisticsResponse[] | Error> => {
    try {
        const where: any = {
            status: true,
            NOT: {
                tipo: EventType.AVISO
            },
            contribuyente: {
                funcionarioId: userId
            }
        }
        if (taxpayerId) {
            where.contribuyenteId = taxpayerId
        } else {
            const role = await db.usuario.findUniqueOrThrow({
                select: {
                    tipo: true
                },
                where: {
                    id: userId
                }
            })
            if (role.tipo !== "admin") {
                where.contribuyente = {
                    funcionarioId: userId
                }
            }
        }
        let start_date: Date | boolean
        let end_date: Date | boolean

        if (timeframe) {
            const today = new Date()
            switch (timeframe) {
                case "year":
                    start_date = new Date(today.getFullYear(), 0, 1)
                    end_date = new Date(today.getFullYear(), 11, 31, 23, 59, 59)
                    break
                case "month":
                    start_date = new Date(today.getFullYear(), today.getMonth(), 1)
                    end_date = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59)
                    break
                case "day":
                    start_date = new Date(today.getFullYear(), today.getMonth(), today.getDate())
                    end_date = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59)
                    break
                default:
                    start_date = false
                    end_date = false
            }
            if (start_date && end_date) {
                where.fecha = {
                    gte: start_date,
                    lte: end_date,
                }
            }
        }
        const events = await db.evento.groupBy({
            by: ["tipo"],
            where,
            _count: {
                tipo: true
            }
        })

        const totalCount = await db.evento.count({ where });

        return events.map(event => ({
            tipo: event.tipo,
            total: event._count.tipo,
            porcentaje: new Decimal((event._count.tipo / totalCount) * 10000).round().div(100)
        }))

    } catch (error) {
        throw error;
    }
}
