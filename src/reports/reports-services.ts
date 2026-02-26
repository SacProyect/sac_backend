import { event_type, Prisma } from "@prisma/client";
import { db } from "../utils/db-server";
import { avgValue, CompleteReportInput, getComplianceRate, getLatestEvents, getPunctuallityAnalysis, getTaxpayerComplianceRate, InputError, InputGroupRecords, sumTransactions } from "./report-utils";
import { Event, Payment } from "../taxpayer/taxpayer-utils";
import { Decimal } from "@prisma/client/runtime/library";
import dayjs from "dayjs";
import isBetween from "dayjs/plugin/isBetween";
import { es, id } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import logger from "../utils/logger";
import * as IvaReportService from "./IvaReportService";
import * as IslrReportService from "./IslrReportService";

dayjs.extend(isBetween);

// ─── Re-exportaciones: IVA y ISLR (fachada para compatibilidad con controladores) ───
export const calculateComplianceScore = IvaReportService.calculateComplianceScore;
export const hadGoodComplianceBeforeProcedure = IvaReportService.hadGoodComplianceBeforeProcedure;
export const getGlobalPerformance = IvaReportService.getGlobalPerformance;
export const getIvaByMonth = IvaReportService.getIvaByMonth;
export const debugQuery = IvaReportService.debugQuery;
export const getIndividualIvaReport = IvaReportService.getIndividualIvaReport;
export const getExpectedAmount = IvaReportService.getExpectedAmount;

/** Helper interno para getGlobalKPI: delega en IvaReportService. */
function calculateCreditSurplus(
    reports: { date: Date; excess: Decimal | null; iva: Decimal | null }[]
): number {
    return IvaReportService.calculateCreditSurplus(reports);
}

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
            where,
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                status: true,
                debt: true,
                description: true,
                taxpayerId: true,
                expires_at: true,
                updated_at: true,
            },
        })
        const totalAmount = sumTransactions(fines)
        return {
            FINEs: fines,
            fines_quantity: fines.length,
            total_amount: totalAmount
        }
    } catch (error) {
        logger.error("[REPORTS] getFineHistory failed", {
            taxpayerId: taxpayerId ?? null,
            error,
        });
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
            where: paymentWhere,
            select: {
                id: true,
                amount: true,
                date: true,
                eventId: true,
                taxpayerId: true,
                event: { select: { id: true, amount: true, type: true, date: true, taxpayerId: true } },
            },
        })

        // Finding all the fines related to the taxpayer.
        const fines = await db.event.findMany({
            where: fineWhere,
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                debt: true,
                taxpayerId: true,
                payment: { select: { date: true } },
            },
        })

        const totalAmount = sumTransactions(payments as Payment[])
        const lastPayments = getLatestEvents(payments as Payment[])
        const punctuallityAnalysis = getPunctuallityAnalysis(fines as Event[])
        const compliance = getComplianceRate(fines as Event[], payments as Payment[])

        const totalPayments: Payment[] = [];

        (payments as Payment[]).forEach((payment: Payment) => {
            if (payment.event.amount.equals(payment.amount)) {
                totalPayments.push(payment);
            }
        });


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
        logger.error("[REPORTS] getPaymentHistory failed", {
            taxpayerId: taxpayerId ?? null,
            error,
        });
        throw error
    }
}

/**
 * Creates a new error.
 *
 * @param {InputError} input - The input data for the new error.
 * @returns {Promise<InputError | Error>} A Promise resolving to the created error or an exception.
 */
