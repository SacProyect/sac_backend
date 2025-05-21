import { event_type } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, InputError, sumTransactions } from "./report.utils"
import { Event, Payment } from "../taxpayer/taxpayer.utils"
import { Decimal } from "@prisma/client/runtime/library"
import dayjs from "dayjs";
import isBetween from 'dayjs/plugin/isBetween';

dayjs.extend(isBetween);

interface InputFiscalGroups {
    role: string,
    id?: string,
    startDate?: string,
    endDate?: string,
    userId?: string,
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
    const { id, role, startDate, endDate } = data;

    const filters: any = {};

    if (role !== "ADMIN" && role !== "COORDINATOR") {
        throw new Error("Unauthorized");
    }

    try {
        // Si es COORDINATOR y no se especifica un ID, usar su grupo coordinado
        if (role === "COORDINATOR") {
            const coordinatorGroup = await db.fiscalGroup.findUnique({
                where: {
                    coordinatorId: data.userId,
                },
            });

            if (!coordinatorGroup) {
                throw new Error("Este usuario no coordina ningún grupo.");
            }

            if (id) {
                if (id !== coordinatorGroup.id) {
                    throw new Error("Acceso no autorizado: este grupo no pertenece al coordinador.");
                }
                filters.id = id;
            } else {
                filters.id = coordinatorGroup.id;
            }
        }

        if (id) {
            filters.id = id;
        }



        // Ahora usamos filters como siempre
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
                                        },
                                    },
                                },
                                payment: {
                                    where: {
                                        date: {
                                            gte: startDate ? new Date(startDate) : undefined,
                                            lt: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : undefined,
                                        },
                                    },
                                },
                                IVAReports: {
                                    where: {
                                        date: {
                                            gte: startDate ? new Date(startDate) : undefined,
                                            lt: endDate ? new Date(new Date(endDate).setHours(23, 59, 59, 999)) : undefined,
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Procesar resultados
        const updatedGroups = groups.map((group) => {
            let groupCollected: Decimal = new Decimal(0);
            let fines: Decimal = new Decimal(0);
            let totalIva: bigint = BigInt(0);

            group.members.forEach((member) => {
                member.taxpayer.forEach((contributor) => {
                    contributor.event.forEach((e) => {
                        if (e.type === "FINE") {
                            fines = fines.plus(1);
                        }
                    });

                    contributor.payment.forEach((pay) => {
                        groupCollected = groupCollected.plus(pay.amount);
                    });

                    contributor.IVAReports.forEach((report) => {
                        if (report.iva) totalIva += report.iva;
                    });
                });
            });

            return {
                ...group,
                collected: groupCollected,
                totalFines: fines,
                totalIva: totalIva,
            };
        });

        return updatedGroups;
    } catch (e) {
        console.error(e);
        throw e;
    }
};


export const getGlobalPerformance = async () => {
    try {
        // Obtener todos los datos relevantes
        const ivaReports = await db.iVAReports.findMany();
        const islrReports = await db.iSLRReports.findMany();
        const fines = await db.event.findMany({
            where: {
                type: "FINE",
            },
        });

        // Agrupar IVA por mes
        const ivaByMonth: Record<string, number> = {};
        ivaReports.forEach((report) => {
            const date = new Date(report.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            ivaByMonth[key] = (ivaByMonth[key] || 0) + Number(report.iva);
        });
        // console.log("IVA por mes:", ivaByMonth);

        // ISLR anual prorrateado en 12 meses
        const islrByMonth: Record<string, number> = {};
        islrReports.forEach((report) => {
            const date = new Date(report.emition_date);
            const year = date.getFullYear();
            const monthlyAmount =
                (report.incomes.toNumber() - report.expent.toNumber() - report.costs.toNumber()) / 12;

            for (let month = 1; month <= 12; month++) {
                const key = `${year}-${String(month).padStart(2, "0")}`;
                islrByMonth[key] = (islrByMonth[key] || 0) + monthlyAmount;
            }
        });
        // console.log("ISLR por mes (prorrateado):", islrByMonth);

        // Cumplimiento de multas
        const fineCountByMonth: Record<string, number> = {};
        const paidFineCountByMonth: Record<string, number> = {};

        fines.forEach((fine) => {
            const date = new Date(fine.date);
            const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
            fineCountByMonth[key] = (fineCountByMonth[key] || 0) + 1;
            if (fine.debt.equals(0)) {
                paidFineCountByMonth[key] = (paidFineCountByMonth[key] || 0) + 1;
            }
        });
        // console.log("Total multas por mes:", fineCountByMonth);
        // console.log("Multas pagadas por mes:", paidFineCountByMonth);

        const complianceByMonth: Record<string, number> = {};
        Object.keys(fineCountByMonth).forEach((key) => {
            const total = fineCountByMonth[key];
            const paid = paidFineCountByMonth[key] || 0;
            complianceByMonth[key] = (paid / total) * 100;
        });
        // console.log("Tasa de cumplimiento por mes:", complianceByMonth);

        // Unificar todos los meses presentes
        const allMonthsSet = new Set([
            ...Object.keys(ivaByMonth),
            ...Object.keys(islrByMonth),
            ...Object.keys(complianceByMonth),
        ]);
        const allMonths = Array.from(allMonthsSet).sort();
        // console.log("Meses analizados:", allMonths);

        // Calcular índice global mensual
        type Result = {
            month: string;
            ivaAmount: number;
            islrAmount: number;
            complianceRate: number;
            globalIndex: number;
            previousIndex?: number;
            percentageChange?: number | null;
        };

        const monthlyData: Record<string, Result> = {};

        allMonths.forEach((monthKey) => {
            const ivaAmount = ivaByMonth[monthKey] || 0;
            const islrAmount = islrByMonth[monthKey] || 0;
            const complianceRate = complianceByMonth[monthKey] || 0;

            const globalIndex = ivaAmount * 0.4 + islrAmount * 0.4 + complianceRate * 0.2;

            // console.log(`\n>>> Cálculo para ${monthKey}`);
            // console.log(`IVA: ${ivaAmount}`);
            // console.log(`ISLR: ${islrAmount}`);
            // console.log(`Tasa de cumplimiento: ${complianceRate}`);
            // console.log(`Índice global: ${globalIndex}`);

            monthlyData[monthKey] = {
                month: monthKey,
                ivaAmount,
                islrAmount,
                complianceRate,
                globalIndex,
            };
        });

        // Comparar con el mismo mes del año anterior
        Object.keys(monthlyData).forEach((monthKey) => {
            const [year, month] = monthKey.split("-");
            const previousYear = `${Number(year) - 1}-${month}`;
            const current = monthlyData[monthKey];
            const previous = monthlyData[previousYear] || {
                globalIndex: 0,
            };

            current.previousIndex = previous.globalIndex;
            current.percentageChange =
                previous.globalIndex === 0
                    ? 0.1 // 100% de crecimiento respecto a 0
                    : ((current.globalIndex - previous.globalIndex) / previous.globalIndex) * 100;

            // console.log(`\n>>> Comparación para ${monthKey} vs ${previousYear}`);
            // console.log(`Actual: ${current.globalIndex}, Anterior: ${previous.globalIndex}`);
            // console.log(`% Cambio: ${current.percentageChange}`);
        });

        const result = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
        return result;
    } catch (error) {
        console.error("Error in getGlobalPerformance:", error);
        throw new Error("Can't get the global performance");
    }
};



export async function getGlobalTaxpayersPerformance() {
    let ivaCollected = 0;
    let islrCollected = 0;
    let finesCollected = 0;

    try {
        const events = await db.event.findMany();

        events.forEach((event) => {
            if (event.type === "FINE") {
                finesCollected += Number(event.amount);
            }
        });

        const iva = await db.iVAReports.findMany();

        iva.forEach((rep) => {
            ivaCollected += Number(rep.paid);
        })

        const islr = await db.iSLRReports.findMany();

        islr.forEach((rep) => {
            islrCollected += Number(rep.paid);
        })



        const totalCollected = ivaCollected + islrCollected + finesCollected;


        return {
            ivaCollected: Number(ivaCollected.toFixed(2)),
            islrCollected: Number(islrCollected.toFixed(2)),
            finesCollected: Number(finesCollected.toFixed(2)),
            totalCollected: Number(totalCollected.toFixed(2)),
        };

    } catch (e) {
        console.log(e);
        throw new Error("Error obteniendo el rendimiento de los contribuyentes");
    }
}


export async function getGroupPerformance() {
    try {
        const groupPerformance = await db.fiscalGroup.findMany({
            include: {
                members: {
                    include: {
                        taxpayer: {
                            include: {
                                event: true,
                                IVAReports: true,  // Asegúrate que el nombre del campo en Prisma sea este
                                ISLRReports: true,  // Asegúrate que el nombre del campo en Prisma sea este
                            }
                        }
                    }
                }
            }
        });

        const performanceByGroup = groupPerformance.map((group) => {
            let totalPaidFines = 0;
            let totalPaidAmount = 0;
            let totalIvaCollected = 0;
            let totalIslrCollected = 0;

            group.members.forEach((member) => {
                member.taxpayer.forEach((taxp) => {
                    // Multas pagadas
                    taxp.event.forEach((ev) => {
                        if (ev.type === "FINE" && ev.debt.equals(0)) {
                            totalPaidFines++;
                            totalPaidAmount += ev.amount.toNumber();
                        }
                    });

                    // IVA recaudado
                    taxp.IVAReports?.forEach((iva) => {
                        totalIvaCollected += Number(iva.paid);
                    });

                    // ISLR recaudado
                    taxp.ISLRReports?.forEach((islr) => {
                        totalIslrCollected += Number(islr.paid);
                    });
                });
            });

            return {
                groupId: group.id,
                groupName: group.name,
                totalPaidFines,
                totalPaidAmount: Number(totalPaidAmount).toFixed(2),
                totalIvaCollected: Number(totalIvaCollected).toFixed(2),
                totalIslrCollected: Number(totalIslrCollected).toFixed(2),
            };
        });

        return performanceByGroup;

    } catch (e) {
        console.error(e);
        throw new Error("Error en la API: " + e);
    }
}

/**
 * Calcula el excedente de crédito fiscal de un contribuyente
 * siguiendo tu lógica de consumo por IVA.
 */
function calculateCreditSurplus(
    reports: { date: Date; excess: bigint | null; iva: bigint | null }[]
): number {
    // Ordenar de más antiguo a más reciente
    const sorted = reports
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    let accumulated = 0;
    let totalAdded = 0;

    for (const r of sorted) {
        const ex = r.excess ? Number(r.excess) : 0;
        const iv = r.iva ? Number(r.iva) : 0;

        // Si no hay excedente acumulado y encontramos uno >0, lo sumamos
        if (accumulated === 0 && ex > 0) {
            accumulated = ex;
            totalAdded += ex;
        }
        // Si tenemos excedente pendiente, lo consumimos con el IVA
        else if (accumulated > 0) {
            accumulated -= iv;
            if (accumulated < 0) accumulated = 0;
        }
        // Seguimos al siguiente reporte...
    }

    return totalAdded;
}
export async function getGlobalKPI() {
    try {
        // 1) Cargar todos los contribuyentes con sus reportes y eventos
        const taxpayers = await db.taxpayer.findMany({
            include: {
                IVAReports: true,
                ISLRReports: true,
                event: true,
            },
        });

        let totalCollection = 0;      // IVA + ISLR + Multas pagadas
        let creditSurplusSum = 0;     // Suma de excedentes válidos
        let creditSurplusCount = 0;   // Contribuyentes con excedente
        let withFineCount = 0;        // Contribuyentes que recibieron multa
        let totalDebt = 0;            // Suma de deudas pendientes

        // Fecha para crecimiento interanual
        const now = dayjs();
        const startThisYear = now.startOf("year");
        const startLastYear = now.subtract(1, "year").startOf("year");
        const endLastYear = now.subtract(1, "year").endOf("year");

        let lastYearCollection = 0;

        // Recabar datos de cada contribuyente
        for (const tp of taxpayers) {
            // a) Recaudación IVA e ISLR
            tp.IVAReports.forEach(r => totalCollection += Number(r.paid));
            tp.ISLRReports.forEach(r => totalCollection += Number(r.paid));

            // b) Multas pagadas (event.type === 'FINE' && debt === 0)
            const fines = tp.event.filter(e => e.type === "FINE");
            if (fines.length > 0) withFineCount++;
            fines.forEach(e => {
                if (e.debt.toString() === "0") {
                    totalCollection += Number(e.amount);
                } else {
                    totalDebt += Number(e.debt);
                }
            });

            // c) Excedente de crédito fiscal complejo (solo IVAReports, usa fields .excess y .iva)
            const surplus = calculateCreditSurplus(
                tp.IVAReports.map(r => ({
                    date: r.date,
                    excess: r.excess,
                    iva: r.iva,
                }))
            );
            if (surplus > 0) {
                creditSurplusSum += surplus;
                creditSurplusCount++;
            }

            // d) Recaudación año pasado para crecimiento
            tp.IVAReports
                .filter(r => dayjs(r.date).isBetween(startLastYear, endLastYear, null, "[]"))
                .forEach(r => lastYearCollection += Number(r.paid));
            tp.ISLRReports
                .filter(r => dayjs(r.emition_date).isBetween(startLastYear, endLastYear, null, "[]"))
                .forEach(r => lastYearCollection += Number(r.paid));
            tp.event
                .filter(e =>
                    e.type === "FINE" &&
                    e.debt.equals(0) &&
                    dayjs(e.date).isBetween(startLastYear, endLastYear, null, "[]")
                )
                .forEach(e => lastYearCollection += Number(e.amount));
        }

        const totalTaxpayers = taxpayers.length;

        // 1. Recaudación total
        const totalTaxCollection = totalCollection;

        // 2. Promedio de excedente
        const averageCreditSurplus =
            creditSurplusCount > 0
                ? creditSurplusSum / creditSurplusCount
                : 0;

        // 3. % con multas
        const finePercentage = totalTaxpayers > 0
            ? (withFineCount / totalTaxpayers) * 100
            : 0;

        // 4. Tasa de crecimiento interanual
        const growthRate = lastYearCollection > 0
            ? ((totalCollection - lastYearCollection) / lastYearCollection) * 100
            : 0;

        // 5. Índice de morosidad
        const delinquencyRate = totalCollection > 0
            ? (totalDebt / totalCollection) * 100
            : 0;

        return {
            totalTaxCollection: Number(totalTaxCollection).toFixed(2),     // Bs.
            averageCreditSurplus: Number(averageCreditSurplus).toFixed(2),   // Bs.
            finePercentage: Number(finePercentage).toFixed(2),         // %
            growthRate: Number(growthRate).toFixed(2),             // %
            delinquencyRate: Number(delinquencyRate).toFixed(2),        // %
        };
    } catch (e) {
        console.error("Error in getGlobalKPI:", e);
        throw new Error("Error al calcular KPIs globales");
    }
}







