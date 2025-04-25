import { event_type } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, InputError, sumTransactions } from "./report.utils"
import { Event, Payment } from "../taxpayer/taxpayer.utils"
import { group } from "console"
import { taxpayerRouter } from "../taxpayer/taxpayer.routes"
import { Decimal } from "@prisma/client/runtime/library"
import { format } from "date-fns";
import { AuthRequest, AuthUser, User } from "../users/user.utils"

interface InputFiscalGroups {
    role: string,
    id?: string,
    startDate?: string,
    endDate?: string,
}




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

export const getPaymentHistory = async (taxpayerId?: string) => {
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

        // Finding all the fines related to the taxpayer.
        const fines = await db.event.findMany({
            where: fineWhere,
            include: {
                payment: {
                    include: { event: true }
                },
            }
        })

        const totalAmount = sumTransactions(payments)
        const lastPayments = getLatestEvents(payments)
        const punctuallityAnalysis = getPunctuallityAnalysis(fines)
        const compliance = getComplianceRate(fines, payments)

        const totalPayments: Payment[] = []
        // console.log("PAYMENTS REPORT SERVICES: " + JSON.stringify(payments[0]))

        payments.forEach((payment) => {
            if (payment.event.amount.equals(payment.amount)) {
                totalPayments.push(payment)
            }
        })


        return {
            payments: payments,
            payments_number: payments.length,
            total_payments: totalPayments.length,
            total_amount: totalAmount,
            last_payments: lastPayments,
            compliance_rate: compliance,
            average_delay: punctuallityAnalysis

        }
    } catch (error) {
        throw error
    }
}

// export const getKPI = async () => {
//     try {
//         const taxpayers = await db.taxpayer.findMany({})
//         const events = await db.event.findMany({
//             where: {
//                 NOT: {
//                     type: event_type.WARNING
//                 }
//             }
//         })
//         const payments = await db.payment.findMany({
//             include: {
//                 event: true
//             }
//         })
//         const fines = events.filter(event => event.type == event_type.FINE)
//         const commitment = events.filter(event => event.type == event_type.PAYMENT_COMPROMISE)
//         const finePayments: Payment[] = [];
//         const commitmentPayments: Payment[] = [];

//         payments.forEach(
//             payment =>
//                 payment.event.type === event_type.FINE ?
//                     finePayments.push(payment) :
//                     commitmentPayments.push(payment)
//         );

//         const commitmentCompliance = getComplianceRate(commitment, commitmentPayments)
//         const finesCompliance = getComplianceRate(fines, finePayments)

//         const mappedTaxpayers = taxpayers.map(taxpayer => ({
//             ...taxpayer,
//             providenceNum: taxpayer.providenceNum
//         }));
//         const gralCompliance = getTaxpayerComplianceRate(mappedTaxpayers, payments, events)

//         const avgDelay = getPunctuallityAnalysis(fines)
//         const avgCommitment = avgValue(commitment)
//         const avgFine = avgValue(fines)

//         const finePuntctuallity = getPunctuallityAnalysis(fines)
//         const commitmentPunctuallity = getPunctuallityAnalysis(fines)

//         return {
//             cumplimientoCompromisos: commitmentCompliance,
//             promedioCompromisos: avgCommitment,
//             puntualidadCompromisos: commitmentPunctuallity,
//             cumplimientoFINEs: finesCompliance,
//             promedioFINEs: avgFine,
//             puntualidadFINEs: finePuntctuallity,
//             cumplimientoGeneral: gralCompliance,
//             promedioDemora: avgDelay

//         }
//     } catch (error) {
//         throw error
//     }
// }




/**
 * Creates a new error.
 *
 * @param {InputError} input - The input data for the new error.
 * @returns {Promise<InputError | Error>} A Promise resolving to the created error or an exception.
 */
export const createError = async (input: InputError): Promise<InputError | Error> => {


    try {
        const createdError = db.errors.create({
            data: {
                title: input.title ?? undefined,
                description: input.description,
                type: input.type,
                userId: input.userId,
                errorImages: {
                    create: input.images?.map((img) => ({
                        img_src: img.img_src,
                        img_alt: img.img_alt
                    })) || []
                }
            }
        })

        return createdError;
    } catch (e) {
        console.error("Error during creation: " + e)
        throw new Error("Error creating the report")
    }

}

