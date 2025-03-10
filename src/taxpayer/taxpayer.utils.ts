import { Decimal } from "@prisma/client/runtime/library"
import { db } from "../utils/db.server"
import { taxpayer_contract_type, taxpayer_process } from "@prisma/client"

export type Taxpayer = {
    providenceNum: number
    id: string;
    process: string
    name: string
    rif: string
    contract_type: string
    events?: Event[]
}

export type NewTaxpayer = {
    providenceNum: number
    process: taxpayer_process
    name: string
    rif: string
    contract_type: taxpayer_contract_type
    officerId: string;
}

export type Event = {
    id: string;
    date: Date
    amount: Decimal
    type: string
    taxpayerId: string;
    constribuyente?: string
}

export type NewEvent = {
    date: Date
    amount?: Decimal
    type: EventType
    taxpayerId: string;
}

export type Payment = {
    id: string;
    date: Date
    amount: Decimal
    event: Event
    taxpayerId: string;
    taxpayer?: string
}
export type NewPayment = {
    date: Date
    amount: Decimal
    eventId: string;
    taxpayerId: string;
}

export type StatisticsResponse = {
    type: string,
    total: number,
    percentage: Decimal
}

export const EventType: { [x: string]: 'FINE' | 'WARNING' | 'PAYMENT_COMPROMISE' } = {
    FINE: 'FINE',
    WARNING: 'WARNING',
    PAYMENT_COMPROMISE: 'PAYMENT_COMPROMISE',
}

export type EventType = typeof EventType[keyof typeof EventType]

export const getStatistics = async (userId: string, timeframe?: string, taxpayerId?: number): Promise<StatisticsResponse[] | Error> => {
    try {
        const where: any = {
            status: true,
            NOT: {
                type: EventType.WARNING
            },
            taxpayer: {
                officerId: userId
            }
        }
        if (taxpayerId) {
            where.taxpayerId = taxpayerId
        } else {
            const role = await db.user.findUniqueOrThrow({
                select: {
                    role: true
                },
                where: {
                    id: userId
                }
            })
            if (role.role !== "admin") {
                where.taxpayer = {
                    officerId: userId
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
        const events = await db.event.groupBy({
            by: ["type"],
            where,
            _count: {
                type: true
            }
        })

        const totalCount = await db.event.count({ where });

        return events.map(event => ({
            type: event.type,
            total: event._count.type,
            percentage: new Decimal((event._count.type / totalCount) * 10000).round().div(100)
        }))

    } catch (error) {
        throw error;
    }
}
