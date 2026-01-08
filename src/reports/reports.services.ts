import { event_type } from "@prisma/client"
import { db } from "../utils/db.server"
import { avgValue, CompleteReportInput, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, InputError, InputGroupRecords, MonthIva, MonthlyRow, sumTransactions } from "./report.utils"
import { Event, Payment } from "../taxpayer/taxpayer.utils"
import { Decimal } from "@prisma/client/runtime/library"
import dayjs from "dayjs";
import isBetween from 'dayjs/plugin/isBetween';
import { es, id } from 'date-fns/locale';
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

    const currentYear = new Date().getUTCFullYear();

    // 👉 Convert provided dates to UTC; fallback to full current year range if none provided
    const toUTC = (str?: string): Date | undefined => {
        if (!str) return undefined;
        const [y, m, d] = str.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    };

    const start = startDate ? toUTC(startDate) : new Date(Date.UTC(currentYear, 0, 1));
    const end = endDate ? toUTC(endDate) : new Date(Date.UTC(currentYear + 1, 0, 1)); // exclusivo

    console.log(toUTC(startDate));
    console.log(toUTC(endDate));

    // 👉 Restrict access to authorized roles only
    if (role !== "ADMIN" && role !== "COORDINATOR" && role !== "SUPERVISOR") {
        throw new Error("Unauthorized");
    }

    try {
        // 🔒 Coordinators can only access their own group
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

        // If an explicit group ID is provided, use it as filter
        if (id) filters.id = id;

        // 🔍 Supervisor-specific report: stats for the group supervised by `supervisorId`
        if (supervisorId) {
            const supervisor = await db.user.findUnique({
                where: { id: supervisorId },
                include: {
                    group: { select: { coordinator: { select: { name: true } }, name: true, } },
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

            // 🧮 Aggregated stats for this supervisor's group
            let groupCollected = new Decimal(0);
            let totalFines = new Decimal(0);
            let collectedFines = new Decimal(0);
            let totalIva = new Decimal(0);
            let totalIslr = new Decimal(0);

            // 🔄 Loop over supervised taxpayers
            supervisor.supervised_members.forEach((member) => {
                member.taxpayer.forEach((taxpayer) => {
                    taxpayer.event?.forEach((e) => {
                        if (e.type === "FINE" && e.debt.equals(0)) {
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

            // ✅ Return only this supervisor’s group performance
            return [{
                id: supervisor.groupId,
                name: supervisor.group?.name,
                members: supervisor.supervised_members,
                totalFines,
                collectedFines,
                totalIva,
                totalIslr,
                collected: groupCollected,
                supervisorsStats: [],
                coordinatorName: supervisor.group?.coordinator?.name,
            }];
        }

        // 🔍 Admins and coordinators: fetch all matching groups
        const groups = await db.fiscalGroup.findMany({
            where: filters,
            include: {
                members: {
                    include: {
                        taxpayer: {
                            // where: {
                            //     emition_date: {
                            //         gte: start,
                            //         lte: end,
                            //     },
                            // },
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

        // 🔄 For each group, calculate collection and breakdown per supervisor
        const updatedGroups = groups.map((group) => {
            let groupCollected = new Decimal(0);
            let totalFines = new Decimal(0); // número de multas
            let collectedFines = new Decimal(0); // monto recaudado por multas
            let totalIva = new Decimal(0);
            let totalIslr = new Decimal(0);

            const supervisorStats: {
                supervisorId: string;
                supervisorName: string;
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
                    supervisorName: "NO ENCONTRADO",
                    collectedIva: new Decimal(0),
                    collectedISLR: new Decimal(0),
                    collectedFines: new Decimal(0),
                    totalFines: new Decimal(0),
                    totalCollected: new Decimal(0),
                });
                supervisorStats.push({
                    supervisorId: "SUPERVISOR_2",
                    supervisorName: "NO ENCONTRADO",
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
                                if (ev.type === "FINE" && ev.debt.equals(0)) {
                                    collectedFinesSup = collectedFinesSup.plus(ev.amount);
                                    totalFinesSup = totalFinesSup.plus(1);
                                    totalCollected = totalCollected.plus(ev.amount);
                                }
                            });
                        }
                    }

                    supervisorStats.push({
                        supervisorId: supervisor.id,
                        supervisorName: supervisor.name,
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

                // console.log(`📊 [${group.name}] Miembro: ${member.name}`);
                let memberIslrTotal = new Decimal(0);

                member.taxpayer.forEach((contributor) => {
                    contributor.event.forEach((e) => {
                        if (e.type === "FINE" && e.debt.equals(0)) {
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

                    // console.log("Member:", member.name);
                    // console.log("ISLRReports count:", member.taxpayer.flatMap(t => t.ISLRReports).length);

                    contributor.ISLRReports.forEach((report) => {
                        // console.log(`— ISLR pagado por ${contributor.name || contributor.rif}: ${report.paid}`);
                        if (report.paid) {
                            totalIslr = totalIslr.plus(report.paid);
                            groupCollected = groupCollected.plus(report.paid);
                            memberIslrTotal = memberIslrTotal.plus(report.paid); // ← FALTABA ESTA LÍNEA
                        }
                    });
                });

                // console.log(`✅ Total ISLR de ${member.name}: ${totalIslr.toFixed(2)}\n`)
                // console.log(`✅ Total IVA de ${member.name}: ${totalIva.toFixed(2)}\n`)
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


// Assumptions:
// - Tables: iVAReports(date, paid, taxpayerId, ...), taxpayer(id, contract_type, created_at), indexIva(contract_type, base_amount, created_at, expires_at)
// - All timestamps are stored in UTC (recommended).
// - "No IVA reports" means no reports within the current year.
// - "Index vigente" for a given month/day = idx.created_at <= date && (idx.expires_at is null || date < idx.expires_at)
// - If multiple indexes match, use the one with the latest created_at (most recent in effect).

export const getGlobalPerformance = async (date: Date): Promise<MonthlyRow[]> => {
    try {
        if (!date) {
            const now = new Date();
            date = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
        }
        const year = date.getUTCFullYear();

        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

        // 1) Taxpayers with emition_date in current year
        const taxpayers = await db.taxpayer.findMany({
            where: { emition_date: { gte: startOfYear, lt: startOfNextYear } },
            select: { id: true, contract_type: true, emition_date: true },
        });

        // 2) IVA reports for those taxpayers in current year
        const ivaReports = await db.iVAReports.findMany({
            where: {
                taxpayerId: { in: taxpayers.map(t => t.id) },
                date: { gte: startOfYear, lt: startOfNextYear },
            },
            select: { taxpayerId: true, date: true, paid: true },
        });

        // 3) IndexIva table
        const indexes = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

        // Group indices by contract_type, sorted by created_at asc
        const idxByContract = new Map<string, typeof indexes>();
        for (const ct of new Set(indexes.map(i => i.contract_type))) {
            idxByContract.set(
                ct,
                indexes
                    .filter(i => i.contract_type === ct)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            );
        }

        // Helper: get active index for a date and contract_type (latest created_at that is active)
        const getIndexFor = (contractType: string, refDate: Date) => {
            const list = idxByContract.get(contractType);
            if (!list || list.length === 0) return null;

            let chosen: (typeof list)[number] | null = null;
            const ref = refDate.getTime();
            for (const idx of list) {
                const c = new Date(idx.created_at).getTime();
                const e = idx.expires_at ? new Date(idx.expires_at).getTime() : null;
                const active = c <= ref && (e === null || ref < e);
                if (active && (!chosen || c > new Date(chosen.created_at).getTime())) {
                    chosen = idx;
                }
            }
            return chosen;
        };

        // Aggregate realAmount by month key
        const realByMonth = new Map<string, number>();
        for (const r of ivaReports) {
            const d = new Date(r.date);
            const key = `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            realByMonth.set(key, (realByMonth.get(key) ?? 0) + Number(r.paid ?? 0));
        }

        // Build rows for all 12 months of the year
        const rows: MonthlyRow[] = [];

        for (let m = 0; m <= 11; m++) {
            const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
            const monthStart = new Date(Date.UTC(year, m, 1));
            const monthEnd = new Date(Date.UTC(year, m + 1, 1));
            const midMonth = new Date(Date.UTC(year, m, 15));

            // realAmount
            const realAmount = Number((realByMonth.get(monthKey) ?? 0).toFixed(2));

            // expectedAmount: add index vigente for EVERY taxpayer emitted in the target year
            let expected = new Decimal(0);
            for (const t of taxpayers) {
                const idx = getIndexFor(t.contract_type, midMonth);
                if (idx?.base_amount != null) {
                    expected = expected.plus(idx.base_amount);
                }
            }

            // taxpayersEmitted by emition_date in this month
            const taxpayersEmitted = taxpayers.filter(t => {
                const e = new Date(t.emition_date);
                return e >= monthStart && e < monthEnd;
            }).length;

            rows.push({
                month: monthKey,
                expectedAmount: Number(expected.toFixed(2)),
                realAmount,
                taxpayersEmitted,
            });
        }

        return rows;
    } catch (error) {
        console.error("Error in getGlobalPerformance:", error);
        throw new Error("Can't get the global performance");
    }
};



export async function getIvaByMonth(date: Date): Promise<{
    year: number;
    months: MonthIva[];
    totalIvaCollected: number;
}> {
    // Use UTC to avoid timezone edge cases
    if (!date) {
        const now = new Date();
        date = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    }
    const year = date.getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    // Pre-fill the 12 months with zero
    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    const buckets: { amount: Decimal }[] = Array.from({ length: 12 }, () => ({ amount: new Decimal(0) }));

    // 1) Pull only what we need: date + paid within the year
    const ivaReports = await db.iVAReports.findMany({
        where: {
            date: { gte: start, lt: end }, // lt avoids leaking into next year
            AND: {
                taxpayer: {
                    emition_date: {
                        gte: start,
                        lte: end,
                    }
                }
            }
        },
        select: { date: true, paid: true },
    });

    // 2) Aggregate by month (UTC)
    for (const rep of ivaReports) {
        if (!rep?.date) continue;
        const m = new Date(rep.date).getUTCMonth(); // 0..11
        buckets[m].amount = buckets[m].amount.plus(new Decimal(rep.paid ?? 0));
    }

    // 3) Build response
    const months: MonthIva[] = buckets.map((b, idx) => ({
        monthIndex: idx,
        monthName: monthNames[idx],
        ivaCollected: Number(b.amount.toFixed(2)),
    }));

    const totalIvaCollected = Number(
        buckets.reduce((acc, b) => acc.plus(b.amount), new Decimal(0)).toFixed(2)
    );

    return { year, months, totalIvaCollected };
}

export async function debugQuery() {
    // Get the full date range for year 2025
    const startOf2025 = new Date(Date.UTC(2025, 0, 1));
    const endOf2025 = new Date(Date.UTC(2026, 0, 1));
    const cutoffDate = new Date(Date.UTC(2025, 0, 1)); // beginning of 2025

    try {
        // Get all IVA reports from 2025
        const ivaReports2025 = await db.iVAReports.findMany({
            where: {
                date: {
                    gte: startOf2025,
                    lt: endOf2025,
                },
            },
            include: {
                taxpayer: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        // Filter reports where taxpayer was created before 2025
        const mismatched = ivaReports2025.filter(
            (iva) => iva.taxpayer.emition_date < cutoffDate
        );

        console.log(`📊 Total IVA reports in 2025: ${ivaReports2025.length}`);
        console.log(`🚨 IVA reports in 2025 from taxpayers created before 2025: ${mismatched.length}`);

        if (mismatched.length > 0) {
            console.log("🧾 Taxpayers with mismatched dates:");
            mismatched.forEach((item, index) => {
                console.log(
                    `#${index + 1} - RIF: ${item.taxpayer.rif} | Emitted: ${item.taxpayer.emition_date.toISOString()} | IVA Date: ${item.date.toISOString()}`
                );
            });
        }

        return mismatched;

    } catch (e) {
        console.error("❌ Error during debugQuery:", e);
        return [];
    }
}


export async function getGroupPerformance(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        const groupPerformance = await db.fiscalGroup.findMany({
            select: {
                id: true,
                name: true,
                members: {
                    select: {
                        taxpayer: {
                            select: {
                                event: {
                                    where: { 
                                        type: "FINE",
                                        date: { gte: start, lt: end }
                                    },
                                    select: {
                                        amount: true,
                                        debt: true,
                                        type: true
                                    }
                                },
                                IVAReports: {
                                    where: { date: { gte: start, lt: end } },
                                    select: {
                                        paid: true
                                    }
                                },
                                ISLRReports: {
                                    where: { emition_date: { gte: start, lt: end } },
                                    select: {
                                        paid: true
                                    }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!groupPerformance || groupPerformance.length === 0) {
            return [];
        }

        const performanceByGroup = groupPerformance.map((group) => {
            let totalFines = 0;  // Total de multas asignadas al grupo
            let paidFines = 0;   // Multas efectivamente pagadas (debt === 0)
            let pendingFines = 0; // Multas por pagar (debt > 0)
            let totalPaidAmount = 0;
            let totalIvaCollected = 0;
            let totalIslrCollected = 0;

            group.members.forEach((member) => {
                member.taxpayer.forEach((taxp) => {
                    // ✅ Desglose detallado de multas
                    taxp.event.forEach((ev) => {
                        if (ev.type === "FINE") {
                            totalFines++; // Contar todas las multas
                            
                            if (ev.debt.equals(0)) {
                                // Multa pagada completamente
                                paidFines++;
                                totalPaidAmount += ev.amount.toNumber();
                            } else {
                                // Multa pendiente (debt > 0)
                                pendingFines++;
                            }
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
                totalPaidFines: paidFines, // Mantener compatibilidad con código existente (multas pagadas)
                totalFines,     // ✅ Total Multas
                paidFines,      // ✅ Efectivamente Pagadas
                pendingFines,   // ✅ Por Pagar
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

export async function getGlobalKPI(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

        // 1) Cargar todos los contribuyentes con sus reportes y eventos
        const taxpayers = await db.taxpayer.findMany({
            include: {
                IVAReports: {
                    where: { date: { gte: startOfYear, lt: endOfYear } }
                },
                ISLRReports: {
                    where: { emition_date: { gte: startOfYear, lt: endOfYear } }
                },
                event: {
                    where: { date: { gte: startOfYear, lt: endOfYear } }
                },
            },
        });

        let totalCollection = 0;      // IVA + ISLR + Multas pagadas
        let creditSurplusSum = 0;     // Suma de excedentes válidos
        let creditSurplusCount = 0;   // Contribuyentes con excedente
        let withFineCount = 0;        // Contribuyentes que recibieron multa
        let totalDebt = 0;            // Suma de deudas pendientes

        // Fecha para crecimiento interanual
        const baseDate = date ? dayjs(date) : dayjs();
        const startLastYear = baseDate.subtract(1, "year").startOf("year").toDate();
        const endLastYear = baseDate.subtract(1, "year").endOf("year").toDate();

        // Necesitamos cargar datos del año pasado para el crecimiento
        const taxpayersLastYear = await db.taxpayer.findMany({
            include: {
                IVAReports: {
                    where: { date: { gte: startLastYear, lte: endLastYear } }
                },
                ISLRReports: {
                    where: { emition_date: { gte: startLastYear, lte: endLastYear } }
                },
                event: {
                    where: { 
                        type: "FINE",
                        debt: 0,
                        date: { gte: startLastYear, lte: endLastYear }
                    }
                },
            },
        });

        let lastYearCollection = 0;
        taxpayersLastYear.forEach(tp => {
            tp.IVAReports.forEach(r => lastYearCollection += Number(r.paid));
            tp.ISLRReports.forEach(r => lastYearCollection += Number(r.paid));
            tp.event.forEach(e => lastYearCollection += Number(e.amount));
        });

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
            totalTaxpayers: totalTaxpayers,
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


export async function getIndividualIvaReport(id: string, date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        const ivaReports = await db.iVAReports.findMany({
            where: { 
                taxpayerId: id,
                date: { gte: start, lt: end }
            },
            orderBy: { date: 'asc' },
            include: { taxpayer: true }
        });

        if (ivaReports.length === 0) {
            return {
                enero: { performance: "0.00%", variationFromPrevious: "0.00%" },
                febrero: { performance: "0.00%", variationFromPrevious: "0.00%" },
                marzo: { performance: "0.00%", variationFromPrevious: "0.00%" },
                abril: { performance: "0.00%", variationFromPrevious: "0.00%" },
                mayo: { performance: "0.00%", variationFromPrevious: "0.00%" },
                junio: { performance: "0.00%", variationFromPrevious: "0.00%" },
                julio: { performance: "0.00%", variationFromPrevious: "0.00%" },
                agosto: { performance: "0.00%", variationFromPrevious: "0.00%" },
                septiembre: { performance: "0.00%", variationFromPrevious: "0.00%" },
                octubre: { performance: "0.00%", variationFromPrevious: "0.00%" },
                noviembre: { performance: "0.00%", variationFromPrevious: "0.00%" },
                diciembre: { performance: "0.00%", variationFromPrevious: "0.00%" },
            };
        }

        const taxpayer = ivaReports[0].taxpayer;

        if (taxpayer.index_iva === null) {
            throw new Error("No se encontró un índice IVA aplicable para este contribuyente.");
        }

        const applicableIndex = await db.indexIva.findFirst({
            where: {
                base_amount: taxpayer.index_iva,
                contract_type: taxpayer.contract_type
            }
        });

        if (!applicableIndex) {
            throw new Error("No se encontró un índice IVA aplicable para este contribuyente.");
        }

        const base = Number(applicableIndex.base_amount);

        const performanceByMonth: Record<string, {
            performance: string;
            variationFromPrevious?: string;
        }> = {};

        let lastPerformance: number | null = null;

        for (const report of ivaReports) {
            const reportDateUTC = report.date;
            const month = formatInTimeZone(reportDateUTC, 'UTC', 'MMMM', { locale: es });

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
                entry.variationFromPrevious = `${performance.toFixed(2)}%`;
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

export async function getBestSupervisorByGroups(date?: Date) {


    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));


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


export async function getTopFiscals(date?: Date) {

    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

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

export async function getTopFiveByGroup(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

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




export async function getMonthlyCompliance(date?: Date) {
    try {
        const baseDate = date || new Date();
        const currentYear = baseDate.getUTCFullYear();
        const currentMonthIdx = baseDate.getUTCMonth();

        const currentMonthStart = new Date(Date.UTC(currentYear, currentMonthIdx, 1));
        const nextMonthStart = new Date(Date.UTC(currentYear, currentMonthIdx + 1, 1));
        const prevMonthStart = new Date(Date.UTC(currentYear, currentMonthIdx - 1, 1));
        
        const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
        const endOfYear = new Date(Date.UTC(currentYear + 1, 0, 1));

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
                        },
                        supervised_members: {
                            include: {
                                taxpayer: {
                                    where: {
                                        status: true,  // ✅ Solo contribuyentes activos
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
                                },
                            },
                        },
                    }
                }
            }
        });

        const indexIva = await db.indexIva.findMany();

        const complianceResults: {
            groupName: string;
            coordinatorName: string;
            previousMonth: number;
            currentMonth: number;
            compliancePercentage: number;
            coordinationPerformance?: number;  // ✅ Rendimiento de coordinación
        }[] = [];

        for (const group of groups) {
            let previousTotal = new Decimal(0);
            let currentTotal = new Decimal(0);

            const coordinatorName = group.coordinator?.name || "Sin coordinador";
            const fiscals = group.members.filter(m => m.role === "FISCAL");

            // ✅ Calcular rendimiento de coordinación: (Buen Cumplimiento / Contribuyentes Activos) * 100
            const allActiveTaxpayers: any[] = [];
            
            // Recopilar todos los contribuyentes activos del grupo
            group.members.forEach((member) => {
                // Contribuyentes asignados directamente al miembro
                member.taxpayer.forEach((tp) => {
                    if (tp.status === true) {
                        allActiveTaxpayers.push(tp);
                    }
                });

                // Contribuyentes asignados a miembros supervisados
                member.supervised_members.forEach((supervised) => {
                    supervised.taxpayer.forEach((tp) => {
                        if (tp.status === true) {
                            allActiveTaxpayers.push(tp);
                        }
                    });
                });
            });

            // Calcular cumplimiento para cada contribuyente activo y contar buen cumplimiento
            let goodComplianceCount = 0;

            for (const taxpayer of allActiveTaxpayers) {
                // ✅ Usar la misma lógica que en getTaxpayerCompliance (filtrar por fecha_procedimiento)
                const fechaProcedimiento = new Date(taxpayer.emition_date);
                
                const ivaReportsPostProcedimiento = taxpayer.IVAReports.filter(
                    (report: any) => new Date(report.date) >= fechaProcedimiento
                );
                
                const procedimientoMonth = fechaProcedimiento.getUTCMonth();
                const procedimientoYear = fechaProcedimiento.getUTCFullYear();
                
                let totalIVA = new Decimal(0);
                for (const report of ivaReportsPostProcedimiento) {
                    totalIVA = totalIVA.plus(report.paid || 0);
                }

                // Expected IVA: calcular solo desde el mes de fecha_procedimiento hasta el mes actual
                let expectedIVA = new Decimal(0);
                
                if (procedimientoYear === currentYear) {
                    for (let m = procedimientoMonth; m <= currentMonthIdx; m++) {
                        const refDate = new Date(Date.UTC(currentYear, m, 15));
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );

                        if (index) {
                            expectedIVA = expectedIVA.plus(index.base_amount);
                        }
                    }
                } else if (procedimientoYear < currentYear) {
                    for (let m = 0; m <= currentMonthIdx; m++) {
                        const refDate = new Date(Date.UTC(currentYear, m, 15));
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );

                        if (index) {
                            expectedIVA = expectedIVA.plus(index.base_amount);
                        }
                    }
                }

                // Calcular compliance
                let compliance: number | string;
                
                if (expectedIVA.equals(0)) {
                    compliance = "Indeterminado";
                } else {
                    compliance = totalIVA.div(expectedIVA).times(100).toDecimalPlaces(2).toNumber();
                    if (compliance > 100) compliance = 100;
                }

                // Contar solo si tiene buen cumplimiento (>= 67) y es numérico
                if (typeof compliance === "number" && compliance >= 67) {
                    goodComplianceCount++;
                }
            }

            // Calcular rendimiento de coordinación
            const totalActiveTaxpayers = allActiveTaxpayers.length;
            const coordinationPerformance = totalActiveTaxpayers > 0
                ? (goodComplianceCount / totalActiveTaxpayers) * 100
                : 0;

            // Cálculo del cumplimiento mensual (mantener lógica existente)
            for (const fiscal of fiscals) {
                for (const taxp of fiscal.taxpayer) {
                    // ISLR
                    for (const rep of taxp.ISLRReports) {
                        const date = new Date(rep.emition_date);
                        const amount = new Decimal(rep.paid);

                        if (date >= currentMonthStart && date < nextMonthStart) {
                            currentTotal = currentTotal.plus(amount);
                        } else if (date >= prevMonthStart && date < currentMonthStart) {
                            previousTotal = previousTotal.plus(amount);
                        }
                    }

                    // IVA
                    for (const rep of taxp.IVAReports) {
                        const date = new Date(rep.date);
                        const amount = new Decimal(rep.paid);

                        if (date >= currentMonthStart && date < nextMonthStart) {
                            currentTotal = currentTotal.plus(amount);
                        } else if (date >= prevMonthStart && date < currentMonthStart) {
                            previousTotal = previousTotal.plus(amount);
                        }
                    }

                    // Fines
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

            // Cumplimiento = (mes actual / mes previo) * 100
            const compliancePercentage = previousTotal.equals(0)
                ? 0
                : Number(currentTotal.dividedBy(previousTotal).times(100));

            complianceResults.push({
                groupName: group.name,
                coordinatorName,
                previousMonth: previousTotal.toNumber(),
                currentMonth: currentTotal.toNumber(),
                compliancePercentage: Math.round(compliancePercentage * 100) / 100,
                coordinationPerformance: Number(coordinationPerformance.toFixed(2)),  // ✅ Rendimiento de coordinación
            });
        }

        complianceResults.sort((a, b) => b.compliancePercentage - a.compliancePercentage);

        return complianceResults;
    } catch (e) {
        console.error(e);
        throw new Error("No se pudo calcular el porcentaje de cumplimiento.");
    }
}


export async function getTaxpayerCompliance(date?: Date) {
    try {
        const baseDate = date || new Date();
        const currentYear = baseDate.getUTCFullYear();
        const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
        const endOfYear = new Date(Date.UTC(currentYear + 1, 0, 1));
        const currentMonthIdx = baseDate.getUTCMonth(); // 0..11

        const taxpayers = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: startOfYear,
                    lt: endOfYear,
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
            // ✅ Fecha del procedimiento: usar emition_date como fecha_procedimiento
            const fechaProcedimiento = new Date(taxpayer.emition_date);
            
            // Filtrar solo registros posteriores a la fecha del procedimiento
            const ivaReportsPostProcedimiento = taxpayer.IVAReports.filter(
                (report) => new Date(report.date) >= fechaProcedimiento
            );
            
            const islrReportsPostProcedimiento = taxpayer.ISLRReports.filter(
                (report) => new Date(report.emition_date) >= fechaProcedimiento
            );
            
            const eventsPostProcedimiento = taxpayer.event.filter(
                (ev) => new Date(ev.date) >= fechaProcedimiento
            );

            let totalIVA = new Decimal(0);
            let totalISLR = new Decimal(0);
            let totalFines = new Decimal(0);
            let totalCollected = new Decimal(0);

            // Real IVA collected - solo después de fecha_procedimiento
            for (const report of ivaReportsPostProcedimiento) {
                totalIVA = totalIVA.plus(report.paid);
                totalCollected = totalCollected.plus(report.paid);
            }

            // ISLR + fines - solo después de fecha_procedimiento
            for (const rep of islrReportsPostProcedimiento) {
                totalISLR = totalISLR.plus(rep.paid);
                totalCollected = totalCollected.plus(rep.paid);
            }
            for (const ev of eventsPostProcedimiento) {
                if (ev.type === "FINE") {
                    totalFines = totalFines.plus(ev.amount);
                    totalCollected = totalCollected.plus(ev.amount);
                }
            }

            // Expected IVA: calcular solo desde el mes de fecha_procedimiento hasta el mes actual
            const procedimientoMonth = fechaProcedimiento.getUTCMonth();
            const procedimientoYear = fechaProcedimiento.getUTCFullYear();
            
            let expectedIVA = new Decimal(0);
            
            // Si el procedimiento es del año actual, calcular desde ese mes
            if (procedimientoYear === currentYear) {
                for (let m = procedimientoMonth; m <= currentMonthIdx; m++) {
                    const refDate = new Date(Date.UTC(currentYear, m, 15)); // mid-month
                    const index = indexIva.find(
                        (i) =>
                            i.contract_type === contractType &&
                            refDate >= i.created_at &&
                            (i.expires_at === null || refDate < i.expires_at)
                    );

                    if (index) {
                        expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                }
            } else if (procedimientoYear < currentYear) {
                // Si el procedimiento es de un año anterior, calcular todo el año actual
                for (let m = 0; m <= currentMonthIdx; m++) {
                    const refDate = new Date(Date.UTC(currentYear, m, 15));
                    const index = indexIva.find(
                        (i) =>
                            i.contract_type === contractType &&
                            refDate >= i.created_at &&
                            (i.expires_at === null || refDate < i.expires_at)
                    );

                    if (index) {
                        expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                }
            }

            // Compliance: paid vs expected (capped at 100)
            // Si no hay meses posteriores a la visita, estado "Indeterminado"
            let compliance: number | string;
            
            if (expectedIVA.equals(0)) {
                // No hay meses posteriores a la visita o no hay índice definido
                compliance = "Indeterminado";
            } else {
                compliance = totalIVA.div(expectedIVA).times(100).toDecimalPlaces(2).toNumber();
                if (compliance > 100) compliance = 100;
            }

            const taxpayerResult = {
                name: taxpayer.name,
                rif: taxpayer.rif,
                compliance,
                expectedIVA: expectedIVA.toNumber(),
                totalIVA: totalIVA.toNumber(),
                totalISLR: totalISLR.toNumber(),
                totalFines: totalFines.toNumber(),
                totalCollected: totalCollected.toNumber(),
            };

            // Clasificar solo si compliance es numérico
            if (typeof compliance === "number") {
                if (compliance >= 67) high.push(taxpayerResult);
                else if (compliance >= 34) medium.push(taxpayerResult);
                else low.push(taxpayerResult);
            } else {
                // Si es "Indeterminado", agregar a low para mantener compatibilidad
                low.push(taxpayerResult);
            }
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



export async function getExpectedAmount(date?: Date) {
    try {
        const baseDate = date || new Date();
        const currentYear = baseDate.getUTCFullYear();
        const currentMonthIdx = baseDate.getUTCMonth(); // 0..11

        // If January, use current month as "previous"
        const prevMonthIdx = currentMonthIdx === 0 ? 0 : currentMonthIdx - 1;

        const prevMonthStart = new Date(Date.UTC(currentYear, prevMonthIdx, 1));
        const prevMonthEnd = new Date(Date.UTC(currentYear, prevMonthIdx + 1, 1));

        // 1) Pull IVA reports for the chosen month
        const ivaReports = await db.iVAReports.findMany({
            where: {
                date: {
                    gte: prevMonthStart,
                    lt: prevMonthEnd,
                },
            },
            include: {
                taxpayer: true,
            },
        });

        // 2) Pull taxpayers of this year
        const taxpayers = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: new Date(Date.UTC(currentYear, 0, 1)),
                    lt: new Date(Date.UTC(currentYear + 1, 0, 1)),
                },
            },
            select: {
                id: true,
                contract_type: true,
                emition_date: true,
            },
        });

        // 3) Pull all indices
        const indexIva = await db.indexIva.findMany({
            select: {
                contract_type: true,
                base_amount: true,
                created_at: true,
                expires_at: true,
            },
        });

        // Group indices by contract_type
        const idxByContract = new Map<string, typeof indexIva>();
        for (const ct of new Set(indexIva.map((i) => i.contract_type))) {
            idxByContract.set(
                ct,
                indexIva
                    .filter((i) => i.contract_type === ct)
                    .sort(
                        (a, b) =>
                            new Date(a.created_at).getTime() -
                            new Date(b.created_at).getTime()
                    )
            );
        }

        // Helper: get active index for a given date
        const getActiveIndexOrFallback = (contractType: string, refDate: Date) => {
            const list = idxByContract.get(contractType);
            if (!list || list.length === 0) return null;

            const active = list.filter((i) => {
                const c = new Date(i.created_at).getTime();
                const e = i.expires_at ? new Date(i.expires_at).getTime() : null;
                const t = refDate.getTime();
                return c <= t && (e === null || t < e);
            });

            if (active.length > 0) {
                return active.reduce((latest, cur) =>
                    new Date(cur.created_at).getTime() >
                        new Date(latest.created_at).getTime()
                        ? cur
                        : latest
                );
            }

            const fallback = list
                .filter((i) => i.expires_at === null)
                .sort(
                    (a, b) =>
                        new Date(a.created_at).getTime() -
                        new Date(b.created_at).getTime()
                )
                .at(-1);

            return fallback ?? null;
        };

        // Totals
        let totalExpected = new Decimal(0);
        let totalPaid = new Decimal(0);
        let reportCount = 0;

        // Expected and Paid for each report in that month
        for (const report of ivaReports) {
            const taxpayer = report.taxpayer;
            if (!taxpayer) continue;

            const idx = getActiveIndexOrFallback(
                taxpayer.contract_type,
                new Date(report.date)
            );
            if (!idx) continue;

            totalExpected = totalExpected.plus(idx.base_amount);
            totalPaid = totalPaid.plus(report.paid ?? 0);
            reportCount++;
        }

        // Also account taxpayers without reports in that month
        for (const t of taxpayers) {
            const hasReport = ivaReports.some((r) => r.taxpayer?.id === t.id);
            if (hasReport) continue;

            const refDate = new Date(Date.UTC(currentYear, prevMonthIdx, 15));
            const idx = getActiveIndexOrFallback(t.contract_type, refDate);
            if (idx?.base_amount != null) {
                totalExpected = totalExpected.plus(idx.base_amount);
            }
        }

        // Difference and percentage
        const difference = totalPaid.minus(totalExpected);
        const percentageDifference = totalExpected.gt(0)
            ? difference.dividedBy(totalExpected).times(100).toDecimalPlaces(2)
            : new Decimal(0);

        const compliancePercentage = totalExpected.gt(0)
            ? totalPaid.dividedBy(totalExpected).times(100).toDecimalPlaces(2)
            : new Decimal(0);

        return {
            month: prevMonthIdx + 1, // 1..12
            totalReports: reportCount,
            totalExpected: totalExpected.toNumber(),
            totalPaid: totalPaid.toNumber(),
            difference: difference.toNumber(),
            percentage: percentageDifference.toNumber(),
            compliance: compliancePercentage.toNumber(),
            status: percentageDifference.gte(0) ? "superávit" : "déficit",
        };
    } catch (e) {
        console.error("Error al calcular la recaudación esperada:", e);
        throw new Error("Error al calcular la recaudación esperada.");
    }
}


function toUTCString(dateStr?: string, endOfDay = false): string | undefined {
    if (!dateStr) return undefined;
    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
        console.error("Fecha inválida recibida:", dateStr);
        return undefined;
    }

    // Si es endDate y queremos que sea el final del día
    if (endOfDay) {
        date.setUTCHours(23, 59, 59, 999);
    } else {
        date.setUTCHours(0, 0, 0, 0);
    }

    return date.toISOString();
}

export async function getCompleteReport(data?: CompleteReportInput) {

    // Date to filter the reports (optional)
    const start = toUTCString(data?.startDate);
    const end = toUTCString(data?.endDate, true);

    console.log("Start UTC:", start);
    console.log("End UTC:", end);

    const currentYear = new Date().getUTCFullYear();

    // Date to filter taxpayer (always the current year)
    const startTaxpayer = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0, 0)); // 1 de enero, 00:00:00 UTC
    const endTaxpayer = new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59, 999)); // 31 de diciembre, 23:59:59.999 UTC


    try {

        if (data?.userId !== undefined && data.userRole !== "COORDINATOR") {
            const user = await db.user.findUnique({
                where: {
                    id: data.userId,
                },
            });

            console.log(user);

            if (!user) {
                throw new Error("User not found");
            }

            if (!user.groupId) {
                throw new Error("Group not found");
            }

            data.groupId = user.groupId;
        } else if (data?.userId !== undefined && data.userRole === "COORDINATOR") {
            const user = await db.user.findUnique({
                where: {
                    id: data.userId,
                },
                select: {
                    coordinatedGroup: {
                        select: {
                            id: true,
                        }
                    }
                }
            });

            console.log(user);

            if (!user) {
                throw new Error("User not found");
            }

            if (!user.coordinatedGroup?.id) {
                throw new Error("CoordinatedGroup not found");
            }

            data.groupId = user.coordinatedGroup.id;
        }


        const groups = await db.fiscalGroup.findMany({
            where: data?.groupId ? { id: data.groupId } : undefined,
            include: {
                members: {
                    include: {
                        taxpayer: {
                            where: {
                                // emition_date: {
                                //     gte: startTaxpayer,
                                //     lte: endTaxpayer,
                                // },
                                ...(data?.process ? { process: data.process } : {}),
                            },
                            include: {
                                ISLRReports: {
                                    where: {
                                        emition_date: {
                                            gte: start,
                                            lte: end,
                                        },
                                    },
                                },
                                IVAReports: {
                                    where: {
                                        date: {
                                            gte: start,
                                            lte: end,
                                        },
                                    }
                                },
                                event: {
                                    where: {
                                        date: {
                                            gte: start,
                                            lte: end,
                                        },
                                    },
                                },
                                user: {
                                    select: {
                                        name: true,
                                    },
                                },
                                RepairReports: true,
                            },
                        },
                    },
                },
            },
        });

        const result = groups.map(group => ({
            id: group.id,
            name: group.name,
            fiscales: data?.userRole !== "SUPERVISOR" ? (group.members.map(member => ({
                id: member.id,
                name: member.name,
                taxpayers: member.taxpayer.map(t => {
                    const totalIva = t.IVAReports.reduce((acc, r) => acc.plus(r.paid), new Decimal(0));
                    const totalIslr = t.ISLRReports.reduce((acc, r) => acc.plus(r.paid), new Decimal(0));
                    const totalFines = t.event
                        .filter(e => e.type === "FINE" && e.debt.equals(0))
                        .reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
                    const finesCount = t.event.filter(e => e.type === "FINE").length;

                    return {
                        id: t.id,
                        name: t.name,
                        rif: t.rif,
                        address: t.address,
                        createdAt: t.created_at,
                        emissionDate: t.emition_date,
                        process: t.process,
                        fase: t.fase,
                        culminated: t.culminated,
                        notified: t.notified,
                        hasRepairAct: t.RepairReports.length > 0,
                        totalIva,
                        totalIslr,
                        totalFines,
                        finesCount,
                        totalCollected: totalIva.plus(totalIslr).plus(totalFines),
                    };
                })
            }))) : (
                group.members.filter((member) => member.supervisorId === data.userId).map(member => ({
                    id: member.id,
                    name: member.name,
                    taxpayers: member.taxpayer.map(t => {
                        const totalIva = t.IVAReports.reduce((acc, r) => acc.plus(r.paid), new Decimal(0));
                        const totalIslr = t.ISLRReports.reduce((acc, r) => acc.plus(r.paid), new Decimal(0));
                        const totalFines = t.event
                            .filter(e => e.type === "FINE" && e.debt.equals(0))
                            .reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
                        const finesCount = t.event.filter(e => e.type === "FINE").length;

                        return {
                            id: t.id,
                            name: t.name,
                            rif: t.rif,
                            address: t.address,
                            createdAt: t.created_at,
                            emissionDate: t.emition_date,
                            process: t.process,
                            fase: t.fase,
                            culminated: t.culminated,
                            notified: t.notified,
                            hasRepairAct: t.RepairReports.length > 0,
                            totalIva,
                            totalIslr,
                            totalFines,
                            finesCount,
                            totalCollected: totalIva.plus(totalIslr).plus(totalFines),
                        };
                    })
                })
                )

            )
        }))

        return result;

    } catch (e) {
        console.error(e);
        throw new Error("No se pudo obtener el reporte completo.")
    }
}

export async function getFiscalInfo(fiscalId: string, date?: Date) {

    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        const fiscal = await db.user.findFirst({
            where: {
                id: fiscalId,
            },
            include: {
                taxpayer: {
                    where: {
                        emition_date: {
                            gte: start,
                            lte: end,
                        }
                    }
                },
            }
        })

        if (!fiscal) throw new Error("No se encontró ningun fiscal con el id especificado.");

        let totalTaxpayers = 0;
        let totalProcess = 0;
        let totalCompleted = 0;
        let totalNotified = 0;

        for (const taxpayer of fiscal.taxpayer) {
            totalTaxpayers += 1;

            if (taxpayer.culminated === true) {
                totalCompleted += 1;
            } else {
                totalProcess += 1;
            }

            if (taxpayer.notified === true) {
                totalNotified += 1;
            }

        }

        return {
            fiscalName: fiscal.name,
            fiscalId: fiscal.id,
            totalTaxpayers,
            totalProcess,
            totalCompleted,
            totalNotified,
        }

    } catch (e) {
        console.error(e);
        throw new Error("No se pudo obtener la informacion del fiscal.")
    }
}

export async function getFiscalTaxpayers(fiscalId: string, date?: Date) {

    try {

        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: fiscalId,
                emition_date: {
                    gte: start,
                    lte: end,
                }
            },
            include: {
                IVAReports: true,
                ISLRReports: true,
                event: true,
            }
        });


        if (!taxpayers || taxpayers.length === 0)
            throw new Error("El fiscal no tiene contribuyentes.");



        const result = taxpayers.map(taxpayer => {
            const collectedIva = taxpayer.IVAReports.reduce((acc, rep) => acc.plus(rep.paid), new Decimal(0));
            const collectedIslr = taxpayer.ISLRReports.reduce((acc, rep) => acc.plus(rep.paid), new Decimal(0));
            const collectedFines = taxpayer.event.filter((ev) => ev.type === "FINE").reduce((acc: Decimal, ev) => acc.plus(ev.amount), new Decimal(0));
            const totalCollected = collectedIva.plus(collectedIslr).plus(collectedFines);

            return {
                id: taxpayer.id,
                name: taxpayer.name,
                address: taxpayer.address,
                emition_date: taxpayer.emition_date,
                rif: taxpayer.rif,
                fase: taxpayer.fase,
                culminated: taxpayer.culminated,
                process: taxpayer.process,
                collectedIva,
                collectedIslr,
                collectedFines,
                totalCollected
            };
        });

        return result;


    } catch (e) {
        console.error(e);
        throw new Error("No se pudo obtener la lista de contribuyentes asignados.")
    }
}

export async function getMonthyCollect(fiscalId: string, date?: Date) {
    const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    try {
        const fiscal = await db.user.findFirst({
            where: { id: fiscalId },
            include: {
                taxpayer: {
                    where: {
                        emition_date: {
                            gte: start,
                            lte: end,
                        }
                    },
                    include: {
                        IVAReports: true,
                        ISLRReports: true,
                        event: true,
                    },
                },
            },
        });

        if (!fiscal || fiscal.taxpayer.length < 1) {
            throw new Error("Este fiscal no tiene contribuyentes.");
        }

        const months = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];

        const monthlyStats: Record<string, {
            iva: number;
            islr: number;
            fines: number;
            total: number;
        }> = Object.fromEntries(
            months.map(m => [m, { iva: 0, islr: 0, fines: 0, total: 0 }])
        );

        for (const taxpayer of fiscal.taxpayer) {
            for (const report of taxpayer.IVAReports) {
                const month = formatInTimeZone(report.date, 'UTC', 'MMMM', { locale: es });
                const value = new Decimal(report.paid).toNumber();
                monthlyStats[month].iva += value;
                monthlyStats[month].total += value;
            }

            for (const report of taxpayer.ISLRReports) {
                const month = formatInTimeZone(report.emition_date, 'UTC', 'MMMM', { locale: es });
                const value = new Decimal(report.paid).toNumber();
                monthlyStats[month].islr += value;
                monthlyStats[month].total += value;
            }

            for (const event of taxpayer.event.filter(e => e.type === 'FINE' && e.date)) {
                const month = formatInTimeZone(event.date, 'UTC', 'MMMM', { locale: es });
                const value = new Decimal(event.amount).toNumber();
                monthlyStats[month].fines += value;
                monthlyStats[month].total += value;
            }
        }

        // Retornar el objeto en el orden correcto de meses
        const orderedMonthlyStats: typeof monthlyStats = {};
        for (const month of months) {
            orderedMonthlyStats[month] = monthlyStats[month];
        }

        return orderedMonthlyStats;

    } catch (e) {
        console.error(e);
        throw new Error("No se pudo obtener la recaudación mensual.");
    }
}

export async function getMontlyPerformance(fiscalId: string, date?: Date) {
    const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year - 1, 11, 1)); // Diciembre año anterior
    const end = new Date(Date.UTC(year + 1, 0, 1)); // Enero año siguiente

    try {
        const fiscal = await db.user.findFirst({
            where: { id: fiscalId },
            include: {
                taxpayer: {
                    where: {
                        emition_date: {
                            gte: start,
                            lte: end,
                        },
                    },
                    include: {
                        IVAReports: true,
                        ISLRReports: true,
                        event: true,
                    },
                },
            },
        });

        if (!fiscal || fiscal.taxpayer.length < 1) {
            throw new Error("Este fiscal no tiene contribuyentes.");
        }

        const months = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];

        const monthlyTotals: Record<string, number> = {};
        const referenceTotals: Record<string, number> = {}; // para guardar diciembre del año anterior y luego cada mes anterior

        for (const taxpayer of fiscal.taxpayer) {
            for (const report of taxpayer.IVAReports) {
                const date = new Date(report.date);
                const month = formatInTimeZone(date, 'UTC', 'MMMM', { locale: es });
                const year = date.getUTCFullYear();
                const amount = new Decimal(report.paid).toNumber();

                if (!monthlyTotals[`${month}-${year}`]) monthlyTotals[`${month}-${year}`] = 0;
                monthlyTotals[`${month}-${year}`] += amount;
            }

            for (const report of taxpayer.ISLRReports) {
                const date = new Date(report.emition_date);
                const month = formatInTimeZone(date, 'UTC', 'MMMM', { locale: es });
                const year = date.getUTCFullYear();
                const amount = new Decimal(report.paid).toNumber();

                if (!monthlyTotals[`${month}-${year}`]) monthlyTotals[`${month}-${year}`] = 0;
                monthlyTotals[`${month}-${year}`] += amount;
            }

            for (const e of taxpayer.event.filter(e => e.type === 'FINE' && e.date)) {
                const date = new Date(e.date);
                const month = formatInTimeZone(date, 'UTC', 'MMMM', { locale: es });
                const year = date.getUTCFullYear();
                const amount = new Decimal(e.amount).toNumber();

                if (!monthlyTotals[`${month}-${year}`]) monthlyTotals[`${month}-${year}`] = 0;
                monthlyTotals[`${month}-${year}`] += amount;
            }
        }

        // Generar datos de comparación para enero a diciembre actual
        const result = [];

        for (let i = 0; i < months.length; i++) {
            const currentMonth = months[i];
            const currentKey = `${currentMonth}-${year}`;
            const prevKey =
                i === 0
                    ? `diciembre-${year - 1}`
                    : `${months[i - 1]}-${year}`;

            const currentTotal = monthlyTotals[currentKey] || 0;
            const prevTotal = monthlyTotals[prevKey] || 0;

            const variation = prevTotal === 0
                ? (currentTotal > 0 ? 100 : 0)
                : ((currentTotal - prevTotal) / prevTotal) * 100;

            result.push({
                month: currentMonth,
                currentCollected: parseFloat(currentTotal.toFixed(2)),
                previousCollected: parseFloat(prevTotal.toFixed(2)),
                variation: parseFloat(variation.toFixed(2)),
            });
        }

        // Ordenar por variación descendente
        result.sort((a, b) => b.variation - a.variation);

        return result;
    } catch (e) {
        console.error(e);
        throw new Error("No se pudo calcular el desempeño mensual.");
    }
}

export async function getComplianceByProcess(fiscalId: string, date?: Date) {
    const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    try {
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: fiscalId,
            },
            include: {
                IVAReports: {
                    where: {
                        date: {
                            gte: start,
                            lte: end,
                        },
                    },
                },
                ISLRReports: {
                    where: {
                        emition_date: {
                            gte: start,
                            lte: end,
                        },
                    },
                },
                event: {
                    where: {
                        date: {
                            gte: start,
                            lte: end,
                        },
                    },
                },
            },
        });

        const indexIva = await db.indexIva.findMany();


        const fp = taxpayers.filter((t) => t.process === "FP");
        const af = taxpayers.filter((t) => t.process === "AF");
        const vdf = taxpayers.filter((t) => t.process === "VDF");

        let expectedFP = new Decimal(0);
        let collectedFP = new Decimal(0);

        let expectedAF = new Decimal(0);
        let collectedAF = new Decimal(0);

        let expectedVDF = new Decimal(0);
        let collectedVDF = new Decimal(0);

        for (const taxpayer of fp) {
            for (const iva of taxpayer.IVAReports) {
                const applicableIndex = indexIva.find((index) => index.contract_type === taxpayer.contract_type &&
                    new Date(index.created_at) <= new Date(iva.date) &&
                    (!index.expires_at || new Date(index.expires_at) > new Date(iva.date))
                );

                const indexForIva = applicableIndex ? applicableIndex?.base_amount : new Decimal(0);
                expectedFP = expectedFP.plus(indexForIva);
                collectedFP = collectedFP.plus(iva.paid);
            };

            const collectedIslr = taxpayer.ISLRReports.reduce((acc, rep) => acc.plus(rep.paid), new Decimal(0));
            const collectedFines = taxpayer.event.filter((ev) => ev.type === "FINE").reduce((acc, ev) => acc.plus(ev.amount), new Decimal(0));

            collectedFP = collectedFP.plus(collectedIslr);
            collectedFP = collectedFP.plus(collectedFines);
        }

        for (const taxpayer of af) {
            for (const iva of taxpayer.IVAReports) {
                const applicableIndex = indexIva.find((index) => index.contract_type === taxpayer.contract_type &&
                    new Date(index.created_at) <= new Date(iva.date) &&
                    (!index.expires_at || new Date(index.expires_at) > new Date(iva.date))
                );

                const indexForIva = applicableIndex ? applicableIndex?.base_amount : new Decimal(0);
                expectedAF = expectedAF.plus(indexForIva);
                collectedAF = collectedAF.plus(iva.paid);
            };

            const collectedIslr = taxpayer.ISLRReports.reduce((acc, rep) => acc.plus(rep.paid), new Decimal(0));
            const collectedFines = taxpayer.event.filter((ev) => ev.type === "FINE").reduce((acc, ev) => acc.plus(ev.amount), new Decimal(0));

            collectedAF = collectedAF.plus(collectedIslr);
            collectedAF = collectedAF.plus(collectedFines);
        }

        for (const taxpayer of vdf) {

            for (const iva of taxpayer.IVAReports) {
                const applicableIndex = indexIva.find((index) => index.contract_type === taxpayer.contract_type &&
                    new Date(index.created_at) <= new Date(iva.date) &&
                    (!index.expires_at || new Date(index.expires_at) > new Date(iva.date))
                );

                const indexForIva = applicableIndex ? applicableIndex?.base_amount : new Decimal(0);
                expectedVDF = expectedVDF.plus(indexForIva);
                collectedVDF = collectedVDF.plus(iva.paid);
            };

            const collectedIslr = taxpayer.ISLRReports.reduce((acc, rep) => acc.plus(rep.paid), new Decimal(0));
            const collectedFines = taxpayer.event.filter((ev) => ev.type === "FINE").reduce((acc, ev) => acc.plus(ev.amount), new Decimal(0));

            collectedVDF = collectedVDF.plus(collectedIslr);
            collectedVDF = collectedVDF.plus(collectedFines);
        }

        const differenceVDF = expectedVDF.equals(0)
            ? new Decimal(0)
            : collectedVDF.minus(expectedVDF).dividedBy(expectedVDF).times(100);

        const differenceAF = expectedAF.equals(0)
            ? new Decimal(0)
            : collectedAF.minus(expectedAF).dividedBy(expectedAF).times(100);

        const differenceFP = expectedFP.equals(0)
            ? new Decimal(0)
            : collectedFP.minus(expectedFP).dividedBy(expectedFP).times(100);




        const result = {
            expectedAF: expectedAF,
            collectedAF: collectedAF,
            differenceAF: differenceAF,
            expectedFP: expectedFP,
            collectedFP: collectedFP,
            differenceFP: differenceFP,
            expectedVDF: expectedVDF,
            collectedVDF: collectedVDF,
            differenceVDF: differenceVDF,
        }

        return result;

    } catch (e) {
        throw new Error("No se pudo obtener el cumplimiento por procedimiento.")
    }
}


export async function getFiscalTaxpayerCompliance(fiscalId: string, date?: Date) {
    const baseDate = date || new Date();
    const currentYear = baseDate.getUTCFullYear();
    const start = new Date(Date.UTC(currentYear, 0, 1));
    const end = new Date(Date.UTC(currentYear + 1, 0, 1));
    const currentMonthIdx = baseDate.getUTCMonth(); // 0..11

    try {
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: fiscalId,
            },
            include: {
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
                event: {
                    where: {
                        date: {
                            gte: start,
                            lt: end,
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
            // ✅ Fecha del procedimiento: usar emition_date como fecha_procedimiento
            const fechaProcedimiento = new Date(taxpayer.emition_date);
            
            // Filtrar solo registros posteriores a la fecha del procedimiento
            const ivaReportsPostProcedimiento = taxpayer.IVAReports.filter(
                (report) => new Date(report.date) >= fechaProcedimiento
            );
            
            const islrReportsPostProcedimiento = taxpayer.ISLRReports.filter(
                (report) => new Date(report.emition_date) >= fechaProcedimiento
            );
            
            const eventsPostProcedimiento = taxpayer.event.filter(
                (ev) => new Date(ev.date) >= fechaProcedimiento
            );

            let totalIva = new Decimal(0);
            let totalIslr = new Decimal(0);
            let totalFines = new Decimal(0);

            // Real IVA paid - solo después de fecha_procedimiento
            for (const report of ivaReportsPostProcedimiento) {
                totalIva = totalIva.plus(report.paid || 0);
            }

            // Expected IVA: calcular solo desde el mes de fecha_procedimiento hasta el mes actual
            const procedimientoMonth = fechaProcedimiento.getUTCMonth();
            const procedimientoYear = fechaProcedimiento.getUTCFullYear();
            
            let expectedIVA = new Decimal(0);
            
            // Si el procedimiento es del año actual, calcular desde ese mes
            if (procedimientoYear === currentYear) {
                for (let m = procedimientoMonth; m <= currentMonthIdx; m++) {
                    const refDate = new Date(Date.UTC(currentYear, m, 15));
                    const applicableIndex = indexIva.find(
                        (index) =>
                            index.contract_type === taxpayer.contract_type &&
                            refDate >= index.created_at &&
                            (!index.expires_at || refDate < index.expires_at)
                    );

                    if (applicableIndex) {
                        expectedIVA = expectedIVA.plus(applicableIndex.base_amount);
                    }
                }
            } else if (procedimientoYear < currentYear) {
                // Si el procedimiento es de un año anterior, calcular todo el año actual
                for (let m = 0; m <= currentMonthIdx; m++) {
                    const refDate = new Date(Date.UTC(currentYear, m, 15));
                    const applicableIndex = indexIva.find(
                        (index) =>
                            index.contract_type === taxpayer.contract_type &&
                            refDate >= index.created_at &&
                            (!index.expires_at || refDate < index.expires_at)
                    );

                    if (applicableIndex) {
                        expectedIVA = expectedIVA.plus(applicableIndex.base_amount);
                    }
                }
            }

            // ISLR + fines - solo después de fecha_procedimiento
            for (const islr of islrReportsPostProcedimiento) {
                totalIslr = totalIslr.plus(islr.paid || 0);
            }
            for (const ev of eventsPostProcedimiento) {
                if (ev.type === "FINE") {
                    totalFines = totalFines.plus(ev.amount || 0);
                }
            }

            const totalCollected = totalIva.plus(totalIslr).plus(totalFines);

            // Compliance based on expected vs real IVA (capped at 100)
            // Si no hay meses posteriores a la visita, estado "Indeterminado"
            let complianceRate: number | string;
            
            if (expectedIVA.equals(0)) {
                // No hay meses posteriores a la visita o no hay índice definido
                complianceRate = "Indeterminado";
            } else {
                complianceRate = totalIva.div(expectedIVA).times(100).toDecimalPlaces(2).toNumber();
                if (complianceRate > 100) complianceRate = 100;
            }

            const taxpayerSummary = {
                name: taxpayer.name,
                rif: taxpayer.rif,
                complianceRate,
                expectedIVA: expectedIVA.toNumber(),
                totalCollected: Number(totalCollected.toFixed(2)),
                totalIva: Number(totalIva.toFixed(2)),
                totalIslr: Number(totalIslr.toFixed(2)),
                totalFines: Number(totalFines.toFixed(2)),
            };

            // Clasificar solo si complianceRate es numérico
            if (typeof complianceRate === "number") {
                if (complianceRate >= 67) {
                    high.push(taxpayerSummary);
                } else if (complianceRate >= 34) {
                    medium.push(taxpayerSummary);
                } else {
                    low.push(taxpayerSummary);
                }
            } else {
                // Si es "Indeterminado", agregar a low para mantener compatibilidad
                low.push(taxpayerSummary);
            }
        }

        return {
            high: high.sort((a, b) => b.complianceRate - a.complianceRate),
            medium: medium.sort((a, b) => b.complianceRate - a.complianceRate),
            low: low.sort((a, b) => b.complianceRate - a.complianceRate),
        };
    } catch (e) {
        console.error(e);
        throw new Error("No se pudo obtener el cumplimiento de los contribuyentes.");
    }
}

/**
 * ✅ Calcula el rendimiento de coordinación
 * Fórmula: (Contribuyentes con 'Buen Cumplimiento' / Cantidad REAL de contribuyentes activos asignados) * 100
 * Filtra contribuyentes inactivos o cerrados del denominador
 */
export async function getCoordinationPerformance() {
    try {
        const now = new Date();
        const currentYear = now.getUTCFullYear();
        const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
        const endOfYear = new Date(Date.UTC(currentYear + 1, 0, 1));
        const currentMonthIdx = now.getUTCMonth();

        // Obtener todos los grupos con sus miembros y contribuyentes activos
        const groups = await db.fiscalGroup.findMany({
            include: {
                coordinator: {
                    select: {
                        id: true,
                        name: true,
                    }
                },
                members: {
                    include: {
                        taxpayer: {
                            where: {
                                status: true,  // ✅ Solo contribuyentes activos
                                // No filtrar por culminated porque queremos todos los activos
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
                        },
                        supervised_members: {
                            include: {
                                taxpayer: {
                                    where: {
                                        status: true,  // ✅ Solo contribuyentes activos
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
                                },
                            },
                        },
                    },
                },
            },
        });

        const indexIva = await db.indexIva.findMany();

        const coordinationPerformance = groups.map((group) => {
            // Recopilar todos los contribuyentes activos del grupo (directos y de supervisados)
            const allActiveTaxpayers: any[] = [];

            group.members.forEach((member) => {
                // Contribuyentes asignados directamente al miembro
                member.taxpayer.forEach((tp) => {
                    if (tp.status === true) {
                        allActiveTaxpayers.push(tp);
                    }
                });

                // Contribuyentes asignados a miembros supervisados
                member.supervised_members.forEach((supervised) => {
                    supervised.taxpayer.forEach((tp) => {
                        if (tp.status === true) {
                            allActiveTaxpayers.push(tp);
                        }
                    });
                });
            });

            // Calcular cumplimiento para cada contribuyente activo
            let goodComplianceCount = 0;

            for (const taxpayer of allActiveTaxpayers) {
                // ✅ Usar la misma lógica que en getTaxpayerCompliance (filtrar por fecha_procedimiento)
                const fechaProcedimiento = new Date(taxpayer.emition_date);
                
                const ivaReportsPostProcedimiento = taxpayer.IVAReports.filter(
                    (report: any) => new Date(report.date) >= fechaProcedimiento
                );
                
                const procedimientoMonth = fechaProcedimiento.getUTCMonth();
                const procedimientoYear = fechaProcedimiento.getUTCFullYear();
                
                let totalIVA = new Decimal(0);
                for (const report of ivaReportsPostProcedimiento) {
                    totalIVA = totalIVA.plus(report.paid);
                }

                // Expected IVA: calcular solo desde el mes de fecha_procedimiento hasta el mes actual
                let expectedIVA = new Decimal(0);
                
                if (procedimientoYear === currentYear) {
                    for (let m = procedimientoMonth; m <= currentMonthIdx; m++) {
                        const refDate = new Date(Date.UTC(currentYear, m, 15));
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );

                        if (index) {
                            expectedIVA = expectedIVA.plus(index.base_amount);
                        }
                    }
                } else if (procedimientoYear < currentYear) {
                    for (let m = 0; m <= currentMonthIdx; m++) {
                        const refDate = new Date(Date.UTC(currentYear, m, 15));
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );

                        if (index) {
                            expectedIVA = expectedIVA.plus(index.base_amount);
                        }
                    }
                }

                // Calcular compliance
                let compliance: number | string;
                
                if (expectedIVA.equals(0)) {
                    compliance = "Indeterminado";
                } else {
                    compliance = totalIVA.div(expectedIVA).times(100).toDecimalPlaces(2).toNumber();
                    if (compliance > 100) compliance = 100;
                }

                // Contar solo si tiene buen cumplimiento (>= 67) y es numérico
                if (typeof compliance === "number" && compliance >= 67) {
                    goodComplianceCount++;
                }
            }

            // Calcular rendimiento
            const totalActiveTaxpayers = allActiveTaxpayers.length;
            const performance = totalActiveTaxpayers > 0
                ? (goodComplianceCount / totalActiveTaxpayers) * 100
                : 0;

            return {
                groupId: group.id,
                groupName: group.name,
                coordinatorName: group.coordinator?.name || "Sin coordinador",
                totalActiveTaxpayers,
                goodComplianceCount,
                performance: Number(performance.toFixed(2)),
            };
        });

        return coordinationPerformance.sort((a, b) => b.performance - a.performance);
    } catch (e) {
        console.error(e);
        throw new Error("Error al calcular el rendimiento de coordinación.");
    }
}

export async function getFiscalCollectAnalisis(fiscalId: string, date?: Date) {
    const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    try {
        const taxpayers = await db.taxpayer.findMany({
            where: { officerId: fiscalId },
            include: {
                IVAReports: {
                    where: { date: { gte: start, lte: end } },
                },
                ISLRReports: {
                    where: { emition_date: { gte: start, lte: end } },
                },
                event: {
                    where: { date: { gte: start, lte: end }, type: "FINE" },
                },
            },
        });

        let totalCollected = new Decimal(0);
        let totalIva = new Decimal(0);
        let totalIslr = new Decimal(0);
        let totalFines = new Decimal(0);

        let taxpayerWithMostCollected = null;
        let maxCollected = new Decimal(0);

        let taxpayersWithFines = 0;

        for (const taxpayer of taxpayers) {
            const iva = taxpayer.IVAReports.reduce(
                (acc, rep) => acc.plus(new Decimal(rep.paid)),
                new Decimal(0)
            );
            const islr = taxpayer.ISLRReports.reduce(
                (acc, rep) => acc.plus(new Decimal(rep.paid)),
                new Decimal(0)
            );
            const fines = taxpayer.event.reduce(
                (acc, ev) => acc.plus(new Decimal(ev.amount)),
                new Decimal(0)
            );

            const collected = iva.plus(islr).plus(fines);

            if (collected.greaterThan(maxCollected)) {
                maxCollected = collected;
                taxpayerWithMostCollected = {
                    name: taxpayer.name,
                    rif: taxpayer.rif,
                    totalCollected: Number(collected.toFixed(2)),
                    iva: Number(iva.toFixed(2)),
                    islr: Number(islr.toFixed(2)),
                    fines: Number(fines.toFixed(2)),
                };
            }

            if (fines.greaterThan(0)) {
                taxpayersWithFines++;
            }

            totalIva = totalIva.plus(iva);
            totalIslr = totalIslr.plus(islr);
            totalFines = totalFines.plus(fines);
            totalCollected = totalCollected.plus(collected);
        }

        const totalTaxpayers = taxpayers.length || 1;

        const avgIva = totalIva.dividedBy(totalTaxpayers);
        const avgIslr = totalIslr.dividedBy(totalTaxpayers);
        const avgFines = totalFines.dividedBy(totalTaxpayers);

        return {
            taxpayerWithMostCollected,
            totalCollected: Number(totalCollected.toFixed(2)),
            totalIva: Number(totalIva.toFixed(2)),
            totalIslr: Number(totalIslr.toFixed(2)),
            totalFines: Number(totalFines.toFixed(2)),
            avgIva: Number(avgIva.toFixed(2)),
            avgIslr: Number(avgIslr.toFixed(2)),
            avgFines: Number(avgFines.toFixed(2)),
            taxpayersWithFines,
        };

    } catch (e) {
        console.error(e);
        throw new Error("Error al obtener el análisis de recaudación.");
    }
}