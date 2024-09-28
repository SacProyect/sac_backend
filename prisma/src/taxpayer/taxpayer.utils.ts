import { Decimal } from "@prisma/client/runtime/library"

export type Taxpayer = {
    nroProvidencia: number
    procedimiento: string
    nombre: string
    rif: string
    tipoContrato: string
    eventos: Event[]
}

export type Event = {
    id: number
    fecha: Date
    monto: Decimal
    tipo: EventType
}

export const EventType: { [x: string]: 'MULTA' | 'AVISO' | 'COMPROMISO_PAGO' | 'PAGO' } = {
    MULTA: 'MULTA',
    AVISO: 'AVISO',
    COMPROMISO_PAGO: 'COMPROMISO_PAGO',
    PAGO: 'PAGO',
}
export type EventType = typeof EventType[keyof typeof EventType]

