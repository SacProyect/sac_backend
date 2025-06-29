import { event_type } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, InputError, InputGroupRecords, sumTransactions } from "./report.utils"
import { Event, Payment } from "../taxpayer/taxpayer.utils"
import { Decimal } from "@prisma/client/runtime/library"
import dayjs from "dayjs";
import isBetween from 'dayjs/plugin/isBetween';
import { es } from 'date-fns/locale';
import { formatInTimeZone } from 'date-fns-tz';

dayjs.extend(isBetween);

interface InputFiscalGroups {
    role: string,
    id?: string,
    startDate?: string,
    endDate?: string,
    userId?: string,
    supervisorId?: string;
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


export const getGroupRecord = async (data: InputGroupRecords) => {
    try {

        let group;

        // Si viene año y mes, se retorna solo ese mes
        if (data.month && data.year && data.id) {
            group = await db.fiscalGroup.findFirst({
                where: { id: data.id },
                include: {
                    GroupRecordMonth: {
                        include: {
                            records: {
                                include: {
                                    fiscal: { select: { name: true } }
                                }
                            }
                        }
                    }
                }
            });

            return {
                groupName: group?.name,
                records:
                    group?.GroupRecordMonth.find(
                        (rec) => rec.month === data.month && rec.year === data.year
                    )?.records ?? []
            };
        }

        // Si viene solo el año y el id, consolidamos todo el año
        if (data.year && data.id) {
            const fullGroup = await db.fiscalGroup.findFirst({
                where: { id: data.id },
                include: {
                    GroupRecordMonth: {
                        where: { year: data.year },
                        include: {
                            records: {
                                include: {
                                    fiscal: { select: { id: true, name: true } }
                                }
                            }
                        }
                    }
                }
            });

            const allRecords = fullGroup?.GroupRecordMonth.flatMap((month) => month.records) || [];

            const aggregated: Record<string, any> = {};

            for (const record of allRecords) {
                const key = `${record.fiscalId}-${record.process}`;

                const parseValue = (val: any) => {
                    const raw = typeof val === 'string' ? val : String(val ?? '0');
                    const clean = raw.replace(/[^0-9.]/g, '');
                    const parts = clean.split('.');

                    const valid = parts.length > 2 ? parts[0] : clean;
                    const result = parseFloat(valid);
                    const rounded = isNaN(result) ? 0 : parseFloat(result.toFixed(2));

                    console.log(`DEBUG record fiscal: ${record.fiscal.name}, process: ${record.process}`);
                    console.log(`   Raw value: ${val}, Cleaned: ${valid}, Parsed: ${rounded}`);

                    return rounded;
                };

                if (!aggregated[key]) {
                    aggregated[key] = {
                        fiscalId: record.fiscalId,
                        fiscal: { name: record.fiscal.name },
                        process: record.process,
                        collectedFines: parseValue(record.collectedFines),
                        collectedIva: parseValue(record.collectedIVA),
                        collectedIslr: parseValue(record.collectedISLR),
                        totalWarnings: record.warnings || 0,
                        totalFines: record.fines || 0,
                        totalCompromises: record.compromises || 0,
                        totalTaxpayers: record.taxpayers || 0,
                    };
                } else {
                    aggregated[key].collectedFines += parseValue(record.collectedFines);
                    aggregated[key].collectedIva += parseValue(record.collectedIVA);
                    aggregated[key].collectedIslr += parseValue(record.collectedISLR);
                    aggregated[key].totalWarnings += record.warnings || 0;
                    aggregated[key].totalFines += record.fines || 0;
                    aggregated[key].totalCompromises += record.compromises || 0;
                }
            }

            return {
                groupName: fullGroup?.name,
                records: Object.values(aggregated).map((rec) => ({
                    ...rec,
                    collectedFines: parseFloat(rec.collectedFines.toFixed(2)),
                    collectedIva: parseFloat(rec.collectedIva.toFixed(2)),
                    collectedIslr: parseFloat(rec.collectedIslr.toFixed(2)),
                })),
            };
        }

        throw new Error("Faltan parámetros para obtener el reporte");

    } catch (e) {
        console.error("Error en getGroupRecord:", e);
        throw new Error("No se pudo obtener el reporte de grupo.");
    }
};



export const getFiscalGroups = async (data: InputFiscalGroups) => {
    const { id, role, startDate, endDate, supervisorId } = data;
    const filters: any = {};

    const toUTC = (str?: string): Date | undefined => {
        if (!str) return undefined;
        const [y, m, d] = str.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    };

    const start = toUTC(startDate);
    const end = toUTC(endDate);

    if (role !== "ADMIN" && role !== "COORDINATOR" && role !== "SUPERVISOR") {
        throw new Error("Unauthorized");
    }

    try {
        if (role === "COORDINATOR") {
            const coordinatorGroup = await db.fiscalGroup.findUnique({
                where: { coordinatorId: data.userId },
            });

            if (!coordinatorGroup) throw new Error("Este usuario no coordina ningún grupo.");

            if (id && id !== coordinatorGroup.id) {
                throw new Error("Acceso no autorizado: este grupo no pertenece al coordinador.");
            }

            filters.id = id || coordinatorGroup.id;
        }

        if (id) filters.id = id;

        if (supervisorId) {
            const supervisor = await db.user.findUnique({
                where: { id: supervisorId },
                include: {
                    group: { select: { coordinator: { select: { name: true } } } },
                    supervised_members: {
                        include: {
                            taxpayer: {
                                where: {
                                    emition_date: {
                                        gte: start,
                                        lte: end,
                                    },
                                },
                                include: {
                                    event: {
                                        where: { date: { gte: start, lt: end } },
                                    },
                                    IVAReports: {
                                        where: { date: { gte: start, lt: end } },
                                    },
                                    ISLRReports: {
                                        where: { emition_date: { gte: start, lt: end } },
                                    },
                                },
                            },
                        },
                    },
                },
            });

            if (!supervisor) throw new Error("Supervisor no encontrado");

            let groupCollected = new Decimal(0);
            let totalFines = new Decimal(0);
            let collectedFines = new Decimal(0);
            let totalIva = new Decimal(0);
            let totalIslr = new Decimal(0);

            supervisor.supervised_members.forEach((member) => {
                member.taxpayer.forEach((taxpayer) => {
                    taxpayer.event?.forEach((e) => {
                        if (e.type === "FINE") {
                            totalFines = totalFines.plus(1);
                            collectedFines = collectedFines.plus(e.amount);
                            groupCollected = groupCollected.plus(e.amount);
                        }
                    });

                    taxpayer.IVAReports?.forEach((rep) => {
                        if (rep.paid) {
                            totalIva = totalIva.plus(rep.paid);
                            groupCollected = groupCollected.plus(rep.paid);
                        }
                    });

                    taxpayer.ISLRReports?.forEach((rep) => {
                        if (rep.paid) {
                            totalIslr = totalIslr.plus(rep.paid);
                            groupCollected = groupCollected.plus(rep.paid);
                        }
                    });
                });
            });

            return [{
                id: supervisorId,
                name: `Supervisión de ${supervisor.name}`,
                members: supervisor.supervised_members,
                totalFines,
                collectedFines,
                totalIva,
                totalIslr,
                collected: groupCollected,
                supervisorsStats: [],
                coordinatorName: supervisor.group?.coordinator.name,
            }];
        }

        const groups = await db.fiscalGroup.findMany({
            where: filters,
            include: {
                members: {
                    include: {
                        taxpayer: {
                            where: {
                                emition_date: {
                                    gte: start,
                                    lte: end,
                                },
                            },
                            include: {
                                event: {
                                    where: {
                                        date: {
                                            gte: start,
                                            lt: end,
                                        },
                                    },
                                },
                                IVAReports: {
                                    where: {
                                        date: {
                                            gte: start,
                                            lt: end,
                                        },
                                    },
                                },
                                ISLRReports: {
                                    where: {
                                        emition_date: {
                                            gte: start,
                                            lt: end,
                                        },
                                    },
                                },
                            },
                        },
                        supervised_members: {
                            include: {
                                taxpayer: {
                                    include: {
                                        ISLRReports: {
                                            where: {
                                                emition_date: {
                                                    gte: start,
                                                    lte: end,
                                                }
                                            }
                                        },
                                        IVAReports: {
                                            where: {
                                                date: {
                                                    gte: start,
                                                    lte: end,
                                                }
                                            }
                                        },
                                        event: {
                                            where: {
                                                date: {
                                                    gte: start,
                                                    lte: end,
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                },
            },
        });

        const updatedGroups = groups.map((group) => {
            let groupCollected = new Decimal(0);
            let totalFines = new Decimal(0); // número de multas
            let collectedFines = new Decimal(0); // monto recaudado por multas
            let totalIva = new Decimal(0);
            let totalIslr = new Decimal(0);

            const supervisorStats: {
                supervisorId: string;
                collectedIva: Decimal;
                collectedISLR: Decimal;
                collectedFines: Decimal;
                totalFines: Decimal;
                totalCollected: Decimal;
            }[] = [];

            const supervisors = group.members.filter((m) => m.role === "SUPERVISOR");

            if (supervisors.length === 0) {
                supervisorStats.push({
                    supervisorId: "SUPERVISOR_1",
                    collectedIva: new Decimal(0),
                    collectedISLR: new Decimal(0),
                    collectedFines: new Decimal(0),
                    totalFines: new Decimal(0),
                    totalCollected: new Decimal(0),
                });
                supervisorStats.push({
                    supervisorId: "SUPERVISOR_2",
                    collectedIva: new Decimal(0),
                    collectedISLR: new Decimal(0),
                    collectedFines: new Decimal(0),
                    totalFines: new Decimal(0),
                    totalCollected: new Decimal(0),
                });
            } else {
                for (const supervisor of supervisors) {
                    let collectedIva = new Decimal(0);
                    let collectedISLR = new Decimal(0);
                    let collectedFinesSup = new Decimal(0);
                    let totalFinesSup = new Decimal(0);
                    let totalCollected = new Decimal(0);

                    const supervised_members = supervisor.supervised_members

                    for (const member of supervised_members) {

                        for (const taxp of member.taxpayer) {
                            taxp.ISLRReports.forEach((rep) => {
                                if (rep.paid) {
                                    collectedISLR = collectedISLR.plus(rep.paid);
                                    totalCollected = totalCollected.plus(rep.paid);
                                }
                            });

                            taxp.IVAReports.forEach((rep) => {
                                if (rep.paid) {
                                    collectedIva = collectedIva.plus(rep.paid);
                                    totalCollected = totalCollected.plus(rep.paid);
                                }
                            });

                            taxp.event.forEach((ev) => {
                                if (ev.type === "FINE") {
                                    collectedFinesSup = collectedFinesSup.plus(ev.amount);
                                    totalFinesSup = totalFinesSup.plus(1);
                                    totalCollected = totalCollected.plus(ev.amount);
                                }
                            });
                        }
                    }

                    supervisorStats.push({
                        supervisorId: supervisor.id,
                        collectedIva,
                        collectedISLR,
                        collectedFines: collectedFinesSup,
                        totalFines: totalFinesSup,
                        totalCollected,
                    });
                }
            }

            // Estadísticas del grupo
            group.members.forEach((member) => {
                member.taxpayer.forEach((contributor) => {
                    contributor.event.forEach((e) => {
                        if (e.type === "FINE") {
                            totalFines = totalFines.plus(1);
                            collectedFines = collectedFines.plus(e.amount);
                            groupCollected = groupCollected.plus(e.amount);
                        }
                    });

                    contributor.IVAReports.forEach((report) => {
                        if (report.paid) {
                            totalIva = totalIva.plus(report.paid);
                            groupCollected = groupCollected.plus(report.paid);
                        }
                    });

                    contributor.ISLRReports.forEach((report) => {
                        if (report.paid) {
                            totalIslr = totalIslr.plus(report.paid);
                            groupCollected = groupCollected.plus(report.paid);
                        }
                    });
                });
            });

            return {
                ...group,
                totalFines,
                collectedFines,
                totalIva,
                totalIslr,
                collected: groupCollected,
                supervisorsStats: supervisorStats,
            };
        });

        return updatedGroups;
    } catch (e) {
        console.error(e);
        throw e;
    }
};

const getMonthName = (key: string) => {
    const [year, month] = key.split("-");
    const date = new Date(Number(year), Number(month) - 1);
    return date.toLocaleString("es-VE", { month: "long", year: "numeric" });
};


export const getGlobalPerformance = async () => {
    try {
        const now = new Date();
        const currentYear = now.getUTCFullYear();
        const startDate = new Date(Date.UTC(currentYear - 1, 11, 1)); // 1 Dic del año anterior
        const endDate = new Date(Date.UTC(currentYear + 1, 0, 1));    // 1 Ene del próximo año

        // Obtener reportes de IVA desde diciembre del año pasado hasta diciembre actual
        const ivaReports = await db.iVAReports.findMany({
            where: {
                date: {
                    gte: startDate,
                    lt: endDate,
                },
            },
        });

        // Agrupar IVA por mes (en UTC)
        const ivaByMonth: Record<string, number> = {};
        ivaReports.forEach((report) => {
            const date = new Date(report.date);
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth() + 1;
            const key = `${year}-${String(month).padStart(2, "0")}`;
            ivaByMonth[key] = (ivaByMonth[key] || 0) + Number(report.paid);
        });

        type Result = {
            month: string;
            ivaAmount: number;
            previousIva: number;
            percentageChange: number;
        };

        const results: Result[] = [];

        let previousMonthKey = `${currentYear - 1}-12`;
        let previousIva = ivaByMonth[previousMonthKey] || 0;

        for (let month = 1; month <= 12; month++) {
            const currentMonthKey = `${currentYear}-${String(month).padStart(2, "0")}`;
            const currentIva = ivaByMonth[currentMonthKey] || 0;

            let percentageChange = 0;
            if (currentIva !== 0 && previousIva !== 0) {
                percentageChange = ((currentIva - previousIva) / previousIva) * 100;
            }

            results.push({
                month: currentMonthKey,
                ivaAmount: parseFloat(currentIva.toFixed(2)),
                previousIva: parseFloat(previousIva.toFixed(2)),
                percentageChange: parseFloat(percentageChange.toFixed(2)),
            });

            previousIva = currentIva;
            previousMonthKey = currentMonthKey;
        }

        return results;
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
    reports: { date: Date; excess: Decimal | null; iva: Decimal | null }[]
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


export async function getIndividualIvaReport(id: string) {
    try {
        const ivaReports = await db.iVAReports.findMany({
            where: { taxpayerId: id },
            orderBy: { date: 'asc' },
            include: { taxpayer: true }
        });

        const firstReportDateUTC = new Date(ivaReports[0].date.toISOString());
        const lastReportDateUTC = new Date(ivaReports[ivaReports.length - 1].date.toISOString());

        const expectedAmount = await db.indexIva.findMany({
            where: {
                created_at: { gte: firstReportDateUTC },
                expires_at: { lte: lastReportDateUTC },
                contract_type: ivaReports[0].taxpayer.contract_type
            },
            orderBy: { created_at: 'asc' }
        });

        const fallback = await db.indexIva.findFirst({
            where: { contract_type: ivaReports[0].taxpayer.contract_type },
            orderBy: { created_at: 'desc' }
        });

        const performanceByMonth: Record<string, {
            performance: string;
            variationFromPrevious?: string;
        }> = {};

        let lastPerformance: number | null = null;

        for (const report of ivaReports) {
            const reportDateUTC = report.date;
            const month = formatInTimeZone(reportDateUTC, 'UTC', 'MMMM', { locale: es });

            const applicable = expectedAmount.find(exp => {
                const createdUTC = new Date(exp.created_at.toISOString());
                const expiresUTC = exp.expires_at ? new Date(exp.expires_at.toISOString()) : null;

                return (
                    createdUTC <= reportDateUTC &&
                    (!expiresUTC || expiresUTC > reportDateUTC)
                );
            }) || fallback;

            if (!applicable) {
                performanceByMonth[month] = { performance: 'N/A' };
                continue;
            }

            const base = Number(applicable.base_amount);
            const paid = Number(report.paid);
            const performance = ((paid - base) / base) * 100;

            const entry: typeof performanceByMonth[string] = {
                performance: `${performance.toFixed(2)}%`
            };

            if (lastPerformance !== null && lastPerformance !== 0) {
                const variation = ((performance - lastPerformance) / Math.abs(lastPerformance)) * 100;
                entry.variationFromPrevious = `${variation.toFixed(2)}%`;
            }

            if (lastPerformance !== null && lastPerformance === 0) {
                entry.variationFromPrevious = `${performance.toFixed(2)}%`
            }

            if (lastPerformance === null) {
                entry.variationFromPrevious = `${performance.toFixed(2)}%`;
            }

            performanceByMonth[month] = entry;
            lastPerformance = performance;
        }

        const completeMonths = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];

        const actualMonths = Object.keys(performanceByMonth);

        for (const month of completeMonths) {
            if (!actualMonths.includes(month)) {
                performanceByMonth[month] = {
                    performance: "0.00%",
                    variationFromPrevious: "0.00%"
                };
            }
        }

        return performanceByMonth;


    } catch (e) {
        console.error(e);
        throw new Error("Failed to fetch individual IVA report");
    }
}

export async function getBestSupervisorByGroups() {


    try {

        const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
        const endOfYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));


        const groups = await db.fiscalGroup.findMany({
            include: {
                members: {
                    include: {
                        supervised_members: {
                            include: {
                                taxpayer: {
                                    include: {
                                        IVAReports: {
                                            where: {
                                                date: {
                                                    gte: startOfYear,
                                                    lte: endOfYear
                                                }
                                            }
                                        },
                                        ISLRReports: {
                                            where: {
                                                emition_date: {
                                                    gte: startOfYear,
                                                    lte: endOfYear
                                                }
                                            }
                                        },
                                        event: {
                                            where: {
                                                date: {
                                                    gte: startOfYear,
                                                    lte: endOfYear
                                                }
                                            }
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const result: Record<string, {
            best: string;
            worse: string;
            supervisors: {
                name: string;
                collectedIva: Decimal;
                collectedIslr: Decimal;
                collectedFines: Decimal;
                total: Decimal;
            }[];
        }> = {};

        // 👇 Procesar cada grupo en paralelo
        await Promise.all(groups.map(async (group) => {
            const supervisors = group.members.filter((m) => m.role === "SUPERVISOR");

            // 👇 Procesar cada supervisor en paralelo
            const supervisorScores = await Promise.all(
                supervisors.map(async (supervisor) => {
                    // Inicializar montos
                    let collectedIVA = new Decimal(0);
                    let collectedISLR = new Decimal(0);
                    let collectedFines = new Decimal(0);
                    let totalCollected = new Decimal(0);

                    // Reducir anidamiento: combinar todos los taxpayers del supervisor
                    const allTaxpayers = supervisor.supervised_members.flatMap(f => f.taxpayer);

                    for (const taxp of allTaxpayers) {
                        for (const rep of taxp.IVAReports) {
                            collectedIVA = collectedIVA.plus(rep.paid);
                            totalCollected = totalCollected.plus(rep.paid);
                        }

                        for (const rep of taxp.ISLRReports) {
                            collectedISLR = collectedISLR.plus(rep.paid);
                            totalCollected = totalCollected.plus(rep.paid);
                        }

                        for (const ev of taxp.event) {
                            if (ev.type === "FINE") {
                                collectedFines = collectedFines.plus(ev.amount);
                                totalCollected = totalCollected.plus(ev.amount);
                            }
                        }
                    }

                    return {
                        name: supervisor.name,
                        collectedIva: collectedIVA,
                        collectedIslr: collectedISLR,
                        collectedFines: collectedFines,
                        total: totalCollected,
                    };
                })
            );

            // Ordenar supervisores por recaudación total
            const sorted = supervisorScores.sort((a, b) => Number(b.total) - Number(a.total));

            result[group.name] = {
                best: sorted[0]?.name ?? "N/A",
                worse: sorted.at(-1)?.name ?? "N/A",
                supervisors: sorted,
            };
        }));

        return result;
    } catch (e) {
        console.error(e);
        throw new Error("Error al obtener el mejor supervisor de cada grupo.");
    }
}


export async function getTopFiscals() {

    try {
        const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
        const endOfYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));

        const fiscals = await db.user.findMany({
            where: {
                role: "FISCAL",
            },
            include: {
                taxpayer: {
                    include: {
                        ISLRReports: {
                            where: {
                                emition_date: {
                                    gte: startOfYear,
                                    lte: endOfYear,
                                }
                            }
                        },
                        IVAReports: {
                            where: {
                                date: {
                                    gte: startOfYear,
                                    lte: endOfYear
                                }
                            }
                        },
                        event: {
                            where: {
                                date: {
                                    gte: startOfYear,
                                    lte: endOfYear,
                                }
                            }
                        },
                    }
                }
            }
        });


        const fiscalStats: {
            name: string;
            collectedIva: Decimal;
            collectedIslr: Decimal;
            collectedFines: Decimal;
            total: Decimal;
        }[] = [];

        for (const fiscal of fiscals) {
            let collectedFines = new Decimal(0);
            let collectedIVA = new Decimal(0);
            let collectedISLR = new Decimal(0);
            let totalCollected = new Decimal(0);

            for (const taxp of fiscal.taxpayer) {

                taxp.ISLRReports.forEach((rep) => {
                    collectedISLR = collectedISLR.plus(rep.paid);
                    totalCollected = totalCollected.plus(rep.paid)
                });

                taxp.IVAReports.forEach((rep) => {
                    collectedIVA = collectedIVA.plus(rep.paid);
                    totalCollected = totalCollected.plus(rep.paid)
                });

                taxp.event.forEach((ev) => {
                    if (ev.type === "FINE") {
                        collectedFines = collectedFines.plus(ev.amount);
                        totalCollected = totalCollected.plus(ev.amount);
                    }
                })
            }

            fiscalStats.push({
                name: fiscal.name,
                collectedIva: collectedIVA,
                collectedIslr: collectedISLR,
                collectedFines: collectedFines,
                total: totalCollected,
            });
        };

        // Ordenar por total recaudado (de mayor a menor)
        const sorted = fiscalStats.sort((a, b) => Number(b.total.minus(a.total)));

        return sorted;
    } catch (e) {

        throw new Error("No se pudo obtener el top fiscales.")
    }
}

export async function getTopFiveByGroup() {
    try {
        const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
        const endOfYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));

        const groups = await db.fiscalGroup.findMany({
            include: {
                members: {
                    where: { role: "FISCAL" },
                    include: {
                        taxpayer: {
                            include: {
                                ISLRReports: {
                                    where: {
                                        emition_date: {
                                            gte: startOfYear,
                                            lt: endOfYear
                                        }
                                    }
                                },
                                IVAReports: {
                                    where: {
                                        date: {
                                            gte: startOfYear,
                                            lt: endOfYear
                                        }
                                    }
                                },
                                event: {
                                    where: {
                                        date: {
                                            gte: startOfYear,
                                            lt: endOfYear
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const result: Record<string, { name: string; totalCollected: Decimal }[]> = {};

        for (const group of groups) {
            const fiscalScores = group.members.map((fiscal) => {
                let totalCollected = new Decimal(0);

                for (const taxp of fiscal.taxpayer) {
                    for (const rep of taxp.ISLRReports) {
                        totalCollected = totalCollected.plus(rep.paid);
                    }

                    for (const rep of taxp.IVAReports) {
                        totalCollected = totalCollected.plus(rep.paid);
                    }

                    for (const ev of taxp.event) {
                        if (ev.type === "FINE") {
                            totalCollected = totalCollected.plus(ev.amount);
                        }
                    }
                }

                return {
                    name: fiscal.name,
                    totalCollected
                };
            });

            // Ordenar y tomar los 5 con mayor recaudación
            const topFive = fiscalScores
                .sort((a, b) => Number(b.totalCollected) - Number(a.totalCollected))
                .slice(0, 5);

            result[group.name] = topFive;
        }

        return result;
    } catch (e) {
        console.error(e);
        throw new Error("Error al obtener los top fiscales por grupo");
    }
}

export async function getMonthlyGrowth() {
    try {
        const now = new Date();
        const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const nextMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
        const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

        const groups = await db.fiscalGroup.findMany({
            include: {
                coordinator: { select: { name: true } },
                members: {
                    include: {
                        taxpayer: {
                            include: {
                                ISLRReports: {
                                    where: {
                                        emition_date: {
                                            gte: prevMonthStart,
                                            lt: nextMonthStart
                                        }
                                    }
                                },
                                IVAReports: {
                                    where: {
                                        date: {
                                            gte: prevMonthStart,
                                            lt: nextMonthStart
                                        }
                                    }
                                },
                                event: {
                                    where: {
                                        date: {
                                            gte: prevMonthStart,
                                            lt: nextMonthStart
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        const growthResults: {
            groupName: string;
            coordinatorName: string;
            previousMonth: Decimal;
            currentMonth: Decimal;
            growthPercentage: number;
        }[] = [];

        for (const group of groups) {
            let previousTotal = new Decimal(0);
            let currentTotal = new Decimal(0);

            const coordinator = group.coordinator.name

            const coordinatorName = coordinator || "Sin coordinador";

            const fiscals = group.members.filter(m => m.role === "FISCAL");

            for (const fiscal of fiscals) {
                for (const taxp of fiscal.taxpayer) {
                    for (const rep of taxp.ISLRReports) {
                        const date = new Date(rep.emition_date);
                        const amount = new Decimal(rep.paid);

                        if (date >= currentMonthStart && date < nextMonthStart) {
                            currentTotal = currentTotal.plus(amount);
                        } else if (date >= prevMonthStart && date < currentMonthStart) {
                            previousTotal = previousTotal.plus(amount);
                        }
                    }

                    for (const rep of taxp.IVAReports) {
                        const date = new Date(rep.date);
                        const amount = new Decimal(rep.paid);

                        if (date >= currentMonthStart && date < nextMonthStart) {
                            currentTotal = currentTotal.plus(amount);
                        } else if (date >= prevMonthStart && date < currentMonthStart) {
                            previousTotal = previousTotal.plus(amount);
                        }
                    }

                    for (const ev of taxp.event) {
                        if (ev.type !== "FINE") continue;
                        const date = new Date(ev.date);
                        const amount = new Decimal(ev.amount);

                        if (date >= currentMonthStart && date < nextMonthStart) {
                            currentTotal = currentTotal.plus(amount);
                        } else if (date >= prevMonthStart && date < currentMonthStart) {
                            previousTotal = previousTotal.plus(amount);
                        }
                    }
                }
            }

            const growthPercentage = previousTotal.equals(0)
                ? currentTotal.greaterThan(0) ? 100 : 0
                : Number(currentTotal.minus(previousTotal).dividedBy(previousTotal).times(100));

            growthResults.push({
                groupName: group.name,
                coordinatorName: coordinatorName,
                previousMonth: previousTotal,
                currentMonth: currentTotal,
                growthPercentage: Math.round(growthPercentage * 100) / 100,
            });
        }

        growthResults.sort((a, b) => b.growthPercentage - a.growthPercentage);

        return growthResults;
    } catch (e) {
        console.error(e);
        throw new Error("No se pudo calcular el crecimiento mensual.");
    }
}


export async function getTaxpayerCompliance() {
    try {
        const startOfYear = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 1));
        const endOfYear = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1));

        const taxpayers = await db.taxpayer.findMany({
            where: {
                IVAReports: {
                    some: {
                        date: {
                            gte: startOfYear,
                            lt: endOfYear,
                        },
                    },
                },
            },
            include: {
                IVAReports: {
                    where: {
                        date: {
                            gte: startOfYear,
                            lt: endOfYear,
                        },
                    },
                },
                ISLRReports: {
                    where: {
                        emition_date: {
                            gte: startOfYear,
                            lt: endOfYear,
                        },
                    },
                },
                event: {
                    where: {
                        date: {
                            gte: startOfYear,
                            lt: endOfYear,
                        },
                    },
                },
            },
        });

        const indexIva = await db.indexIva.findMany();

        const high: any[] = [];
        const medium: any[] = [];
        const low: any[] = [];

        for (const taxpayer of taxpayers) {
            const contractType = taxpayer.contract_type;
            const ivaReports = taxpayer.IVAReports;

            let monthsWithCompliance = 0;
            let totalIVA = new Decimal(0);
            let totalISLR = new Decimal(0);
            let totalFines = new Decimal(0);
            let totalCollected = new Decimal(0);

            // console.log(`📄 Evaluando taxpayer: ${taxpayer.name} (${taxpayer.rif}) - Tipo de contrato: ${contractType}`);

            for (const report of ivaReports) {
                const index = indexIva.find(i =>
                    i.contract_type === contractType &&
                    report.date >= i.created_at &&
                    (i.expires_at === null || report.date < i.expires_at)
                );

                totalIVA = totalIVA.plus(report.paid);
                totalCollected = totalCollected.plus(report.paid);

                // console.log(`  📆 Fecha Reporte IVA: ${report.date.toISOString()}`);
                if (index) {
                    // console.log(`  🔍 Índice encontrado: base_amount=${index.base_amount.toString()}, desde=${index.created_at.toISOString()} hasta=${index.expires_at?.toISOString() ?? "∞"}`);
                    // console.log(`  💰 Pago IVA del mes: ${report.paid.toString()}`);
                    if (new Decimal(report.paid).gte(index.base_amount)) {
                        monthsWithCompliance += 1;
                        // console.log("  ✅ Cumple con el monto mínimo del índice.");
                    } else {
                        // console.log("  ❌ No cumple con el monto mínimo del índice.");
                    }
                } else {
                    // console.log("  ⚠️ No se encontró índice válido para este reporte.");
                }
            }

            for (const rep of taxpayer.ISLRReports) {
                totalISLR = totalISLR.plus(rep.paid);
                totalCollected = totalCollected.plus(rep.paid);
            }

            for (const ev of taxpayer.event) {
                if (ev.type === "FINE") {
                    totalFines = totalFines.plus(ev.amount);
                    totalCollected = totalCollected.plus(ev.amount);
                }
            }

            const monthsReported = ivaReports.length;
            const compliance = monthsReported > 0
                ? Math.round((monthsWithCompliance / monthsReported) * 100)
                : 0;

            // console.log(`📊 Cumplimiento final de ${taxpayer.name}: ${compliance}% (${monthsWithCompliance}/${monthsReported})\n`);

            const taxpayerResult = {
                name: taxpayer.name,
                rif: taxpayer.rif,
                compliance,
                totalIVA,
                totalISLR,
                totalFines,
                totalCollected,
            };

            if (compliance >= 67) high.push(taxpayerResult);
            else if (compliance >= 34) medium.push(taxpayerResult);
            else low.push(taxpayerResult);
        }

        high.sort((a, b) => b.compliance - a.compliance);
        medium.sort((a, b) => b.compliance - a.compliance);
        low.sort((a, b) => b.compliance - a.compliance);

        return { high, medium, low };

    } catch (e) {
        console.error(e);
        throw new Error("Error al calcular el cumplimiento de IVA.");
    }
}


export async function getExpectedAmount() {
    try {
        // Obtener todos los IVAReports con taxpayer asociado
        const ivaReports = await db.iVAReports.findMany({
            include: {
                taxpayer: true,
            },
        });

        // Obtener los índices de IVA más recientes por tipo de contrato
        const indexIva = await db.indexIva.findMany();

        let totalExpected = new Decimal(0);
        let totalPaid = new Decimal(0);
        let reportCount = 0;

        for (const report of ivaReports) {
            const taxpayer = report.taxpayer;
            if (!taxpayer) continue;

            const contractType = taxpayer.contract_type;

            // Buscar el índice correspondiente a la fecha del reporte
            const index = indexIva.find(i =>
                i.contract_type === contractType &&
                report.date >= i.created_at &&
                (i.expires_at === null || report.date < i.expires_at)
            );

            if (!index) continue;

            totalExpected = totalExpected.plus(index.base_amount);
            totalPaid = totalPaid.plus(report.paid);
            reportCount++;
        }

        const difference = totalPaid.minus(totalExpected);
        const percentageDifference = totalExpected.gt(0)
            ? difference.dividedBy(totalExpected).times(100).toDecimalPlaces(2)
            : new Decimal(0);

        return {
            totalReports: reportCount,
            totalExpected: totalExpected.toNumber(),
            totalPaid: totalPaid.toNumber(),
            difference: difference.toNumber(),
            percentage: percentageDifference.toNumber(), // positivo: superávit, negativo: déficit
            status: percentageDifference.gte(0) ? "superávit" : "déficit",
        };

    } catch (e) {
        console.error("Error al calcular la recaudación esperada:", e);
        throw new Error("Error al calcular la recaudación esperada.");
    }
}