export const getPendingPayments = async (
    user: { id: string; role: string },
    taxpayerId?: string
): Promise<Event[]> => {
    const userId = user.id;
    const userRole = user.role;

    try {
        // Base filter: only events with debt > 0 and taxpayer active, and not a WARNING
        const baseWhere: any = {
            debt: {
                gt: 0,
            },
            taxpayer: {
                status: true,
            },
            NOT: {
                type: event_type.WARNING,
            },
        };

        // If a specific taxpayerId is provided, override taxpayer filtering
        if (taxpayerId) {
            baseWhere.taxpayer.id = taxpayerId;
        } else {
            // Role-specific filtering
            if (userRole === "FISCAL") {
                // Only events from taxpayers assigned to this fiscal officer
                baseWhere.taxpayer.officerId = userId;
            }

            if (userRole === "COORDINATOR") {
                // Get IDs of users inside the coordinated group
                const group = await db.fiscalGroup.findUnique({
                    where: { coordinatorId: userId },
                    include: {
                        members: true,
                    },
                });

                const memberIds = group?.members.map((m) => m.id) || [];

                // Only events where taxpayer.officerId is in list of group members
                baseWhere.taxpayer.officerId = { in: memberIds };
            }

            // ADMIN does not need extra filtering — they see all events with debt > 0
        }

        const pendingPayments = await db.event.findMany({
            where: baseWhere,
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                debt: true,
                expires_at: true,
                taxpayerId: true,
                taxpayer: {
                    select: {
                        name: true,
                        rif: true,
                    },
                },
            },
        });

        const mappedResponse: Event[] = pendingPayments.map((event) => ({
            id: event.id,
            date: event.date,
            type: event.type ?? "payment",
            amount: event.amount,
            taxpayerId: event.taxpayerId,
            taxpayer: `${event.taxpayer.name} RIF: ${event.taxpayer.rif}`,
            debt: event.debt,
            expires_at: event.expires_at,
        }));

        return mappedResponse;
    } catch (error) {
        throw error;
    }
};


export const getFiscalGroups = async (data: InputFiscalGroups) => {

    if (data.role == "ADMIN" || data.role == "COORDINATOR") {

        const { id, startDate, endDate } = data;


        const filters: any = {}


        if (data.id) {
            filters.id = id
        }



        try {
            const groups = await db.fiscalGroup.findMany({
                where: filters,
                include: {
                    members: {
                        include: {
                            taxpayer: {
                                include: {
                                    event: {
                                        where: {
                                            date: {
                                                gte: startDate ? new Date(startDate) : undefined,
                                                lt: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : undefined,
                                            }
                                        }
                                    },
                                    payment: {
                                        where: {
                                            date: {
                                                gte: startDate ? new Date(startDate) : undefined,
                                                lt: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : undefined,
                                            }
                                        }
                                    }
                                }
                            },
                        }
                    }
                }
            });

            // Iterate over each group and calculate the `collected` for each group
            const updatedGroups = groups.map((group) => {
                // Calculate the total collected for this group
                let groupCollected: Decimal = new Decimal(0);
                let fines: Decimal = new Decimal(0);

                // Flatten the data structure and accumulate payments for this group
                group.members.forEach((member) => {

                    member.taxpayer.forEach((contributor) => {

                        contributor.event.forEach((e) => {
                            if (e.type == "FINE") {
                                fines = fines.plus(1)
                            }
                        })

                        contributor.payment.forEach((pay) => {
                            groupCollected = groupCollected.plus(pay.amount);
                        });

                    });

                });

                // Return the group with its added `collected` amount
                return {
                    ...group,
                    collected: groupCollected,
                    totalFines: fines,
                };
            });

            return updatedGroups

        } catch (e) {
            console.error(e)
            throw e
        }
    }



    // If the role is not "ADMIN" or "COORDINATOR", throw an error 
    throw Error("Unauthorized")

}

