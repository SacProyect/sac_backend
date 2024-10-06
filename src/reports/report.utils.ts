import { Decimal } from "@prisma/client/runtime/library";
import { Event, Payment, Taxpayer } from "../taxpayer/taxpayer.utils";


export const sumTransactions = (transactionArray: Event[] | Payment[]): Decimal => {
    let total: Decimal = new Decimal(0)
    transactionArray.forEach(transaction => {
        total.plus(transaction.monto)
    })
    return total
}

export const getLatestEvents = (transactions: Event[] | Payment[]): Event[] | Payment[] => {
    const orderedTransactions = orderTransactions(transactions).slice(0, 5)
    return orderedTransactions
}
export const orderTransactions = (transactionArray: Event[] | Payment[]): Event[] | Payment[] => {
    return transactionArray.sort((a, b) => a.fecha.getTime() - b.fecha.getTime())
}

export const getComplianceRate = (fines: Event[], paymens: Payment[]) => {
    const totalFines = fines.length;
    const totalPayments = paymens.length;
    const complianceRate = new Decimal((totalFines / totalPayments) * 10000).round().div(100)
    return complianceRate
}

export const getTaxpayerComplianceRate = (taxpayers: Taxpayer[], payments: Payment[], events: Event[]) => {
    const paidEventsMap: { [contribuyenteId: string]: boolean } = {};
    payments.forEach((payment) => {
        paidEventsMap[String(payment.contribuyenteId)] = true;
    });
    const onTimeTaxpayers = events.filter((event) => paidEventsMap[String(event.contribuyenteId)]);
    return new Decimal((onTimeTaxpayers.length / taxpayers.length) * 10000).round().div(100);
}



export const punctuallityAnalysis = (payments: Payment[]): Decimal => {
    const delay = payments.map(
        (payment => {
            const timeDiff = payment.fecha.getTime() - payment.evento.fecha.getTime();
            return timeDiff > 15 * 86400000 ? new Decimal(timeDiff).div(86400000) : new Decimal(0);
        })
    )
    return delay.reduce((acc, diff) => acc.add(diff)).div(payments.length)
}