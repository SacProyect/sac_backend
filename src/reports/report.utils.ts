import { Decimal } from "@prisma/client/runtime/library";
import { Event, Payment, Taxpayer } from "../taxpayer/taxpayer.utils";


export const sumTransactions = (transactionArray: Event[] | Payment[]): Decimal => {
    let total: Decimal = new Decimal(0)
    transactionArray.forEach(transaction => {
        total = total.add(transaction.amount)
    })
    return total
}

export const avgValue = (transactionArray: Event[] | Payment[]): Decimal => {
    let total = new Decimal(0)
    transactionArray.forEach(transaction => { total.plus(transaction.amount) })
    return total
        .div(transactionArray.length)
        .mul(100)
        .round()
        .div(100)
}

export const getLatestEvents = (transactions: Payment[]): Payment[] => {
    const orderedTransactions = orderTransactions(transactions).slice(0, 5)
    return orderedTransactions
}
export const orderTransactions = (transactionArray: Payment[]): Payment[] => {
    return transactionArray.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export const getComplianceRate = (fines: Event[], payments: Payment[]): Decimal => {
    const totalFines = fines.length;
    const totalPayments = payments.length;
    const complianceRate = new Decimal((totalPayments / totalFines) * 10000).round().div(100)
    return complianceRate
}

export const getTaxpayerComplianceRate = (taxpayers: Taxpayer[], payments: Payment[], events: Event[]) => {

    const taxpayerEvents = new Map();
    const taxpayerPayments = new Map();


    events.forEach((event) => {
        const taxpayerId = event.taxpayerId;
        if (taxpayerEvents.has(taxpayerId)) {
            taxpayerEvents.set(taxpayerId, taxpayerEvents.get(taxpayerId) + 1);
        } else {
            taxpayerEvents.set(taxpayerId, 1);
        }
    });

    payments.forEach((payment) => {
        const taxpayerId = payment.taxpayerId;
        if (taxpayerPayments.has(taxpayerId)) {
            taxpayerPayments.set(taxpayerId, taxpayerPayments.get(taxpayerId) + 1);
        } else {
            taxpayerPayments.set(taxpayerId, 1);
        }
    });
    const compliantTaxpayers = taxpayers.filter((taxpayer) => {
        const taxpayerId = taxpayer.id;
        const eventsCount = taxpayerEvents.get(taxpayerId) || 0;
        const paymentsCount = taxpayerPayments.get(taxpayerId) || 0;
        return eventsCount === paymentsCount;
    });


    const complianceRate = new Decimal(compliantTaxpayers.length).div(taxpayers.length).mul(100);
    return complianceRate.toFixed(2);
}



export const getPunctuallityAnalysis = (payments: Payment[]): Decimal => {
    const delay = payments.map(
        (payment => {
            const timeDiff = payment.date.getTime() - payment.event.date.getTime();
            return timeDiff > 15 * 86400000 ? new Decimal(timeDiff).div(86400000).minus(15) : new Decimal(0);
        })
    )
    return delay.reduce((acc, diff) => (acc.add(diff)).div(payments.length), new Decimal(0)).round();
}