export async function getGlobalPerformance() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const lastYear = currentYear - 1;

    const startDate = new Date(currentYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59);

    try {
        // Get fines per month (including paid)
        const fines = await db.event.groupBy({
            by: ["date"],
            where: {
                type: "FINE",
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            _count: {
                _all: true,
            },
            _sum: {
                debt: true,
            },
        });

        // Get paid fines per month
        const paidFines = await db.event.groupBy({
            by: ["date"],
            where: {
                type: "FINE",
                date: {
                    gte: startDate,
                    lte: endDate,
                },
                debt: 0,
            },
            _count: {
                _all: true,
            },
        });

        // Get payments collected per month
        const payments = await db.payment.groupBy({
            by: ["date"],
            where: {
                date: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            _sum: {
                amount: true,
            },
        });

        // Initialize empty stats
        const monthlyStats: Record<
            string,
            { paid: number; fines: number; collected: number; lastYear: number }
        > = {
            January: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            February: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            March: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            April: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            May: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            June: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            July: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            August: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            September: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            October: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            November: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
            December: { paid: 0, fines: 0, collected: 0, lastYear: 0 },
        };

        // Populate fines
        for (const item of fines) {
            const monthName = format(item.date, "LLLL");
            monthlyStats[monthName].fines += item._count._all;
        }

        // Populate paid
        for (const item of paidFines) {
            const monthName = format(item.date, "LLLL");
            monthlyStats[monthName].paid += item._count._all;
        }

        // Populate collected
        for (const item of payments) {
            const monthName = format(item.date, "LLLL");
            monthlyStats[monthName].collected += Number(item._sum.amount ?? 0);
        }

        // Step 1: Upsert current year into globalStatistics
        for (const monthName of Object.keys(monthlyStats)) {
            await db.globalStatistics.upsert({
                where: {
                    month_year: { month: monthName, year: currentYear },
                },
                update: {
                    collected: monthlyStats[monthName].collected,
                },
                create: {
                    month: monthName,
                    year: currentYear,
                    collected: monthlyStats[monthName].collected,
                },
            });
        }

        // Step 2: Add last year stats
        const lastYearStats = await db.globalStatistics.findMany({
            where: { year: lastYear },
        });

        for (const stat of lastYearStats) {
            if (monthlyStats[stat.month]) {
                monthlyStats[stat.month].lastYear = Number(stat.collected);
            }
        }

        return monthlyStats;
    } catch (e) {
        console.error(e);
        throw new Error("An error has occurred");
    }
}


export async function getGlobalTaxpayersPerformance() {

    let fines = 0;
    let compromises = 0;
    let paid = 0;
    let unpaid = 0;


    try {

        const events = await db.event.findMany()

            ; (await events).forEach((event) => {
                if (event.type == "FINE") fines += 1;
                if (event.type == "PAYMENT_COMPROMISE") compromises += 1;
                if (event.type === "FINE" && event.debt.equals(0)) paid += 1;
                if (event.type === "FINE" && event.debt.greaterThan(0)) unpaid += 1;
            })

        return {
            fines,
            compromises,
            paid,
            unpaid,
        };


    } catch (e) {
        console.log(e)
        throw new Error("Error obteniendo el rendimiendo de los contribuyentes")
    }

}


export async function getGroupPerformance() {

    try {

        const groupPerformance = await db.fiscalGroup.findMany(
            {
                include: {
                    members: {
                        include: {
                            taxpayer: {
                                include: {
                                    event: true,
                                }
                            }
                        }
                    }
                }
            }
        );

        const performanceByGroup = groupPerformance.map((group) => {
            let totalPaidFines = 0;
            let totalPaidAmount = 0;

            group.members.forEach((member) => {
                member.taxpayer.forEach((taxp) => {
                    taxp.event.forEach((ev) => {
                        if (ev.type === "FINE" && ev.debt.equals(0)) {
                            totalPaidFines++;
                            totalPaidAmount += ev.amount.toNumber();
                        }
                    });
                });
            });

            return {
                groupId: group.id,
                groupName: group.name,
                totalPaidFines,
                totalPaidAmount,
            };
        });

        return performanceByGroup;

    } catch (e) {
        console.error(e)
        throw new Error("Error en la api" + e)
    }
}

export async function getGlobalKPI() {
    try {
        const performanceKpi = await db.taxpayer.findMany({
            include: {
                event: {
                    include: { payment: true },
                },
            },
        });

        let totalComplianceRate = 0;
        let taxpayerCount = 0;

        let totalFinesAmount = 0;
        let totalFines = 0;

        let totalDelayDays = 0;
        let delayFinesCount = 0;

        const today = new Date();
        const currentMonth = today.getMonth();
        const currentYear = today.getFullYear();
        const lastMonthDate = new Date(currentYear, currentMonth - 1, 1);
        const thisMonthDate = new Date(currentYear, currentMonth, 1);

        let lastMonthFines = 0;
        let lastMonthPaidFines = 0;
        let thisMonthFines = 0;
        let thisMonthPaidFines = 0;

        performanceKpi.forEach((taxpayer, taxpayerIndex) => {
            let finesPaid = 0;

            taxpayer.event.forEach((event, eventIndex) => {
                if (event.type === "FINE") {
                    totalFines++;

                    const amount = event.amount.toNumber();
                    totalFinesAmount += amount;

                    console.log(`🧾 [Taxpayer #${taxpayer.id}] Event #${event.id} | Fine amount: ${amount} | Total fines so far: ${totalFines} | Total fines amount: ${totalFinesAmount}`);

                    const fineDate = new Date(event.date);
                    const isPaid = event.debt.equals(0);

                    if (fineDate >= lastMonthDate && fineDate < thisMonthDate) {
                        lastMonthFines++;
                        if (isPaid) lastMonthPaidFines++;
                    } else if (
                        fineDate.getFullYear() === currentYear &&
                        fineDate.getMonth() === currentMonth
                    ) {
                        thisMonthFines++;
                        if (isPaid) thisMonthPaidFines++;
                    }

                    let delayInDays = 0;
                    if (isPaid) {
                        finesPaid++;
                        const latestPayment = event.payment
                            .sort(
                                (a, b) =>
                                    new Date(b.date).getTime() - new Date(a.date).getTime()
                            )[0];
                        if (latestPayment) {
                            delayInDays = Math.round(
                                (new Date(latestPayment.date).getTime() - fineDate.getTime()) /
                                (1000 * 60 * 60 * 24)
                            );
                        }
                    } else {
                        delayInDays = Math.round(
                            (today.getTime() - fineDate.getTime()) / (1000 * 60 * 60 * 24)
                        );
                    }

                    totalDelayDays += delayInDays;
                    delayFinesCount++;
                }
            });

            const finesForThisTaxpayer = taxpayer.event.filter(
                (e) => e.type === "FINE"
            ).length;
            if (finesForThisTaxpayer > 0) {
                const complianceRate = (finesPaid / finesForThisTaxpayer) * 100;
                totalComplianceRate += complianceRate;
                taxpayerCount++;
            }
        });

        console.log("📊 Total fines:", totalFines);
        console.log("💰 Total fines amount:", totalFinesAmount);

        const averageComplianceRate = taxpayerCount
            ? totalComplianceRate / taxpayerCount
            : 0;
        const avgFinesAmount = totalFines
            ? totalFinesAmount / totalFines
            : 0;
        const averageDelay = delayFinesCount
            ? totalDelayDays / delayFinesCount
            : 0;

        console.log("💡 Average fines amount:", avgFinesAmount);

        const taxpayersWithFines = performanceKpi.filter((t) =>
            t.event.some((e) => e.type === "FINE")
        );
        const compliantCount = taxpayersWithFines.filter((t) => {
            const fines = t.event.filter((e) => e.type === "FINE");
            return fines.length > 0 && fines.every((e) => e.debt.equals(0));
        }).length;
        const percentageCompliantTaxpayers = taxpayersWithFines.length
            ? (compliantCount / taxpayersWithFines.length) * 100
            : 0;

        const lastMonthCompliance = lastMonthFines
            ? (lastMonthPaidFines / lastMonthFines) * 100
            : 0;
        const thisMonthCompliance = thisMonthFines
            ? (thisMonthPaidFines / thisMonthFines) * 100
            : 0;
        const monthlyPerformanceChange = lastMonthCompliance
            ? ((thisMonthCompliance - lastMonthCompliance) / lastMonthCompliance) * 100
            : 0;

        const averageFinesPerTaxpayer = taxpayersWithFines.length
            ? (totalFines / taxpayersWithFines.length)
            : 0;

        const round = (val: number) => parseFloat(val.toFixed(2));

        return [
            { name: "Tasa de cumplimiento", value: round(averageComplianceRate) },
            { name: "Monto promedio de multa", value: round(avgFinesAmount) },
            { name: "Demora promedio", value: round(averageDelay) },
            { name: "Contribuyentes cumplidores", value: round(percentageCompliantTaxpayers) },
            { name: "Cambio en rendimiento", value: round(monthlyPerformanceChange) },
            { name: "Multas promedio", value: round(averageFinesPerTaxpayer) },
        ]
    } catch (e) {
        console.error("❌ An error occurred while calculating the global KPI:", e);
        throw new Error("Error al realizar la solicitud.");
    }
}







