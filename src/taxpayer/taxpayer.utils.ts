import { Decimal } from "@prisma/client/runtime/library"
import { User } from "../users/user.utils"

export type Taxpayer = {
    nroProvidencia: number
    procedimiento: string
    nombre: string
    rif: string
    tipoContrato: string
    eventos?: Event[]
}

export type NewTaxpayer = {
    nroProvidencia: number
    procedimiento: string
    nombre: string
    rif: string
    tipoContrato: string
    funcionarioId: string
}

export type Event = {
    id: bigint;
    fecha: Date
    monto: Decimal
    tipo: EventType
}

export type NewEvent = {
    fecha: Date
    monto?: Decimal
    tipo: EventType
    contribuyenteId: number
}

export const EventType: { [x: string]: 'MULTA' | 'AVISO' | 'COMPROMISO_PAGO' | 'PAGO' } = {
    MULTA: 'MULTA',
    AVISO: 'AVISO',
    COMPROMISO_PAGO: 'COMPROMISO_PAGO',
    PAGO: 'PAGO',
}
export type EventType = typeof EventType[keyof typeof EventType]

