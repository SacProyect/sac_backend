/**
 * Servicio de registros y grupos fiscales (reportes por grupo).
 */
import { Prisma } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { db } from "../../utils/db-server";
import logger from "../../utils/logger";
import type { InputGroupRecords } from "../report-utils";

export interface InputFiscalGroups {
    role: string;
    id?: string;
    startDate?: string;
    endDate?: string;
    userId?: string;
    supervisorId?: string;
}

export async function getGroupRecord(data: InputGroupRecords) {
    try {
        if (data.month && data.year && data.id) {
            const group = await db.fiscalGroup.findFirst({
                where: { id: data.id },
                include: {
                    GroupRecordMonth: {
                        include: {
                            records: {
                                include: {
                                    fiscal: { select: { name: true } },
                                },
                            },
                        },
                    },
                },
            });

            return {
                groupName: group?.name,
                records:
                    group?.GroupRecordMonth.find(
                        (rec: { month: number; year: number }) =>
                            rec.month === data.month && rec.year === data.year
                    )?.records ?? [],
            };
        }

        if (data.year && data.id) {
            const fullGroup = await db.fiscalGroup.findFirst({
                where: { id: data.id },
                include: {
                    GroupRecordMonth: {
                        where: { year: data.year },
                        include: {
                            records: {
                                include: {
                                    fiscal: { select: { id: true, name: true } },
                                },
                            },
                        },
                    },
                },
            });

            const allRecords =
                fullGroup?.GroupRecordMonth.flatMap((month: { records: unknown[] }) => month.records) ||
                [];
            const aggregated: Record<string, any> = {};

            for (const record of allRecords as any[]) {
                const key = `${record.fiscalId}-${record.process}`;

                const parseValue = (val: any) => {
                    const raw = typeof val === "string" ? val : String(val ?? "0");
                    const clean = raw.replace(/[^0-9.]/g, "");
                    const parts = clean.split(".");
                    const valid = parts.length > 2 ? parts[0] : clean;
                    const result = parseFloat(valid);
                    return isNaN(result) ? 0 : parseFloat(result.toFixed(2));
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
                records: Object.values(aggregated).map((rec: any) => ({
                    ...rec,
                    collectedFines: parseFloat(rec.collectedFines.toFixed(2)),
                    collectedIva: parseFloat(rec.collectedIva.toFixed(2)),
                    collectedIslr: parseFloat(rec.collectedIslr.toFixed(2)),
                })),
            };
        }

        throw new Error("Faltan parámetros para obtener el reporte");
    } catch (e) {
        logger.error("[REPORTS] getGroupRecord failed", { input: data, error: e });
        throw new Error("No se pudo obtener el reporte de grupo.");
    }
}

export async function getFiscalGroups(data: InputFiscalGroups) {
    const { id, role, startDate, endDate, supervisorId } = data;
    const filters: any = {};
    const currentYear = new Date().getUTCFullYear();

    const toUTC = (str?: string): Date | undefined => {
        if (!str) return undefined;
        const [y, m, d] = str.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d));
    };

    const start = startDate ? toUTC(startDate) : new Date(Date.UTC(currentYear, 0, 1));
    const end = endDate ? toUTC(endDate) : new Date(Date.UTC(currentYear + 1, 0, 1));

    logger.debug("[REPORTS] getFiscalGroups date filters", { startDate, endDate, startUTC: start, endUTC: end });

    if (role !== "ADMIN" && role !== "COORDINATOR" && role !== "SUPERVISOR") {
        logger.warn("[REPORTS] getFiscalGroups unauthorized access", { role, id, supervisorId });
        throw new Error("Unauthorized");
    }

    try {
        if (role === "COORDINATOR") {
            const coordinatorGroup = await db.fiscalGroup.findUnique({
                where: { coordinatorId: data.userId },
                select: { id: true },
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
                select: {
                    id: true,
                    groupId: true,
                    group: {
                        select: {
                            id: true,
                            name: true,
                            coordinator: { select: { name: true } },
                        },
                    },
                },
            });

            if (!supervisor || !supervisor.groupId) throw new Error("Supervisor no encontrado");

            const [supervisorFineStats, supervisorIvaStats, supervisorIslrStats] = await Promise.all([
                db.$queryRaw<Array<{ total_fines: bigint; collected_fines: any }>>`
                    SELECT COALESCE(COUNT(*), 0) as total_fines, COALESCE(SUM(e.amount), 0) as collected_fines
                    FROM user u
                    INNER JOIN taxpayer t ON t.officerId = u.id
                    INNER JOIN event e ON e.taxpayerId = t.id
                    WHERE u.supervisor_id = ${supervisorId}
                      AND e.type = 'FINE' AND e.debt = 0
                      AND e.date >= ${start} AND e.date < ${end}
                `,
                db.$queryRaw<Array<{ total_iva: any }>>`
                    SELECT COALESCE(SUM(iva.paid), 0) as total_iva
                    FROM user u
                    INNER JOIN taxpayer t ON t.officerId = u.id
                    INNER JOIN IVAReports iva ON iva.taxpayerId = t.id
                    WHERE u.supervisor_id = ${supervisorId}
                      AND iva.date >= ${start} AND iva.date < ${end}
                `,
                db.$queryRaw<Array<{ total_islr: any }>>`
                    SELECT COALESCE(SUM(islr.paid), 0) as total_islr
                    FROM user u
                    INNER JOIN taxpayer t ON t.officerId = u.id
                    INNER JOIN ISLRReports islr ON islr.taxpayerId = t.id
                    WHERE u.supervisor_id = ${supervisorId}
                      AND islr.emition_date >= ${start} AND islr.emition_date < ${end}
                `,
            ]);

            const totalFines = new Decimal((supervisorFineStats[0]?.total_fines ?? BigInt(0)).toString());
            const collectedFines = new Decimal(supervisorFineStats[0]?.collected_fines?.toString() || "0");
            const totalIva = new Decimal(supervisorIvaStats[0]?.total_iva?.toString() || "0");
            const totalIslr = new Decimal(supervisorIslrStats[0]?.total_islr?.toString() || "0");
            const groupCollected = collectedFines.plus(totalIva).plus(totalIslr);

            const supervisedMembers = await db.user.findMany({
                where: { supervisorId },
                select: { id: true, name: true, role: true },
            });

            return [
                {
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
                },
            ];
        }

        const groups = await db.fiscalGroup.findMany({
            where: filters,
            select: {
                id: true,
                name: true,
                coordinator: { select: { name: true } },
            },
        });

        if (groups.length === 0) return [];

        const groupIds = groups.map((g: { id: string }) => g.id);

        const [groupFineStats, groupIvaStats, groupIslrStats] = await Promise.all([
            db.$queryRaw<Array<{ groupId: string; total_fines: bigint; collected_fines: any }>>`
                SELECT u.groupId as groupId, COALESCE(COUNT(*), 0) as total_fines, COALESCE(SUM(e.amount), 0) as collected_fines
                FROM user u
                INNER JOIN taxpayer t ON t.officerId = u.id
                INNER JOIN event e ON e.taxpayerId = t.id
                WHERE u.groupId IN (${Prisma.join(groupIds)})
                  AND e.type = 'FINE' AND e.debt = 0
                  AND e.date >= ${start} AND e.date < ${end}
                GROUP BY u.groupId
            `,
            db.$queryRaw<Array<{ groupId: string; total_iva: any }>>`
                SELECT u.groupId as groupId, COALESCE(SUM(iva.paid), 0) as total_iva
                FROM user u
                INNER JOIN taxpayer t ON t.officerId = u.id
                INNER JOIN IVAReports iva ON iva.taxpayerId = t.id
                WHERE u.groupId IN (${Prisma.join(groupIds)})
                  AND iva.date >= ${start} AND iva.date < ${end}
                GROUP BY u.groupId
            `,
            db.$queryRaw<Array<{ groupId: string; total_islr: any }>>`
                SELECT u.groupId as groupId, COALESCE(SUM(islr.paid), 0) as total_islr
                FROM user u
                INNER JOIN taxpayer t ON t.officerId = u.id
                INNER JOIN ISLRReports islr ON islr.taxpayerId = t.id
                WHERE u.groupId IN (${Prisma.join(groupIds)})
                  AND islr.emition_date >= ${start} AND islr.emition_date < ${end}
                GROUP BY u.groupId
            `,
        ]);

        const [supervisorFineStats, supervisorIvaStats, supervisorIslrStats] = await Promise.all([
            db.$queryRaw<Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_fines: any;
                total_fines: bigint;
            }>>`
                SELECT supervisor.groupId, supervisor.id as supervisorId, supervisor.name as supervisorName,
                       COALESCE(SUM(e.amount), 0) as collected_fines, COALESCE(COUNT(*), 0) as total_fines
                FROM user supervisor
                INNER JOIN user member ON member.supervisor_id = supervisor.id
                INNER JOIN taxpayer t ON t.officerId = member.id
                INNER JOIN event e ON e.taxpayerId = t.id
                WHERE supervisor.role = 'SUPERVISOR'
                  AND supervisor.groupId IN (${Prisma.join(groupIds)})
                  AND e.type = 'FINE' AND e.debt = 0
                  AND e.date >= ${start} AND e.date < ${end}
                GROUP BY supervisor.groupId, supervisor.id, supervisor.name
            `,
            db.$queryRaw<Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_iva: any;
            }>>`
                SELECT supervisor.groupId, supervisor.id as supervisorId, supervisor.name as supervisorName,
                       COALESCE(SUM(iva.paid), 0) as collected_iva
                FROM user supervisor
                INNER JOIN user member ON member.supervisor_id = supervisor.id
                INNER JOIN taxpayer t ON t.officerId = member.id
                INNER JOIN IVAReports iva ON iva.taxpayerId = t.id
                WHERE supervisor.role = 'SUPERVISOR'
                  AND supervisor.groupId IN (${Prisma.join(groupIds)})
                  AND iva.date >= ${start} AND iva.date < ${end}
                GROUP BY supervisor.groupId, supervisor.id, supervisor.name
            `,
            db.$queryRaw<Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_islr: any;
            }>>`
                SELECT supervisor.groupId, supervisor.id as supervisorId, supervisor.name as supervisorName,
                       COALESCE(SUM(islr.paid), 0) as collected_islr
                FROM user supervisor
                INNER JOIN user member ON member.supervisor_id = supervisor.id
                INNER JOIN taxpayer t ON t.officerId = member.id
                INNER JOIN ISLRReports islr ON islr.taxpayerId = t.id
                WHERE supervisor.role = 'SUPERVISOR'
                  AND supervisor.groupId IN (${Prisma.join(groupIds)})
                  AND islr.emition_date >= ${start} AND islr.emition_date < ${end}
                GROUP BY supervisor.groupId, supervisor.id, supervisor.name
            `,
        ]);

        const supervisorStats = new Map<
            string,
            {
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_iva: any;
                collected_islr: any;
                collected_fines: any;
                total_fines: bigint;
            }
        >();

        for (const row of supervisorFineStats) {
            supervisorStats.set(row.supervisorId, {
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
            const current = supervisorStats.get(row.supervisorId);
            if (current) current.collected_iva = row.collected_iva;
            else
                supervisorStats.set(row.supervisorId, {
                    groupId: row.groupId,
                    supervisorId: row.supervisorId,
                    supervisorName: row.supervisorName,
                    collected_iva: row.collected_iva,
                    collected_islr: 0,
                    collected_fines: 0,
                    total_fines: BigInt(0),
                });
        }
        for (const row of supervisorIslrStats) {
            const current = supervisorStats.get(row.supervisorId);
            if (current) current.collected_islr = row.collected_islr;
            else
                supervisorStats.set(row.supervisorId, {
                    groupId: row.groupId,
                    supervisorId: row.supervisorId,
                    supervisorName: row.supervisorName,
                    collected_iva: 0,
                    collected_islr: row.collected_islr,
                    collected_fines: 0,
                    total_fines: BigInt(0),
                });
        }

        const members = await db.user.findMany({
            where: { groupId: { in: groupIds } },
            select: { id: true, name: true, role: true, groupId: true },
        });

        const membersByGroupId = new Map<string, typeof members>();
        for (const member of members) {
            const gid = member.groupId ?? "";
            const list = membersByGroupId.get(gid) ?? [];
            list.push(member);
            membersByGroupId.set(gid, list);
        }

        const groupFineStatsMap = new Map(groupFineStats.map((row) => [row.groupId, row]));
        const groupIvaStatsMap = new Map(groupIvaStats.map((row) => [row.groupId, row]));
        const groupIslrStatsMap = new Map(groupIslrStats.map((row) => [row.groupId, row]));

        const supervisorStatsByGroupId = new Map<
            string,
            Array<{
                groupId: string;
                supervisorId: string;
                supervisorName: string;
                collected_iva: any;
                collected_islr: any;
                collected_fines: any;
                total_fines: bigint;
            }>
        >();
        for (const sup of supervisorStats.values()) {
            const list = supervisorStatsByGroupId.get(sup.groupId) ?? [];
            list.push(sup);
            supervisorStatsByGroupId.set(sup.groupId, list);
        }

        return groups.map((group: { id: string; name: string | null; coordinator: { name: string } | null }) => {
            const fineStats = groupFineStatsMap.get(group.id);
            const ivaStats = groupIvaStatsMap.get(group.id);
            const islrStats = groupIslrStatsMap.get(group.id);
            const groupSupervisors = supervisorStatsByGroupId.get(group.id) ?? [];

            const formattedSupervisorStats = groupSupervisors.map((sup) => ({
                supervisorId: sup.supervisorId,
                supervisorName: sup.supervisorName,
                collectedIva: new Decimal(sup.collected_iva?.toString() || "0"),
                collectedISLR: new Decimal(sup.collected_islr?.toString() || "0"),
                collectedFines: new Decimal(sup.collected_fines?.toString() || "0"),
                totalFines: new Decimal(sup.total_fines.toString()),
                totalCollected: new Decimal(sup.collected_iva?.toString() || "0")
                    .plus(new Decimal(sup.collected_islr?.toString() || "0"))
                    .plus(new Decimal(sup.collected_fines?.toString() || "0")),
            }));
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
                coordinatorId: group.coordinator ? undefined : null,
                coordinator: group.coordinator,
                members: membersByGroupId.get(group.id) ?? [],
                created_at: undefined,
                GroupRecordMonth: undefined,
                GroupRecordYear: undefined,
                totalFines,
                collectedFines,
                totalIva,
                totalIslr,
                collected,
                supervisorsStats: formattedSupervisorStats,
            };
        });
    } catch (e) {
        logger.error("[REPORTS] getFiscalGroups failed", { filters, role, groupId: id, supervisorId, error: e });
        throw e;
    }
}
