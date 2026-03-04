/**
 * Servicio de KPIs y reportes globales (rendimiento por grupo, cumplimiento, reporte completo).
 */
import { Decimal } from "@prisma/client/runtime/library";
import dayjs from "dayjs";
import { db } from "../../utils/db-server";
import logger from "../../utils/logger";
import type { CompleteReportInput } from "../report-utils";
import * as IvaReportService from "../IvaReportService";

function calculateCreditSurplus(
    reports: { date: Date; excess: Decimal | null; iva: Decimal | null }[]
): number {
    return IvaReportService.calculateCreditSurplus(reports);
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
                            where: {
                                status: true,
                                emition_date: { gte: start, lt: end },
                            },
                            select: {
                                event: {
                                    where: { type: "FINE", date: { gte: start, lt: end } },
                                    select: { amount: true, debt: true, type: true },
                                },
                                IVAReports: {
                                    where: { date: { gte: start, lt: end } },
                                    select: { paid: true },
                                },
                                ISLRReports: {
                                    where: { emition_date: { gte: start, lt: end } },
                                    select: { paid: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        if (!groupPerformance || groupPerformance.length === 0) return [];

        const performanceByGroup = groupPerformance.map((group) => {
            let totalFines = 0;
            let paidFines = 0;
            let pendingFines = 0;
            let totalPaidAmount = 0;
            let totalIvaCollected = 0;
            let totalIslrCollected = 0;

            group.members.forEach((member) => {
                member.taxpayer.forEach((taxp) => {
                    taxp.event.forEach((ev) => {
                        if (ev.type === "FINE") {
                            totalFines++;
                            if (ev.debt.equals(0)) {
                                paidFines++;
                                totalPaidAmount += ev.amount.toNumber();
                            } else {
                                pendingFines++;
                            }
                        }
                    });
                    taxp.IVAReports?.forEach((iva) => {
                        totalIvaCollected += Number(iva.paid);
                    });
                    taxp.ISLRReports?.forEach((islr) => {
                        totalIslrCollected += Number(islr.paid);
                    });
                });
            });

            return {
                groupId: group.id,
                groupName: group.name,
                totalPaidFines: paidFines,
                totalFines,
                paidFines,
                pendingFines,
                totalPaidAmount: Number(totalPaidAmount).toFixed(2),
                totalIvaCollected: Number(totalIvaCollected).toFixed(2),
                totalIslrCollected: Number(totalIslrCollected).toFixed(2),
            };
        });

        return performanceByGroup;
    } catch (e) {
        logger.error("[REPORTS] getGroupPerformance failed", { date, error: e });
        throw new Error("Error en la API: " + e);
    }
}

export async function getGlobalKPI(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

        const taxpayers = await db.taxpayer.findMany({
            where: {
                status: true,
                emition_date: { gte: startOfYear, lt: endOfYear },
            },
            include: {
                IVAReports: { where: { date: { gte: startOfYear, lt: endOfYear } } },
                ISLRReports: { where: { emition_date: { gte: startOfYear, lt: endOfYear } } },
                event: { where: { date: { gte: startOfYear, lt: endOfYear } } },
            },
        });

        let totalCollection = 0;
        let creditSurplusSum = 0;
        let creditSurplusCount = 0;
        let withFineCount = 0;
        let totalDebt = 0;

        const baseDate = date ? dayjs(date) : dayjs();
        const startLastYear = baseDate.subtract(1, "year").startOf("year").toDate();
        const endLastYear = baseDate.subtract(1, "year").endOf("year").toDate();

        const taxpayersLastYear = await db.taxpayer.findMany({
            where: {
                status: true,
                emition_date: { gte: startLastYear, lt: new Date(Date.UTC(year, 0, 1)) },
            },
            include: {
                IVAReports: { where: { date: { gte: startLastYear, lte: endLastYear } } },
                ISLRReports: { where: { emition_date: { gte: startLastYear, lte: endLastYear } } },
                event: {
                    where: {
                        type: "FINE",
                        debt: 0,
                        date: { gte: startLastYear, lte: endLastYear },
                    },
                },
            },
        });

        let lastYearCollection = 0;
        taxpayersLastYear.forEach((tp) => {
            tp.IVAReports.forEach((r) => (lastYearCollection += Number((r as any)?.paid ?? 0)));
            tp.ISLRReports.forEach((r) => (lastYearCollection += Number((r as any)?.paid ?? 0)));
            tp.event.forEach((e) => (lastYearCollection += Number((e as any)?.amount ?? 0)));
        });

        for (const tp of taxpayers) {
            tp.IVAReports.forEach((r) => (totalCollection += Number((r as any)?.paid ?? 0)));
            tp.ISLRReports.forEach((r) => (totalCollection += Number((r as any)?.paid ?? 0)));
            const fines = tp.event.filter((e) => e.type === "FINE");
            if (fines.length > 0) withFineCount++;
            fines.forEach((e) => {
                if (e.debt.toString() === "0") {
                    totalCollection += Number((e as any)?.amount ?? 0);
                } else {
                    totalDebt += Number((e as any)?.debt ?? 0);
                }
            });
            const surplus = calculateCreditSurplus(
                tp.IVAReports.map((r) => ({ date: r.date, excess: r.excess, iva: r.iva }))
            );
            if (surplus > 0) {
                creditSurplusSum += surplus;
                creditSurplusCount++;
            }
        }

        const totalTaxpayers = taxpayers.length;
        const averageCreditSurplus =
            creditSurplusCount > 0 ? creditSurplusSum / creditSurplusCount : 0;
        const finePercentage =
            totalTaxpayers > 0 ? (withFineCount / totalTaxpayers) * 100 : 0;
        const growthRate =
            lastYearCollection > 0
                ? ((totalCollection - lastYearCollection) / lastYearCollection) * 100
                : 0;
        const delinquencyRate =
            totalCollection > 0 ? (totalDebt / totalCollection) * 100 : 0;

        const safeNum = (value: unknown): number => {
            const n = typeof value === "number" ? value : Number(value);
            return Number.isFinite(n) ? n : 0;
        };
        const round2 = (value: unknown): number => {
            const n = safeNum(value);
            return Math.round(n * 100) / 100;
        };

        return {
            totalTaxpayers,
            totalTaxCollection: round2(totalCollection),
            averageCreditSurplus: round2(averageCreditSurplus),
            finePercentage: round2(finePercentage),
            growthRate: round2(growthRate),
            delinquencyRate: round2(delinquencyRate),
        };
    } catch (e) {
        logger.error("[REPORTS] getGlobalKPI failed", { date, error: e });
        throw new Error("Error al calcular KPIs globales");
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
                                emition_date: { gte: startOfYear, lt: endOfYear },
                            },
                            include: {
                                ISLRReports: {
                                    where: {
                                        emition_date: {
                                            gte: prevMonthStart,
                                            lt: nextMonthStart,
                                        },
                                    },
                                },
                                IVAReports: {
                                    where: {
                                        date: { gte: prevMonthStart, lt: nextMonthStart },
                                    },
                                },
                                event: {
                                    where: {
                                        date: { gte: prevMonthStart, lt: nextMonthStart },
                                    },
                                },
                            },
                        },
                        supervised_members: {
                            include: {
                                taxpayer: {
                                    where: { status: true },
                                    include: {
                                        IVAReports: true,
                                        ISLRReports: true,
                                        event: {
                                            where: {
                                                type: { in: ["FINE", "WARNING"] },
                                                status: true,
                                            },
                                        },
                                        payment: { where: { status: true } },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        });

        const indexIva = await db.indexIva.findMany({
            select: {
                contract_type: true,
                base_amount: true,
                created_at: true,
                expires_at: true,
            },
        });

        const complianceResults: {
            groupName: string;
            coordinatorName: string;
            previousMonth: number;
            currentMonth: number;
            compliancePercentage: number;
            coordinationPerformance?: number;
        }[] = [];

        for (const group of groups) {
            let previousTotal = new Decimal(0);
            let currentTotal = new Decimal(0);
            const coordinatorName = group.coordinator?.name || "Sin coordinador";
            const fiscals = group.members.filter((m) => m.role === "FISCAL");
            const allActiveTaxpayers: any[] = [];

            group.members.forEach((member) => {
                member.taxpayer.forEach((tp) => {
                    if (tp.status === true) allActiveTaxpayers.push(tp);
                });
                member.supervised_members.forEach((supervised) => {
                    supervised.taxpayer.forEach((tp) => {
                        if (tp.status === true) allActiveTaxpayers.push(tp);
                    });
                });
            });

            let goodComplianceCount = 0;
            for (const taxpayer of allActiveTaxpayers) {
                let fechaCorte: Date = startOfYear;
                const relevantEvents = taxpayer.event.filter(
                    (ev: any) => ev.type === "FINE" || ev.type === "WARNING"
                );
                if (relevantEvents.length > 0) {
                    const lastEvent = relevantEvents.sort(
                        (a: any, b: any) =>
                            new Date(b.date).getTime() - new Date(a.date).getTime()
                    )[0];
                    fechaCorte = new Date(lastEvent.date);
                } else if (taxpayer.IVAReports.length > 0) {
                    const sortedReports = [...taxpayer.IVAReports].sort(
                        (a: any, b: any) =>
                            new Date(a.date).getTime() - new Date(b.date).getTime()
                    );
                    let currentStreakStart: Date | null = null;
                    let previousHadPayment = false;
                    for (const report of sortedReports) {
                        const hasPayment = report.paid.gt(0);
                        const reportDate = new Date(report.date);
                        if (hasPayment && !previousHadPayment) currentStreakStart = reportDate;
                        else if (!hasPayment && previousHadPayment) currentStreakStart = null;
                        previousHadPayment = hasPayment;
                    }
                    if (currentStreakStart) fechaCorte = currentStreakStart;
                    else {
                        const firstReportWithPayment = sortedReports.find((r: any) =>
                            r.paid.gt(0)
                        );
                        fechaCorte = firstReportWithPayment
                            ? new Date(firstReportWithPayment.date)
                            : new Date(taxpayer.emition_date);
                    }
                } else {
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
                        if (index) expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                } else if (corteYear < currentYear) {
                    for (let m = corteMonth; m <= 11; m++) {
                        const refDate = new Date(Date.UTC(corteYear, m, 15));
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );
                        if (index) expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                    for (let m = 0; m <= currentMonthIdx; m++) {
                        const refDate = new Date(Date.UTC(currentYear, m, 15));
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );
                        if (index) expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                }
                let compliance: number;
                if (expectedIVA.equals(0) || expectedIVA.isNaN()) {
                    compliance = 0;
                } else {
                    compliance = totalIVA
                        .div(expectedIVA)
                        .times(100)
                        .toDecimalPlaces(2)
                        .toNumber();
                    if (isNaN(compliance) || !isFinite(compliance)) compliance = 0;
                    else if (compliance > 100) compliance = 100;
                }
                if (compliance > 67) goodComplianceCount++;
            }
            const totalActiveTaxpayers = allActiveTaxpayers.length;
            const coordinationPerformance =
                totalActiveTaxpayers > 0
                    ? (goodComplianceCount / totalActiveTaxpayers) * 100
                    : 0;
            for (const fiscal of fiscals) {
                for (const taxp of fiscal.taxpayer) {
                    for (const rep of taxp.ISLRReports) {
                        const d = new Date(rep.emition_date);
                        const amount = new Decimal(rep.paid);
                        if (d >= currentMonthStart && d < nextMonthStart)
                            currentTotal = currentTotal.plus(amount);
                        else if (d >= prevMonthStart && d < currentMonthStart)
                            previousTotal = previousTotal.plus(amount);
                    }
                    for (const rep of taxp.IVAReports) {
                        const d = new Date(rep.date);
                        const amount = new Decimal(rep.paid);
                        if (d >= currentMonthStart && d < nextMonthStart)
                            currentTotal = currentTotal.plus(amount);
                        else if (d >= prevMonthStart && d < currentMonthStart)
                            previousTotal = previousTotal.plus(amount);
                    }
                    for (const ev of taxp.event) {
                        if (ev.type !== "FINE") continue;
                        const d = new Date(ev.date);
                        const amount = new Decimal(ev.amount);
                        if (d >= currentMonthStart && d < nextMonthStart)
                            currentTotal = currentTotal.plus(amount);
                        else if (d >= prevMonthStart && d < currentMonthStart)
                            previousTotal = previousTotal.plus(amount);
                    }
                }
            }
            const compliancePercentage = previousTotal.equals(0)
                ? 0
                : Number(currentTotal.dividedBy(previousTotal).times(100));
            complianceResults.push({
                groupName: group.name,
                coordinatorName,
                previousMonth: previousTotal.toNumber(),
                currentMonth: currentTotal.toNumber(),
                compliancePercentage: Math.round(compliancePercentage * 100) / 100,
                coordinationPerformance: Number(coordinationPerformance.toFixed(2)),
            });
        }
        complianceResults.sort((a, b) => b.compliancePercentage - a.compliancePercentage);
        return complianceResults;
    } catch (e) {
        logger.error("[REPORTS] getMonthlyCompliance failed", { date, error: e });
        throw new Error("No se pudo calcular el porcentaje de cumplimiento.");
    }
}

export async function getTaxpayerCompliance(
    date?: Date,
    page?: string,
    limit?: string
) {
    try {
        const now = new Date();
        const selectedYear = (date || now).getUTCFullYear();

        const rawResults = await db.$queryRaw<
            Array<{
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
                totalIVA: any;
                totalISLR: any;
                totalFines: any;
            }>
        >`
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
                SELECT id, SUM(total_pagado) AS total_recabado, SUM(totalIVA) AS totalIVA, SUM(totalISLR) AS totalISLR, SUM(totalFines) AS totalFines
                FROM PagosDelAnio
                GROUP BY id
            ),
            MesesExigibles AS (
                SELECT id, name, rif, contract_type, created_at, emition_date,
                    CASE 
                        WHEN ${selectedYear} < YEAR(CURDATE()) THEN
                            CASE WHEN YEAR(emition_date) < ${selectedYear} THEN 12
                                ELSE 12 - MONTH(emition_date) + 1 END
                        ELSE
                            CASE WHEN YEAR(emition_date) < ${selectedYear} THEN MONTH(CURDATE())
                                ELSE MONTH(CURDATE()) - MONTH(emition_date) + 1 END
                    END AS meses_activos
                FROM taxpayer
                WHERE status = 1 AND YEAR(emition_date) = ${selectedYear}
            ),
            IndiceGeneral AS (
                SELECT i1.contract_type, i1.base_amount 
                FROM IndexIva i1
                INNER JOIN (SELECT contract_type, MAX(created_at) as max_created FROM IndexIva WHERE base_amount > 0 GROUP BY contract_type) i2 
                ON i1.contract_type = i2.contract_type AND i1.created_at = i2.max_created
            ),
            CumplimientoCalculado AS (
                SELECT t.id, t.name, t.rif, t.meses_activos, t.created_at, t.emition_date,
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
            SELECT id, name AS taxpayer_name, rif, emition_date, meses_activos, indice_aplicable AS tarifa_activa,
                total_esperado, total_pagado, totalIVA, totalISLR, totalFines,
                CASE WHEN total_esperado <= 0 THEN 0
                    WHEN (total_pagado / total_esperado * 100) > 100 THEN 100
                    ELSE ROUND((total_pagado / total_esperado * 100), 2) END AS porcentaje_cumplimiento,
                CASE WHEN total_esperado <= 0 THEN 'BAJO'
                    WHEN (total_pagado / total_esperado * 100) >= 90 THEN 'ALTO'
                    WHEN (total_pagado / total_esperado * 100) >= 50 THEN 'MEDIO'
                    ELSE 'BAJO' END AS clasificacion
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
            const totalCollected =
                totalIVA +
                totalISLR +
                totalFines +
                (isNaN(Number(row.total_pagado)) ? 0 : Number(row.total_pagado));
            const taxpayerResult = {
                id: row.id,
                name: row.taxpayer_name || "",
                rif: row.rif || "",
                compliance: complianceScore,
                complianceScore: complianceScore,
                mesesExigibles: Number(row.meses_activos) || 1,
                pagosValidos: 0,
                clasificacion: row.clasificacion || "BAJO",
                fechaFiscalizacion: row.emition_date
                    ? new Date(row.emition_date).toISOString()
                    : new Date().toISOString(),
                indiceIvaAplicado: Number(row.tarifa_activa) || 0,
                totalIVA: Number(totalIVA.toFixed(2)),
                totalISLR: Number(totalISLR.toFixed(2)),
                totalFines: Number(totalFines.toFixed(2)),
                totalCollected: Number(totalCollected.toFixed(2)),
            };
            if (row.clasificacion === "ALTO") high.push(taxpayerResult);
            else if (row.clasificacion === "MEDIO") medium.push(taxpayerResult);
            else low.push(taxpayerResult);
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
        logger.error("[REPORTS] getTaxpayerCompliance failed", { date, error: e });
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
    if (endOfDay) date.setUTCHours(23, 59, 59, 999);
    else date.setUTCHours(0, 0, 0, 0);
    return date.toISOString();
}

export async function getCompleteReport(data?: CompleteReportInput) {
    const start = toUTCString(data?.startDate);
    const end = toUTCString(data?.endDate, true);
    logger.debug("[REPORTS] getCompleteReport date range", {
        rawStartDate: data?.startDate,
        rawEndDate: data?.endDate,
        startUTC: start,
        endUTC: end,
    });

    try {
        if (data?.userId !== undefined && data.userRole !== "COORDINATOR") {
            const user = await db.user.findUnique({ where: { id: data.userId } });
            logger.debug("[REPORTS] getCompleteReport resolved user (non-coordinator)", {
                userId: user?.id,
                groupId: user?.groupId,
            });
            if (!user) throw new Error("User not found");
            if (!user.groupId) throw new Error("Group not found");
            data.groupId = user.groupId;
        } else if (data?.userId !== undefined && data.userRole === "COORDINATOR") {
            const user = await db.user.findUnique({
                where: { id: data.userId },
                select: { coordinatedGroup: { select: { id: true } } },
            });
            logger.debug("[REPORTS] getCompleteReport resolved user (coordinator)", {
                userId: user?.coordinatedGroup ? data.userId : undefined,
                coordinatedGroupId: user?.coordinatedGroup?.id,
            });
            if (!user) throw new Error("User not found");
            if (!user.coordinatedGroup?.id) throw new Error("CoordinatedGroup not found");
            data.groupId = user.coordinatedGroup.id;
        }

        const groups = await db.fiscalGroup.findMany({
            where: data?.groupId ? { id: data.groupId } : undefined,
            include: {
                members: {
                    include: {
                        taxpayer: {
                            where: {
                                ...(start && end
                                    ? { emition_date: { gte: start, lte: end } }
                                    : {}),
                                ...(data?.process ? { process: data.process } : {}),
                            },
                            include: {
                                ISLRReports: {
                                    where: { emition_date: { gte: start, lte: end } },
                                },
                                IVAReports: { where: { date: { gte: start, lte: end } } },
                                event: { where: { date: { gte: start, lte: end } } },
                                user: { select: { name: true } },
                                RepairReports: true,
                            },
                        },
                    },
                },
            },
        });

        const result = groups.map((group) => ({
            id: group.id,
            name: group.name,
            fiscales:
                data?.userRole !== "SUPERVISOR"
                    ? group.members.map((member) => ({
                          id: member.id,
                          name: member.name,
                          taxpayers: member.taxpayer.map((t) => {
                              const totalIva = t.IVAReports.reduce(
                                  (acc, r) => acc.plus(r.paid),
                                  new Decimal(0)
                              );
                              const totalIslr = t.ISLRReports.reduce(
                                  (acc, r) => acc.plus(r.paid),
                                  new Decimal(0)
                              );
                              const totalFines = t.event
                                  .filter((e) => e.type === "FINE" && e.debt.equals(0))
                                  .reduce((acc, e) => acc.plus(e.amount), new Decimal(0));
                              const finesCount = t.event.filter(
                                  (e) => e.type === "FINE"
                              ).length;
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
                          }),
                      }))
                    : group.members
                          .filter((member) => member.supervisorId === data.userId)
                          .map((member) => ({
                                id: member.id,
                                name: member.name,
                                taxpayers: member.taxpayer.map((t) => {
                                    const totalIva = t.IVAReports.reduce(
                                        (acc, r) => acc.plus(r.paid),
                                        new Decimal(0)
                                    );
                                    const totalIslr = t.ISLRReports.reduce(
                                        (acc, r) => acc.plus(r.paid),
                                        new Decimal(0)
                                    );
                                    const totalFines = t.event
                                        .filter(
                                            (e) => e.type === "FINE" && e.debt.equals(0)
                                        )
                                        .reduce(
                                            (acc, e) => acc.plus(e.amount),
                                            new Decimal(0)
                                        );
                                    const finesCount = t.event.filter(
                                        (e) => e.type === "FINE"
                                    ).length;
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
                                        totalCollected: totalIva
                                            .plus(totalIslr)
                                            .plus(totalFines),
                                    };
                                }),
                            })),
        }));
        return result;
    } catch (e) {
        logger.error("[REPORTS] getCompleteReport failed", { input: data, error: e });
        throw new Error("No se pudo obtener el reporte completo.");
    }
}