export const createError = async (input: InputError): Promise<InputError | Error> => {


    try {
        const createdError = await db.errors.create({
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
        logger.error("[REPORTS] createError failed", {
            inputTitle: input?.title,
            inputType: input?.type,
            userId: input?.userId,
            error: e,
        });
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
        // Base filter: events with debt > 0, active taxpayer, exclude WARNING (event.status no filtrado aquí: tests esperan este contrato)
        const baseWhere: any = {
            debt: { gt: 0 },
            taxpayer: { status: true },
            NOT: { type: event_type.WARNING },
        };

        // If a specific taxpayerId is provided, override taxpayer filtering
        if (taxpayerId) {
            baseWhere.taxpayer.id = taxpayerId;
        } else {
            // Role-specific filtering
            if (userRole === "FISCAL") {
                baseWhere.taxpayer.officerId = userId;
            }

            if (userRole === "COORDINATOR") {
                const group = await db.fiscalGroup.findUnique({
                    where: { coordinatorId: userId },
                    select: { id: true, members: { select: { id: true } } },
                });
                const memberIds = group?.members.map((m) => m.id) || [];
                baseWhere.taxpayer.officerId = { in: memberIds };
            }

            if (userRole === "SUPERVISOR") {
                const supervisor = await db.user.findUnique({
                    where: { id: userId },
                    include: { supervised_members: { select: { id: true } } },
                });
                const memberIds = [...(supervisor?.supervised_members.map((m) => m.id) ?? []), userId];
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
        logger.error("[REPORTS] getPendingPayments failed", {
            userId,
            userRole,
            taxpayerId: taxpayerId ?? null,
            error,
        });
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

                    logger.debug("[REPORTS] getGroupRecord parseValue", {
                        fiscalName: record.fiscal?.name,
                        process: record.process,
                        rawValue: val,
                        cleanedValue: valid,
                        parsedValue: rounded,
                    });

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
        logger.error("[REPORTS] getGroupRecord failed", {
            input: data,
            error: e,
        });
        throw new Error("No se pudo obtener el reporte de grupo.");
    }
};



/**
 * 🚀 OPTIMIZED VERSION - Uses database aggregations instead of loading data into memory
 * Performance improvements:
 * 1. Raw SQL queries for aggregations
 * 2. Minimal data loading
 * 3. Database-level computations
 * 4. No nested forEach loops
 */
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

    logger.debug("[REPORTS] getFiscalGroups date filters", {
        startDate,
        endDate,
        startUTC: start,
        endUTC: end,
    });

    // 👉 Restrict access to authorized roles only
    if (role !== "ADMIN" && role !== "COORDINATOR" && role !== "SUPERVISOR") {
        logger.warn("[REPORTS] getFiscalGroups unauthorized access", {
            role,
            id,
            supervisorId,
        });
        throw new Error("Unauthorized");
    }

    try {
        // 🔒 Coordinators can only access their own group
        if (role === "COORDINATOR") {
            const coordinatorGroup = await db.fiscalGroup.findUnique({
                where: { coordinatorId: data.userId },
                select: { id: true }
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
            // 🚀 OPTIMIZED: Use database aggregation queries
            const supervisor = await db.user.findUnique({
                where: { id: supervisorId },
                select: {
                    id: true,
                    groupId: true,
                    group: { select: { id: true, name: true, coordinator: { select: { name: true } } } }
                },
            });

            if (!supervisor || !supervisor.groupId) throw new Error("Supervisor no encontrado");

            // 🚀 OPTIMIZED: split aggregations to avoid heavy multi-join cross products
            const [supervisorFineStats, supervisorIvaStats, supervisorIslrStats] = await Promise.all([
                db.$queryRaw<Array<{ total_fines: bigint; collected_fines: any }>>`
                    SELECT
                        COALESCE(COUNT(*), 0) as total_fines,
                        COALESCE(SUM(e.amount), 0) as collected_fines
                    FROM user u
                    INNER JOIN taxpayer t ON t.officerId = u.id
                    INNER JOIN event e ON e.taxpayerId = t.id
                    WHERE u.supervisor_id = ${supervisorId}
                      AND e.type = 'FINE'
                      AND e.debt = 0
                      AND e.date >= ${start}
                      AND e.date < ${end}
                `,
                db.$queryRaw<Array<{ total_iva: any }>>`
                    SELECT
                        COALESCE(SUM(iva.paid), 0) as total_iva
                    FROM user u
                    INNER JOIN taxpayer t ON t.officerId = u.id
                    INNER JOIN IVAReports iva ON iva.taxpayerId = t.id
                    WHERE u.supervisor_id = ${supervisorId}
                      AND iva.date >= ${start}
                      AND iva.date < ${end}
                `,
                db.$queryRaw<Array<{ total_islr: any }>>`
                    SELECT
                        COALESCE(SUM(islr.paid), 0) as total_islr
                    FROM user u
                    INNER JOIN taxpayer t ON t.officerId = u.id
                    INNER JOIN ISLRReports islr ON islr.taxpayerId = t.id
                    WHERE u.supervisor_id = ${supervisorId}
                      AND islr.emition_date >= ${start}
                      AND islr.emition_date < ${end}
                `,
            ]);

            const totalFines = new Decimal((supervisorFineStats[0]?.total_fines ?? BigInt(0)).toString());
            const collectedFines = new Decimal(supervisorFineStats[0]?.collected_fines?.toString() || "0");
            const totalIva = new Decimal(supervisorIvaStats[0]?.total_iva?.toString() || "0");
            const totalIslr = new Decimal(supervisorIslrStats[0]?.total_islr?.toString() || "0");
            const groupCollected = collectedFines.plus(totalIva).plus(totalIslr);

            // Get supervised members for the response (minimal data)
            const supervisedMembers = await db.user.findMany({
                where: { supervisorId: supervisorId },
                select: { id: true, name: true, role: true }
            });

            // ✅ Return only this supervisor's group performance
            return [{
                id: supervisor.groupId,
                name: supervisor.group?.name,
                members: supervisedMembers,
                totalFines,
                collectedFines,
                totalIva,
                totalIslr,
                collected: groupCollected,
                supervisorsStats: [],
                coordinatorName: supervisor.group?.coordinator?.name,
            }];
        }

        // 🔍 Admins and coordinators: fetch all matching groups with optimized queries
        // First, get the list of groups
        const groups = await db.fiscalGroup.findMany({
            where: filters,
            select: {
                id: true,
                name: true,
                coordinator: { select: { name: true } },
            },
        });

        if (groups.length === 0) {
            return [];
        }

        const groupIds = groups.map(g => g.id);

        // 🚀 Split group aggregations by source table to avoid expensive cross products
        const [groupFineStats, groupIvaStats, groupIslrStats] = await Promise.all([
            db.$queryRaw<Array<{ groupId: string; total_fines: bigint; collected_fines: any }>>`
                SELECT
                    u.groupId as groupId,
                    COALESCE(COUNT(*), 0) as total_fines,
                    COALESCE(SUM(e.amount), 0) as collected_fines
                FROM user u
                INNER JOIN taxpayer t ON t.officerId = u.id
                INNER JOIN event e ON e.taxpayerId = t.id
                WHERE u.groupId IN (${Prisma.join(groupIds)})
                  AND e.type = 'FINE'
                  AND e.debt = 0
                  AND e.date >= ${start}
                  AND e.date < ${end}
                GROUP BY u.groupId
            `,
            db.$queryRaw<Array<{ groupId: string; total_iva: any }>>`
                SELECT
                    u.groupId as groupId,
                    COALESCE(SUM(iva.paid), 0) as total_iva
                FROM user u
                INNER JOIN taxpayer t ON t.officerId = u.id
                INNER JOIN IVAReports iva ON iva.taxpayerId = t.id
                WHERE u.groupId IN (${Prisma.join(groupIds)})
                  AND iva.date >= ${start}
                  AND iva.date < ${end}
                GROUP BY u.groupId
            `,
            db.$queryRaw<Array<{ groupId: string; total_islr: any }>>`
                SELECT
                    u.groupId as groupId,
                    COALESCE(SUM(islr.paid), 0) as total_islr
                FROM user u
                INNER JOIN taxpayer t ON t.officerId = u.id
                INNER JOIN ISLRReports islr ON islr.taxpayerId = t.id
                WHERE u.groupId IN (${Prisma.join(groupIds)})
                  AND islr.emition_date >= ${start}
                  AND islr.emition_date < ${end}
                GROUP BY u.groupId
            `,
        ]);

        // 🚀 Same optimization for supervisor stats inside each group
        const [supervisorFineStats, supervisorIvaStats, supervisorIslrStats] = await Promise.all([
            db.$queryRaw<Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_fines: any;
                total_fines: bigint;
            }>>`
                SELECT
                    supervisor.groupId as groupId,
                    supervisor.id as supervisorId,
                    supervisor.name as supervisorName,
                    COALESCE(SUM(e.amount), 0) as collected_fines,
                    COALESCE(COUNT(*), 0) as total_fines
                FROM user supervisor
                INNER JOIN user member ON member.supervisor_id = supervisor.id
                INNER JOIN taxpayer t ON t.officerId = member.id
                INNER JOIN event e ON e.taxpayerId = t.id
                WHERE supervisor.role = 'SUPERVISOR'
                  AND supervisor.groupId IN (${Prisma.join(groupIds)})
                  AND e.type = 'FINE'
                  AND e.debt = 0
                  AND e.date >= ${start}
                  AND e.date < ${end}
                GROUP BY supervisor.groupId, supervisor.id, supervisor.name
            `,
            db.$queryRaw<Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_iva: any;
            }>>`
                SELECT
                    supervisor.groupId as groupId,
                    supervisor.id as supervisorId,
                    supervisor.name as supervisorName,
                    COALESCE(SUM(iva.paid), 0) as collected_iva
                FROM user supervisor
                INNER JOIN user member ON member.supervisor_id = supervisor.id
                INNER JOIN taxpayer t ON t.officerId = member.id
                INNER JOIN IVAReports iva ON iva.taxpayerId = t.id
                WHERE supervisor.role = 'SUPERVISOR'
                  AND supervisor.groupId IN (${Prisma.join(groupIds)})
                  AND iva.date >= ${start}
                  AND iva.date < ${end}
                GROUP BY supervisor.groupId, supervisor.id, supervisor.name
            `,
            db.$queryRaw<Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_islr: any;
            }>>`
                SELECT
                    supervisor.groupId as groupId,
                    supervisor.id as supervisorId,
                    supervisor.name as supervisorName,
                    COALESCE(SUM(islr.paid), 0) as collected_islr
                FROM user supervisor
                INNER JOIN user member ON member.supervisor_id = supervisor.id
                INNER JOIN taxpayer t ON t.officerId = member.id
                INNER JOIN ISLRReports islr ON islr.taxpayerId = t.id
                WHERE supervisor.role = 'SUPERVISOR'
                  AND supervisor.groupId IN (${Prisma.join(groupIds)})
                  AND islr.emition_date >= ${start}
                  AND islr.emition_date < ${end}
                GROUP BY supervisor.groupId, supervisor.id, supervisor.name
            `,
        ]);

        const supervisorStats = new Map<string, {
            groupId: string;
            supervisorId: string;
            supervisorName: string;
            collected_iva: any;
            collected_islr: any;
            collected_fines: any;
            total_fines: bigint;
        }>();

        for (const row of supervisorFineStats) {
            const key = row.supervisorId;
            supervisorStats.set(key, {
                groupId: row.groupId,
                supervisorId: row.supervisorId,
                supervisorName: row.supervisorName,
                collected_iva: 0,
                collected_islr: 0,
                collected_fines: row.collected_fines,
                total_fines: row.total_fines,
            });
        }
        for (const row of supervisorIvaStats) {
            const key = row.supervisorId;
            const current = supervisorStats.get(key);
            if (current) {
                current.collected_iva = row.collected_iva;
            } else {
                supervisorStats.set(key, {
                    groupId: row.groupId,
                    supervisorId: row.supervisorId,
                    supervisorName: row.supervisorName,
                    collected_iva: row.collected_iva,
                    collected_islr: 0,
                    collected_fines: 0,
                    total_fines: BigInt(0),
                });
            }
        }
        for (const row of supervisorIslrStats) {
            const key = row.supervisorId;
            const current = supervisorStats.get(key);
            if (current) {
                current.collected_islr = row.collected_islr;
            } else {
                supervisorStats.set(key, {
                    groupId: row.groupId,
                    supervisorId: row.supervisorId,
                    supervisorName: row.supervisorName,
                    collected_iva: 0,
                    collected_islr: row.collected_islr,
                    collected_fines: 0,
                    total_fines: BigInt(0),
                });
            }
        }

        // 🚀 Get members for each group (minimal data)
        const members = await db.user.findMany({
            where: {
                groupId: { in: groupIds }
            },
            select: {
                id: true,
                name: true,
                role: true,
                groupId: true
            }
        });

        const membersByGroupId = new Map<string, typeof members>();
        for (const member of members) {
            const groupMembers = membersByGroupId.get(member.groupId ?? "") ?? [];
            groupMembers.push(member);
            membersByGroupId.set(member.groupId ?? "", groupMembers);
        }

        const groupFineStatsMap = new Map(groupFineStats.map((row) => [row.groupId, row]));
        const groupIvaStatsMap = new Map(groupIvaStats.map((row) => [row.groupId, row]));
        const groupIslrStatsMap = new Map(groupIslrStats.map((row) => [row.groupId, row]));

        const supervisorStatsByGroupId = new Map<string, Array<{
            groupId: string;
            supervisorId: string;
            supervisorName: string;
            collected_iva: any;
            collected_islr: any;
            collected_fines: any;
            total_fines: bigint;
        }>>();
        for (const supervisorStat of supervisorStats.values()) {
            const groupStats = supervisorStatsByGroupId.get(supervisorStat.groupId) ?? [];
            groupStats.push(supervisorStat);
            supervisorStatsByGroupId.set(supervisorStat.groupId, groupStats);
        }

        // Build the response
        const result = groups.map(group => {
            const fineStats = groupFineStatsMap.get(group.id);
            const ivaStats = groupIvaStatsMap.get(group.id);
            const islrStats = groupIslrStatsMap.get(group.id);

            const groupSupervisors = supervisorStatsByGroupId.get(group.id) ?? [];
            
            // Format supervisor stats
            const formattedSupervisorStats = groupSupervisors.map(sup => ({
                supervisorId: sup.supervisorId,
                supervisorName: sup.supervisorName,
                collectedIva: new Decimal(sup.collected_iva?.toString() || "0"),
                collectedISLR: new Decimal(sup.collected_islr?.toString() || "0"),
                collectedFines: new Decimal(sup.collected_fines?.toString() || "0"),
                totalFines: new Decimal(sup.total_fines.toString()),
                totalCollected: new Decimal(sup.collected_iva?.toString() || "0")
                    .plus(new Decimal(sup.collected_islr?.toString() || "0"))
                    .plus(new Decimal(sup.collected_fines?.toString() || "0"))
            }));

            // Add placeholders if no supervisors found
            while (formattedSupervisorStats.length < 2) {
                formattedSupervisorStats.push({
                    supervisorId: `SUPERVISOR_${formattedSupervisorStats.length + 1}`,
                    supervisorName: "NO ENCONTRADO",
                    collectedIva: new Decimal(0),
                    collectedISLR: new Decimal(0),
                    collectedFines: new Decimal(0),
                    totalFines: new Decimal(0),
                    totalCollected: new Decimal(0),
                });
            }

            const totalFines = new Decimal((fineStats?.total_fines ?? BigInt(0)).toString());
            const collectedFines = new Decimal(fineStats?.collected_fines?.toString() || "0");
            const totalIva = new Decimal(ivaStats?.total_iva?.toString() || "0");
            const totalIslr = new Decimal(islrStats?.total_islr?.toString() || "0");
            const collected = collectedFines.plus(totalIva).plus(totalIslr);

            return {
                id: group.id,
                name: group.name,
                coordinatorId: group.coordinator ? undefined : null, // Match original structure
                coordinator: group.coordinator,
                members: membersByGroupId.get(group.id) ?? [],
                created_at: undefined, // Match original structure
                GroupRecordMonth: undefined, // Match original structure
                GroupRecordYear: undefined, // Match original structure
                totalFines,
                collectedFines,
                totalIva,
                totalIslr,
                collected,
                supervisorsStats: formattedSupervisorStats,
            };
        });

        return result;
    } catch (e) {
        logger.error("[REPORTS] getFiscalGroups failed", {
            filters,
            role,
            groupId: id,
            supervisorId,
            error: e,
        });
        throw e;
    }
};


export async function getGroupPerformance(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        // ✅ CORRECCIÓN CRÍTICA 2026: Filtrar contribuyentes por emition_date (año fiscal)
        const groupPerformance = await db.fiscalGroup.findMany({
            select: {
                id: true,
                name: true,
                members: {
                    select: {
                        taxpayer: {
                            where: {
                                status: true,
                                emition_date: {
                                    gte: start,
                                    lt: end,
                                }
                            },
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
        logger.error("[REPORTS] getGroupPerformance failed", {
            date,
            error: e,
        });
        throw new Error("Error en la API: " + e);
    }
}

export async function getGlobalKPI(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

        // ✅ CORRECCIÓN CRÍTICA 2026: Filtrar contribuyentes por emition_date (año fiscal)
        // Solo incluir contribuyentes cuyo año fiscal coincide con el año seleccionado
        const taxpayers = await db.taxpayer.findMany({
            where: {
                status: true, // Solo activos
                emition_date: {
                    gte: startOfYear,
                    lt: endOfYear,
                },
            },
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
        // ✅ CORRECCIÓN CRÍTICA 2026: Filtrar también por emition_date del contribuyente
        const taxpayersLastYear = await db.taxpayer.findMany({
            where: {
                status: true,
                emition_date: {
                    gte: startLastYear,
                    lt: new Date(Date.UTC(year, 0, 1)), // Hasta inicio del año actual
                },
            },
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
            tp.IVAReports.forEach(r => lastYearCollection += Number((r as any)?.paid ?? 0));
            tp.ISLRReports.forEach(r => lastYearCollection += Number((r as any)?.paid ?? 0));
            tp.event.forEach(e => lastYearCollection += Number((e as any)?.amount ?? 0));
        });

        // Recabar datos de cada contribuyente
        for (const tp of taxpayers) {
            // a) Recaudación IVA e ISLR
            tp.IVAReports.forEach(r => totalCollection += Number((r as any)?.paid ?? 0));
            tp.ISLRReports.forEach(r => totalCollection += Number((r as any)?.paid ?? 0));

            // b) Multas pagadas (event.type === 'FINE' && debt === 0)
            const fines = tp.event.filter(e => e.type === "FINE");
            if (fines.length > 0) withFineCount++;
            fines.forEach(e => {
                if (e.debt.toString() === "0") {
                    totalCollection += Number((e as any)?.amount ?? 0);
                } else {
                    totalDebt += Number((e as any)?.debt ?? 0);
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

        const safeNum = (value: unknown): number => {
            const n = typeof value === "number" ? value : Number(value);
            return Number.isFinite(n) ? n : 0;
        };

        const round2 = (value: unknown): number => {
            const n = safeNum(value);
            return Math.round(n * 100) / 100;
        };

        return {
            totalTaxpayers: totalTaxpayers,
            // ✅ Anti-NaN: siempre números finitos (no null/undefined/NaN) y redondeados a 2 decimales
            totalTaxCollection: round2(totalTaxCollection),     // Bs.
            averageCreditSurplus: round2(averageCreditSurplus), // Bs.
            finePercentage: round2(finePercentage),             // %
            growthRate: round2(growthRate),                     // %
            delinquencyRate: round2(delinquencyRate),           // %
        };
    } catch (e) {
        logger.error("[REPORTS] getGlobalKPI failed", {
            date,
            error: e,
        });
        throw new Error("Error al calcular KPIs globales");
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
                    where: {
                        status: true
                    },
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
        logger.error("[REPORTS] getBestSupervisorByGroups failed", {
            date,
            error: e,
        });
        throw new Error("Error al obtener el mejor supervisor de cada grupo.");
    }
}


export async function getTopFiscals(date?: Date) {

    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

        // ✅ CORRECCIÓN CRÍTICA 2026: Filtrar contribuyentes por emition_date (año fiscal)
        // Solo incluir contribuyentes cuyo año fiscal coincide con el año seleccionado
        const fiscals = await db.user.findMany({
            where: {
                role: "FISCAL",
            },
            include: {
                taxpayer: {
                    where: {
                        status: true,
                        emition_date: {
                            gte: startOfYear,
                            lt: endOfYear,
                        }
                    },
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
        logger.error("[REPORTS] getTopFiscals failed", {
            date,
            error: e,
        });
        throw new Error("No se pudo obtener el top fiscales.")
    }
}

export async function getTopFiveByGroup(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

        // ✅ CORRECCIÓN CRÍTICA 2026: Filtrar contribuyentes por emition_date (año fiscal)
        const groups = await db.fiscalGroup.findMany({
            include: {
                members: {
                    where: { role: "FISCAL" },
                    include: {
                        taxpayer: {
                            where: {
                                status: true,
                                emition_date: {
                                    gte: startOfYear,
                                    lt: endOfYear,
                                }
                            },
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
        logger.error("[REPORTS] getTopFiveByGroup failed", {
            date,
            error: e,
        });
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
                            where: {
                                status: true,
                                emition_date: {
                                    gte: startOfYear,
                                    lt: endOfYear,
                                }
                            },
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
                                        IVAReports: true, // Incluir todos para calcular fecha_corte
                                        ISLRReports: true,
                                        event: {
                                            where: {
                                                type: { in: ["FINE", "WARNING"] },
                                                status: true,
                                            },
                                        },
                                        payment: {
                                            where: { status: true },
                                        },
                                    },
                                },
                            },
                        },
                    }
                }
            }
        });

        const indexIva = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

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
                // ✅ NUEVA LÓGICA: Determinar fecha_corte con prioridades
                // Inicializar con valor por defecto: 1 de Enero del año fiscal actual
                // Esto garantiza que siempre tenga un valor válido antes de ser usado
                let fechaCorte: Date = startOfYear;
                
                // Prioridad 1: Último Procedimiento/Fiscalización (eventos FINE/WARNING)
                const relevantEvents = taxpayer.event.filter(
                    (ev: any) => ev.type === "FINE" || ev.type === "WARNING"
                );
                if (relevantEvents.length > 0) {
                    const lastEvent = relevantEvents.sort(
                        (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
                    )[0];
                    fechaCorte = new Date(lastEvent.date);
                } 
                // Prioridad 2: Inicio de racha de pagos actual
                else if (taxpayer.IVAReports.length > 0) {
                    const sortedReports = [...taxpayer.IVAReports].sort(
                        (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
                    );
                    
                    let currentStreakStart: Date | null = null;
                    let previousHadPayment = false;
                    
                    for (const report of sortedReports) {
                        const hasPayment = report.paid.gt(0);
                        const reportDate = new Date(report.date);
                        
                        if (hasPayment && !previousHadPayment) {
                            currentStreakStart = reportDate;
                        } else if (!hasPayment && previousHadPayment) {
                            currentStreakStart = null;
                        }
                        previousHadPayment = hasPayment;
                    }
                    
                    if (currentStreakStart) {
                        fechaCorte = currentStreakStart;
                    } else {
                        const firstReportWithPayment = sortedReports.find((r: any) => r.paid.gt(0));
                        fechaCorte = firstReportWithPayment 
                            ? new Date(firstReportWithPayment.date)
                            : new Date(taxpayer.emition_date);
                    }
                }
                // Fallback: fecha de registro
                else {
                    fechaCorte = new Date(taxpayer.emition_date);
                }
                
                const ivaReportsPostCorte = taxpayer.IVAReports.filter(
                    (report: any) => new Date(report.date) >= fechaCorte
                );
                
                const corteMonth = fechaCorte.getUTCMonth();
                const corteYear = fechaCorte.getUTCFullYear();
                
                let totalIVA = new Decimal(0);
                for (const report of ivaReportsPostCorte) {
                    totalIVA = totalIVA.plus(report.paid || 0);
                }

                // Expected IVA: calcular solo desde fecha_corte hasta el mes actual
                let expectedIVA = new Decimal(0);
                
                if (corteYear === currentYear) {
                    for (let m = corteMonth; m <= currentMonthIdx; m++) {
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
                } else if (corteYear < currentYear) {
                    // Si fecha_corte es de un año anterior
                    // Calcular desde el mes de corte hasta fin de ese año
                    for (let m = corteMonth; m <= 11; m++) {
                        const refDate = new Date(Date.UTC(corteYear, m, 15));
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
                    // Calcular todo el año actual
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
                // ✅ BUG FIX: Nunca retornar "Indeterminado", siempre retornar un número válido
                let compliance: number;
                
                if (expectedIVA.equals(0) || expectedIVA.isNaN()) {
                    compliance = 0;
                } else {
                    compliance = totalIVA.div(expectedIVA).times(100).toDecimalPlaces(2).toNumber();
                    if (isNaN(compliance) || !isFinite(compliance)) {
                        compliance = 0;
                    } else if (compliance > 100) {
                        compliance = 100;
                    }
                }

                // Contar solo si tiene buen cumplimiento (>67%)
                if (compliance > 67) {
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
        logger.error("[REPORTS] getMonthlyCompliance failed", {
            date,
            error: e,
        });
        throw new Error("No se pudo calcular el porcentaje de cumplimiento.");
    }
}


export async function getTaxpayerCompliance(date?: Date, page?: string, limit?: string) {
    try {
        const now = new Date();
        const selectedYear = (date || now).getUTCFullYear();
        
        // Define pagination if needed, or fallback to returning all
        // The original method didn't really use page/limit correctly in the prism query,
        // but it accepts them. We will fetch all and return high/medium/low arrays.
        
        const rawResults = await db.$queryRaw<Array<{
            id: string;
            taxpayer_name: string;
            rif: string;
            emition_date: Date;
            meses_activos: number;
            tarifa_activa: any;
            total_esperado: any;
            total_pagado: any;
            porcentaje_cumplimiento: any;
            clasificacion: string;
            // Extras mapped back from the original result to keep UI working
            totalIVA: any;
            totalISLR: any;
            totalFines: any;
        }>>`
            WITH PagosDelAnio AS (
                SELECT taxpayerId AS id, SUM(paid) AS total_pagado, SUM(paid) AS totalIVA, 0 AS totalISLR, 0 AS totalFines
                FROM IVAReports 
                WHERE YEAR(date) = ${selectedYear} AND paid > 0
                GROUP BY taxpayerId
                
                UNION ALL 
                
                SELECT taxpayerId AS id, SUM(amount) AS total_pagado, 0 AS totalIVA, 0 AS totalISLR, 0 AS totalFines
                FROM payment 
                WHERE YEAR(date) = ${selectedYear} AND status = 1
                GROUP BY taxpayerId
                
                UNION ALL
                
                SELECT taxpayerId AS id, 0 AS total_pagado, 0 AS totalIVA, SUM(paid) AS totalISLR, 0 AS totalFines
                FROM ISLRReports
                WHERE YEAR(emition_date) = ${selectedYear} AND paid > 0
                GROUP BY taxpayerId
                
                UNION ALL
                
                SELECT taxpayerId AS id, 0 AS total_pagado, 0 AS totalIVA, 0 AS totalISLR, SUM(amount) AS totalFines
                FROM event
                WHERE YEAR(date) = ${selectedYear} AND type = 'FINE' AND debt = 0 AND status = 1
                GROUP BY taxpayerId
            ),
            PagosTotalesUnificados AS (
                SELECT 
                    id, 
                    SUM(total_pagado) AS total_recabado,
                    SUM(totalIVA) AS totalIVA,
                    SUM(totalISLR) AS totalISLR,
                    SUM(totalFines) AS totalFines
                FROM PagosDelAnio
                GROUP BY id
            ),
            MesesExigibles AS (
                SELECT 
                    id, name, rif, contract_type, created_at, emition_date,
                    CASE 
                        -- CASO 1: Año consultado es anterior al año actual (ej. viendo 2025 estando en 2026)
                        WHEN ${selectedYear} < YEAR(CURDATE()) THEN
                            CASE
                                -- Si fue fiscalizado antes del año consultado, paga 12 meses
                                WHEN YEAR(emition_date) < ${selectedYear} THEN 12
                                -- Si fue fiscalizado en el año consultado, paga desde su mes hasta dic (12)
                                ELSE 12 - MONTH(emition_date) + 1
                            END
                            
                        -- CASO 2: Año consultado ES el año actual (ej. 2026 estando en 2026)
                        ELSE
                            CASE
                                -- Si fue fiscalizado antes del año actual, paga desde Ene hasta el mes actual
                                WHEN YEAR(emition_date) < ${selectedYear} THEN MONTH(CURDATE())
                                -- Si fue fiscalizado el año actual, paga desde su mes de emision hasta el mes actual
                                ELSE MONTH(CURDATE()) - MONTH(emition_date) + 1 
                            END
                    END AS meses_activos
                FROM taxpayer
                WHERE status = 1 AND YEAR(emition_date) = ${selectedYear}  
            ),
            IndiceGeneral AS (
                SELECT i1.contract_type, i1.base_amount 
                FROM IndexIva i1
                INNER JOIN (
                    SELECT contract_type, MAX(created_at) as max_created 
                    FROM IndexIva
                    WHERE base_amount > 0 
                    GROUP BY contract_type
                ) i2 ON i1.contract_type = i2.contract_type AND i1.created_at = i2.max_created
            ),
            CumplimientoCalculado AS (
                SELECT 
                    t.id, t.name, t.rif, t.meses_activos, t.created_at, t.emition_date,
                    COALESCE(ig.base_amount, 0) AS indice_aplicable,
                    (t.meses_activos * COALESCE(ig.base_amount, 0)) AS total_esperado,
                    COALESCE(ptu.total_recabado, 0) AS total_pagado,
                    COALESCE(ptu.totalIVA, 0) AS totalIVA,
                    COALESCE(ptu.totalISLR, 0) AS totalISLR,
                    COALESCE(ptu.totalFines, 0) AS totalFines
                FROM MesesExigibles t
                LEFT JOIN IndiceGeneral ig ON t.contract_type = ig.contract_type
                LEFT JOIN PagosTotalesUnificados ptu ON t.id = ptu.id
            )
            SELECT 
                id,
                name AS taxpayer_name,
                rif,
                emition_date,
                meses_activos,
                indice_aplicable AS tarifa_activa,
                total_esperado,
                total_pagado,
                totalIVA,
                totalISLR,
                totalFines,
                
                CASE 
                    WHEN total_esperado <= 0 THEN 0
                    WHEN (total_pagado / total_esperado * 100) > 100 THEN 100
                    ELSE ROUND((total_pagado / total_esperado * 100), 2)
                END AS porcentaje_cumplimiento,
                
                CASE 
                    WHEN total_esperado <= 0 THEN 'BAJO'
                    WHEN (total_pagado / total_esperado * 100) >= 90 THEN 'ALTO'
                    WHEN (total_pagado / total_esperado * 100) >= 50 THEN 'MEDIO'
                    ELSE 'BAJO'
                END AS clasificacion
            FROM CumplimientoCalculado
            ORDER BY porcentaje_cumplimiento DESC, total_pagado DESC;
        `;

        const high: any[] = [];
        const medium: any[] = [];
        const low: any[] = [];

        for (const row of rawResults) {
            const complianceScore = Number(row.porcentaje_cumplimiento || 0);
            
            const totalIVA = isNaN(Number(row.totalIVA)) ? 0 : Number(row.totalIVA);
            const totalISLR = isNaN(Number(row.totalISLR)) ? 0 : Number(row.totalISLR);
            const totalFines = isNaN(Number(row.totalFines)) ? 0 : Number(row.totalFines);
            const totalCollected = totalIVA + totalISLR + totalFines + (isNaN(Number(row.total_pagado)) ? 0 : Number(row.total_pagado));

            const taxpayerResult = {
                id: row.id,
                name: row.taxpayer_name || "",
                rif: row.rif || "",
                compliance: complianceScore,
                complianceScore: complianceScore,
                mesesExigibles: Number(row.meses_activos) || 1,
                pagosValidos: 0, // Not accurately retrievable from the raw query easily, but UI may not strictly depend on it 
                clasificacion: row.clasificacion || "BAJO",
                fechaFiscalizacion: row.emition_date ? new Date(row.emition_date).toISOString() : new Date().toISOString(),
                indiceIvaAplicado: Number(row.tarifa_activa) || 0,
                totalIVA: Number(totalIVA.toFixed(2)),
                totalISLR: Number(totalISLR.toFixed(2)),
                totalFines: Number(totalFines.toFixed(2)),
                totalCollected: Number(totalCollected.toFixed(2)),
            };

            if (row.clasificacion === "ALTO") {
                high.push(taxpayerResult);
            } else if (row.clasificacion === "MEDIO") {
                medium.push(taxpayerResult);
            } else {
                low.push(taxpayerResult);
            }
        }

        return {
            high,
            medium,
            low,
            highComplianceCount: high.length,
            mediumComplianceCount: medium.length,
            lowComplianceCount: low.length,
            totalTaxpayers: rawResults.length,
        };
    } catch (e) {
        logger.error("[REPORTS] getTaxpayerCompliance failed", {
            date,
            error: e,
        });
        throw new Error("Error al calcular el cumplimiento de IVA.");
    }
}

function toUTCString(dateStr?: string, endOfDay = false): string | undefined {
    if (!dateStr) return undefined;
    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
        logger.warn("[REPORTS] toUTCString received invalid date", { dateStr });
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

    logger.debug("[REPORTS] getCompleteReport date range", {
        rawStartDate: data?.startDate,
        rawEndDate: data?.endDate,
        startUTC: start,
        endUTC: end,
    });

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

            logger.debug("[REPORTS] getCompleteReport resolved user (non-coordinator)", {
                userId: user?.id,
                groupId: user?.groupId,
            });

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

            logger.debug("[REPORTS] getCompleteReport resolved user (coordinator)", {
                userId: user?.coordinatedGroup ? data.userId : undefined,
                coordinatedGroupId: user?.coordinatedGroup?.id,
            });

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
                                ...(start && end ? {
                                    emition_date: {
                                        gte: start,
                                        lte: end,
                                    },
                                } : {}),
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
        logger.error("[REPORTS] getCompleteReport failed", {
            input: data,
            error: e,
        });
        throw new Error("No se pudo obtener el reporte completo.")
    }
}

/**
 * ✅ REFACTORIZACIÓN 2026: Permite ver información de fiscales incluyendo casos del año anterior (2025)
 * - Si no se especifica fecha, incluye casos del año actual Y del año anterior si no están culminados
 */
export async function getFiscalInfo(fiscalId: string, date?: Date) {

    try {
        const currentYear = new Date().getUTCFullYear();
        const year = date ? date.getUTCFullYear() : currentYear;
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        // Si no se especifica fecha y estamos en el año actual, incluir también casos 2025 no culminados
        const taxpayerWhere: any = {};
        
        if (!date && year === currentYear) {
            // Incluir casos del año actual Y casos del año anterior no culminados
            const previousYearStart = new Date(Date.UTC(year - 1, 0, 1));
            taxpayerWhere.OR = [
                {
                    emition_date: {
                        gte: start,
                        lt: end,
                    }
                },
                {
                    // Casos del año anterior que no están culminados (trabajo pendiente)
                    emition_date: {
                        gte: previousYearStart,
                        lt: start,
                    },
                    culminated: false, // Solo casos pendientes
                    status: true, // Solo casos activos
                }
            ];
        } else {
            // Si se especifica fecha o es año diferente, usar filtro normal
            taxpayerWhere.emition_date = {
                gte: start,
                lte: end,
            };
        }

        const fiscal = await db.user.findFirst({
            where: {
                id: fiscalId,
            },
            include: {
                taxpayer: {
                    where: taxpayerWhere
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
        logger.error("[REPORTS] getFiscalInfo failed", {
            fiscalId,
            date,
            error: e,
        });
        throw new Error("No se pudo obtener la informacion del fiscal.")
    }
}

/**
 * ✅ REFACTORIZACIÓN 2026: Permite ver contribuyentes de años anteriores (2025)
 * - Si no se especifica fecha, incluye casos del año actual Y del año anterior si no están culminados
 * - Permite visualizar casos pendientes para completar trabajo
 */
export async function getFiscalTaxpayers(fiscalId: string, date?: Date) {

    try {
        const currentYear = new Date().getUTCFullYear();
        const year = date ? date.getUTCFullYear() : currentYear;
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        // Si no se especifica fecha y estamos en el año actual, incluir también casos 2025 no culminados
        const whereClause: any = {
            officerId: fiscalId,
        };

        if (!date && year === currentYear) {
            // Incluir casos del año actual Y casos del año anterior no culminados
            const previousYearStart = new Date(Date.UTC(year - 1, 0, 1));
            whereClause.OR = [
                {
                    emition_date: {
                        gte: start,
                        lt: end,
                    }
                },
                {
                    // Casos del año anterior que no están culminados (trabajo pendiente)
                    emition_date: {
                        gte: previousYearStart,
                        lt: start,
                    },
                    culminated: false, // Solo casos pendientes
                    status: true, // Solo casos activos
                }
            ];
        } else {
            // Si se especifica fecha o es año diferente, usar filtro normal
            whereClause.emition_date = {
                gte: start,
                lte: end,
            };
            whereClause.status = true; // ✅ Excluir contribuyentes eliminados
        }

        const taxpayers = await db.taxpayer.findMany({
            where: whereClause,
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
        logger.error("[REPORTS] getFiscalTaxpayers failed", {
            fiscalId,
            date,
            error: e,
        });
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
        logger.error("[REPORTS] getMonthyCollect failed", {
            fiscalId,
            date,
            error: e,
        });
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
        logger.error("[REPORTS] getMontlyPerformance failed", {
            fiscalId,
            date,
            error: e,
        });
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

        const indexIva = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

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
        logger.error("[REPORTS] getComplianceByProcess failed", {
            fiscalId,
            date,
            error: e,
        });
        throw new Error("No se pudo obtener el cumplimiento por procedimiento.")
    }
}


export async function getFiscalTaxpayerCompliance(fiscalId: string, date?: Date) {
    const baseDate = date || new Date();
    const currentYear = baseDate.getUTCFullYear();
    const start = new Date(Date.UTC(currentYear, 0, 1));
    const end = new Date(Date.UTC(currentYear + 1, 0, 1));
    
    // Determinar el mes hasta el cual calcular
    // Si el año seleccionado es el año actual, usar el mes actual
    // Si el año seleccionado es anterior, calcular hasta diciembre (mes 11)
    const now = new Date();
    const nowYear = now.getUTCFullYear();
    const currentMonthIdx = currentYear === nowYear 
        ? now.getUTCMonth() // Mes actual si es el año actual
        : 11; // Diciembre si es un año anterior

    try {
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: fiscalId,
            },
            include: {
                IVAReports: true, // Incluir todos para calcular fecha_corte
                ISLRReports: true,
                event: {
                    where: {
                        type: { in: ["FINE", "WARNING"] },
                        status: true,
                    },
                },
                payment: {
                    where: { status: true },
                },
            },
        });

        const indexIva = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

        const high: any[] = [];
        const medium: any[] = [];
        const low: any[] = [];

        for (const taxpayer of taxpayers) {
            // ✅ NUEVA LÓGICA REFACTORIZADA: Calcular complianceScore basado en pagos vs meses exigibles
            // La obligación tributaria nace estrictamente en fecha_fiscalizacion (emition_date)
            // fechaFin: usar fecha de corte del reporte (baseDate) o fecha actual, respetando el año seleccionado
            // Si el año seleccionado es anterior, usar fin de ese año (31 de diciembre)
            const fechaFin = currentYear === nowYear 
                ? baseDate 
                : new Date(Date.UTC(currentYear, 11, 31, 23, 59, 59)); // Fin del año seleccionado
            
            // ✅ LÓGICA IVA MENSUAL: Score promedio (pagado/esperado) por mes dentro del año y hasta fechaFin
            const complianceData = calculateComplianceScore(taxpayer, fechaFin, currentYear, indexIva);
            
            // ✅ SANITIZACIÓN CRÍTICA: Asegurar que todos los valores sean válidos (no NaN, null, undefined)
            const taxpayerSummary = {
                name: taxpayer.name || "",
                rif: taxpayer.rif || "",
                complianceRate: complianceData.score || 0,
                complianceScore: complianceData.score || 0,
                mesesExigibles: complianceData.mesesExigibles || 1,
                pagosValidos: complianceData.pagosValidos || 0,
                clasificacion: complianceData.clasificacion || "BAJO",
                fechaFiscalizacion: complianceData.fechaInicio ? complianceData.fechaInicio.toISOString() : new Date().toISOString(),
            };

            // Clasificación por rangos según nueva lógica: >=90% ALTO, >=50% MEDIO, <50% BAJO
            if (complianceData.clasificacion === "ALTO") {
                high.push(taxpayerSummary);
            } else if (complianceData.clasificacion === "MEDIO") {
                medium.push(taxpayerSummary);
            } else {
                low.push(taxpayerSummary);
            }
        }

        // Ordenar por complianceRate (siempre numérico ahora)
        return {
            high: high.sort((a, b) => (b.complianceRate as number) - (a.complianceRate as number)),
            medium: medium.sort((a, b) => (b.complianceRate as number) - (a.complianceRate as number)),
            low: low.sort((a, b) => (b.complianceRate as number) - (a.complianceRate as number)),
        };
    } catch (e) {
        logger.error("[REPORTS] getFiscalTaxpayerCompliance failed", {
            fiscalId,
            date,
            error: e,
        });
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
                                IVAReports: true, // Incluir todos para calcular fecha_corte
                                ISLRReports: true,
                                event: {
                                    where: {
                                        type: { in: ["FINE", "WARNING"] },
                                        status: true,
                                    },
                                },
                                payment: {
                                    where: { status: true },
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
                                        IVAReports: true, // Incluir todos para calcular fecha_corte
                                        ISLRReports: true,
                                        event: {
                                            where: {
                                                type: { in: ["FINE", "WARNING"] },
                                                status: true,
                                            },
                                        },
                                        payment: {
                                            where: { status: true },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const indexIva = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

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
                // ✅ NUEVA LÓGICA: Determinar fecha_corte con prioridades
                // Inicializar con valor por defecto: 1 de Enero del año fiscal actual
                // Esto garantiza que siempre tenga un valor válido antes de ser usado
                let fechaCorte: Date = startOfYear;
                
                // Prioridad 1: Último Procedimiento/Fiscalización (eventos FINE/WARNING)
                const relevantEvents = taxpayer.event.filter(
                    (ev: any) => ev.type === "FINE" || ev.type === "WARNING"
                );
                if (relevantEvents.length > 0) {
                    const lastEvent = relevantEvents.sort(
                        (a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime()
                    )[0];
                    fechaCorte = new Date(lastEvent.date);
                } 
                // Prioridad 2: Inicio de racha de pagos actual
                else if (taxpayer.IVAReports.length > 0) {
                    const sortedReports = [...taxpayer.IVAReports].sort(
                        (a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()
                    );
                    
                    let currentStreakStart: Date | null = null;
                    let previousHadPayment = false;
                    
                    for (const report of sortedReports) {
                        const hasPayment = report.paid.gt(0);
                        const reportDate = new Date(report.date);
                        
                        if (hasPayment && !previousHadPayment) {
                            currentStreakStart = reportDate;
                        } else if (!hasPayment && previousHadPayment) {
                            currentStreakStart = null;
                        }
                        previousHadPayment = hasPayment;
                    }
                    
                    if (currentStreakStart) {
                        fechaCorte = currentStreakStart;
                    } else {
                        const firstReportWithPayment = sortedReports.find((r: any) => r.paid.gt(0));
                        fechaCorte = firstReportWithPayment 
                            ? new Date(firstReportWithPayment.date)
                            : new Date(taxpayer.emition_date);
                    }
                }
                // Fallback: fecha de registro
                else {
                    fechaCorte = new Date(taxpayer.emition_date);
                }
                
                const ivaReportsPostCorte = taxpayer.IVAReports.filter(
                    (report: any) => new Date(report.date) >= fechaCorte
                );
                
                const corteMonth = fechaCorte.getUTCMonth();
                const corteYear = fechaCorte.getUTCFullYear();
                
                let totalIVA = new Decimal(0);
                for (const report of ivaReportsPostCorte) {
                    totalIVA = totalIVA.plus(report.paid);
                }

                // Expected IVA: calcular solo desde fecha_corte hasta el mes actual
                let expectedIVA = new Decimal(0);
                
                if (corteYear === currentYear) {
                    for (let m = corteMonth; m <= currentMonthIdx; m++) {
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
                } else if (corteYear < currentYear) {
                    // Si fecha_corte es de un año anterior
                    // Calcular desde el mes de corte hasta fin de ese año
                    for (let m = corteMonth; m <= 11; m++) {
                        const refDate = new Date(Date.UTC(corteYear, m, 15));
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
                    // Calcular todo el año actual
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
                // ✅ BUG FIX: Nunca retornar "Indeterminado", siempre retornar un número válido
                let compliance: number;
                
                if (expectedIVA.equals(0) || expectedIVA.isNaN()) {
                    compliance = 0;
                } else {
                    compliance = totalIVA.div(expectedIVA).times(100).toDecimalPlaces(2).toNumber();
                    if (isNaN(compliance) || !isFinite(compliance)) {
                        compliance = 0;
                    } else if (compliance > 100) {
                        compliance = 100;
                    }
                }

                // Contar solo si tiene buen cumplimiento (>67%)
                if (compliance > 67) {
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
        logger.error("[REPORTS] getCoordinationPerformance failed", {
            error: e,
        });
        throw new Error("Error al calcular el rendimiento de coordinación.");
    }
}

export async function getFiscalCollectAnalisis(fiscalId: string, date?: Date) {
    const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));

    try {
        // ✅ CORRECCIÓN CRÍTICA 2026: Filtrar contribuyentes por emition_date (año fiscal)
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: fiscalId,
                status: true,
                emition_date: {
                    gte: start,
                    lt: end,
                }
            },
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

        // ✅ SANITIZACIÓN CRÍTICA: Calcular promedios con validación
        let avgIva = new Decimal(0);
        let avgIslr = new Decimal(0);
        let avgFines = new Decimal(0);
        
        try {
            if (totalTaxpayers > 0) {
                avgIva = totalIva.dividedBy(totalTaxpayers);
                avgIslr = totalIslr.dividedBy(totalTaxpayers);
                avgFines = totalFines.dividedBy(totalTaxpayers);
            }
        } catch (error) {
            logger.error("[REPORTS] getFiscalCollectAnalisis averages failed", {
                fiscalId,
                date,
                error,
            });
        }

        // ✅ SANITIZACIÓN CRÍTICA: Asegurar que todos los valores monetarios sean válidos
        const sanitizeNumber = (value: number): number => {
            if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
                return 0;
            }
            return value;
        };

        return {
            taxpayerWithMostCollected: taxpayerWithMostCollected || null,
            totalCollected: sanitizeNumber(Number(totalCollected.toFixed(2))),
            totalIva: sanitizeNumber(Number(totalIva.toFixed(2))),
            totalIslr: sanitizeNumber(Number(totalIslr.toFixed(2))),
            totalFines: sanitizeNumber(Number(totalFines.toFixed(2))),
            avgIva: sanitizeNumber(Number(avgIva.toFixed(2))),
            avgIslr: sanitizeNumber(Number(avgIslr.toFixed(2))),
            avgFines: sanitizeNumber(Number(avgFines.toFixed(2))),
            taxpayersWithFines: taxpayersWithFines || 0,
        };

    } catch (e) {
        logger.error("[REPORTS] getFiscalCollectAnalisis failed", {
            fiscalId,
            date,
            error: e,
        });
        throw new Error("Error al obtener el análisis de recaudación.");
    }
}