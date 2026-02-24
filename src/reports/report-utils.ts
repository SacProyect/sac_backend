import { Decimal } from "@prisma/client/runtime/library";
import { Event, Payment, Taxpayer } from "../taxpayer/taxpayer-utils";
import { User } from "../users/user-utils";
import { app_error } from "@prisma/client";


export interface InputError {
    title?: string,
    type: app_error,
    description: string,
    status?: boolean,
    created_at?: Date,
    closed_at?: Date | null,
    userId: string,
    images?: {
        img_src: string;
        img_alt: string;
    }[]
}

interface InputPayment {
    amount: BigInt,
}

export type MonthIva = {
    monthIndex: number;   // 0 = Jan, 11 = Dec
    monthName: string;    // "Enero", ...
    ivaCollected: number; // sum of paid for the month (2 decimals)
};

export type MonthlyRow = {
    month: string;             // "2025-01"
    expectedAmount: number;    // monthly expected sum across taxpayers (always add index)
    realAmount: number;        // sum of IVA paid in that month
    taxpayersEmitted: number;  // count with emition_date in that month
};


export interface InputGroupRecords {
    id?: string,
    month?: number,
    year?: number,
}

export type CompleteReportInput = {
    groupId: string | undefined;
    startDate: string | undefined;
    endDate: string | undefined;
    process: "AF" | "VDF" | "FP" | undefined;
    userId?: string;
    userRole?: string;
}



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
    // console.log("FINES FROM GETCOMPLIANCERATE: " + JSON.stringify(fines))


    const totalFines = fines.length;
    const finesPaid: Event[] = []

    fines.forEach((fine) => {
        if (fine.debt && fine.debt.equals(0)) {
            finesPaid.push(fine)
        }
    })

    // console.log("PAID FINES: "  + JSON.stringify(finesPaid))

    // console.log("TOTALFINES/FINESPAID: " + totalFines + "/" + finesPaid.length)


    // const totalPayments = payments.length;
    const complianceRate = new Decimal((finesPaid.length / totalFines) * 100)
    return complianceRate.round()
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



export const getPunctuallityAnalysis = (fines: Event[]): number => {

    // console.log("FINES FROM REPORT UTILS: " + JSON.stringify(fines));

    let totalDays = 0;
    let count = 0;

    if (fines == null) {
        return 0;
    }

    fines.forEach((fine, index) => {
        // console.log(`\nProcessing fine #${index + 1}:`, fine);

        if (fine.debt?.equals(0)) {
            const paymentSorted = fine.payment?.sort((a, b) => b.date.getTime() - a.date.getTime());
            const lastPaymentDate = paymentSorted?.[0]?.date;
            const fineDate = fine.date;

            if (lastPaymentDate && fineDate) {
                const delayDays = Math.floor((lastPaymentDate.getTime() - fineDate.getTime()) / (1000 * 60 * 60 * 24));
                // console.log(`Fine paid. Delay days (payment to fine): ${delayDays} days`);
                totalDays += delayDays;
                count++;
            }
        } else if (fine.debt?.gt(0)) {
            const fineTime = fine.date.getTime();
            const timeNow = Date.now();
            const delayDays = Math.floor((timeNow - fineTime) / (1000 * 60 * 60 * 24));
            // console.log(`Fine not paid. Delay days (fine to now): ${delayDays} days`);
            totalDays += delayDays;
            count++;
        }
    });

    // console.log("\n--- Final Summary ---");
    // console.log("TOTAL FINES: " + fines.length);
    // console.log("TOTAL DAYS: " + totalDays);
    // console.log("TOTAL COUNT: " + count);

    return count > 0 ? Math.round(totalDays / count) : 0;  // Using Math.floor() to round down the final result
}

export const getCollected = (payments: InputPayment) => {

}



