/**
 * Servicio de performance por fiscal y coordinación (métricas, cumplimiento, rankings).
 */
import { Decimal } from "@prisma/client/runtime/library";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import { db } from "../../utils/db-server";
import logger from "../../utils/logger";
import * as IvaReportService from "../IvaReportService";

function calculateComplianceScore(
    taxpayer: any,
    fechaFin: Date,
    yearFilter: number | undefined,
    indexIva: any[]
) {
    return IvaReportService.calculateComplianceScore(
        taxpayer,
        fechaFin,
        yearFilter,
        indexIva
    );
}

export async function getBestSupervisorByGroups(date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const endOfYear = new Date(Date.UTC(year + 1, 0, 1));

        const groups = await db.fiscalGroup.findMany({
            include: {
                members: {
                    where: { status: true },
                    include: {
                        supervised_members: {
                            include: {
                                taxpayer: {
                                    include: {
                                        IVAReports: {
                                            where: {
                                                date: { gte: startOfYear, lte: endOfYear },
                                            },
                                        },
                                        ISLRReports: {
                                            where: {
                                                emition_date: {
                                                    gte: startOfYear,
                                                    lte: endOfYear,
                                                },
                                            },
                                        },
                                        event: {
                                            where: {
                                                date: {
                                                    gte: startOfYear,
                                                    lte: endOfYear,
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

        const result: Record<
            string,
            {
                best: string;
                worse: string;
                supervisors: {
                    name: string;
                    collectedIva: Decimal;
                    collectedIslr: Decimal;
                    collectedFines: Decimal;
                    total: Decimal;
                }[];
            }
        > = {};

        await Promise.all(
            groups.map(async (group) => {
                const supervisors = group.members.filter(
                    (m) => m.role === "SUPERVISOR"
                );
                const supervisorScores = await Promise.all(
                    supervisors.map(async (supervisor) => {
                        let collectedIVA = new Decimal(0);
                        let collectedISLR = new Decimal(0);
                        let collectedFines = new Decimal(0);
                        let totalCollected = new Decimal(0);
                        const allTaxpayers = supervisor.supervised_members.flatMap(
                            (f) => f.taxpayer
                        );
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
                const sorted = supervisorScores.sort(
                    (a, b) => Number(b.total) - Number(a.total)
                );
                result[group.name] = {
                    best: sorted[0]?.name ?? "N/A",
                    worse: sorted.at(-1)?.name ?? "N/A",
                    supervisors: sorted,
                };
            })
        );
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

        const fiscals = await db.user.findMany({
            where: { role: "FISCAL" },
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
                                    gte: startOfYear,
                                    lte: endOfYear,
                                },
                            },
                        },
                        IVAReports: {
                            where: {
                                date: { gte: startOfYear, lte: endOfYear },
                            },
                        },
                        event: {
                            where: {
                                date: { gte: startOfYear, lte: endOfYear },
                            },
                        },
                    },
                },
            },
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
                    totalCollected = totalCollected.plus(rep.paid);
                });
                taxp.IVAReports.forEach((rep) => {
                    collectedIVA = collectedIVA.plus(rep.paid);
                    totalCollected = totalCollected.plus(rep.paid);
                });
                taxp.event.forEach((ev) => {
                    if (ev.type === "FINE") {
                        collectedFines = collectedFines.plus(ev.amount);
                        totalCollected = totalCollected.plus(ev.amount);
                    }
                });
            }
            fiscalStats.push({
                name: fiscal.name,
                collectedIva: collectedIVA,
                collectedIslr: collectedISLR,
                collectedFines: collectedFines,
                total: totalCollected,
            });
        }
        return fiscalStats.sort((a, b) =>
            Number(b.total.minus(a.total))
        );
    } catch (e) {
        logger.error("[REPORTS] getTopFiscals failed", { date, error: e });
        throw new Error("No se pudo obtener el top fiscales.");
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
                            where: {
                                status: true,
                                emition_date: {
                                    gte: startOfYear,
                                    lt: endOfYear,
                                },
                            },
                            include: {
                                ISLRReports: {
                                    where: {
                                        emition_date: {
                                            gte: startOfYear,
                                            lt: endOfYear,
                                        },
                                    },
                                },
                                IVAReports: {
                                    where: {
                                        date: {
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
        });

        const result: Record<
            string,
            { name: string; totalCollected: Decimal }[]
        > = {};
        for (const group of groups) {
            const fiscalScores = group.members.map((fiscal) => {
                let totalCollected = new Decimal(0);
                for (const taxp of fiscal.taxpayer) {
                    for (const rep of taxp.ISLRReports)
                        totalCollected = totalCollected.plus(rep.paid);
                    for (const rep of taxp.IVAReports)
                        totalCollected = totalCollected.plus(rep.paid);
                    for (const ev of taxp.event) {
                        if (ev.type === "FINE")
                            totalCollected = totalCollected.plus(ev.amount);
                    }
                }
                return { name: fiscal.name, totalCollected };
            });
            const topFive = fiscalScores
                .sort(
                    (a, b) =>
                        Number(b.totalCollected) - Number(a.totalCollected)
                )
                .slice(0, 5);
            result[group.name] = topFive;
        }
        return result;
    } catch (e) {
        logger.error("[REPORTS] getTopFiveByGroup failed", { date, error: e });
        throw new Error("Error al obtener los top fiscales por grupo");
    }
}

export async function getFiscalInfo(fiscalId: string, date?: Date) {
    try {
        const currentYear = new Date().getUTCFullYear();
        const year = date ? date.getUTCFullYear() : currentYear;
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));
        const taxpayerWhere: any = {};
        if (!date && year === currentYear) {
            const previousYearStart = new Date(Date.UTC(year - 1, 0, 1));
            taxpayerWhere.OR = [
                { emition_date: { gte: start, lt: end } },
                {
                    emition_date: { gte: previousYearStart, lt: start },
                    culminated: false,
                    status: true,
                },
            ];
        } else {
            taxpayerWhere.emition_date = { gte: start, lte: end };
        }
        const fiscal = await db.user.findFirst({
            where: { id: fiscalId },
            include: { taxpayer: { where: taxpayerWhere } },
        });
        if (!fiscal)
            throw new Error("No se encontró ningun fiscal con el id especificado.");
        let totalTaxpayers = 0;
        let totalProcess = 0;
        let totalCompleted = 0;
        let totalNotified = 0;
        for (const taxpayer of fiscal.taxpayer) {
            totalTaxpayers += 1;
            if (taxpayer.culminated === true) totalCompleted += 1;
            else totalProcess += 1;
            if (taxpayer.notified === true) totalNotified += 1;
        }
        return {
            fiscalName: fiscal.name,
            fiscalId: fiscal.id,
            totalTaxpayers,
            totalProcess,
            totalCompleted,
            totalNotified,
        };
    } catch (e) {
        logger.error("[REPORTS] getFiscalInfo failed", { fiscalId, date, error: e });
        throw new Error("No se pudo obtener la informacion del fiscal.");
    }
}

export async function getFiscalTaxpayers(fiscalId: string, date?: Date) {
    try {
        const currentYear = new Date().getUTCFullYear();
        const year = date ? date.getUTCFullYear() : currentYear;
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));
        const whereClause: any = { officerId: fiscalId };
        if (!date && year === currentYear) {
            const previousYearStart = new Date(Date.UTC(year - 1, 0, 1));
            whereClause.OR = [
                { emition_date: { gte: start, lt: end } },
                {
                    emition_date: { gte: previousYearStart, lt: start },
                    culminated: false,
                    status: true,
                },
            ];
        } else {
            whereClause.emition_date = { gte: start, lte: end };
            whereClause.status = true;
        }
        const taxpayers = await db.taxpayer.findMany({
            where: whereClause,
            include: { IVAReports: true, ISLRReports: true, event: true },
        });
        if (!taxpayers || taxpayers.length === 0)
            throw new Error("El fiscal no tiene contribuyentes.");
        return taxpayers.map((taxpayer) => {
            const collectedIva = taxpayer.IVAReports.reduce(
                (acc, rep) => acc.plus(rep.paid),
                new Decimal(0)
            );
            const collectedIslr = taxpayer.ISLRReports.reduce(
                (acc, rep) => acc.plus(rep.paid),
                new Decimal(0)
            );
            const collectedFines = taxpayer.event
                .filter((ev) => ev.type === "FINE")
                .reduce((acc: Decimal, ev) => acc.plus(ev.amount), new Decimal(0));
            const totalCollected = collectedIva
                .plus(collectedIslr)
                .plus(collectedFines);
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
                totalCollected,
            };
        });
    } catch (e) {
        logger.error("[REPORTS] getFiscalTaxpayers failed", {
            fiscalId,
            date,
            error: e,
        });
        throw new Error("No se pudo obtener la lista de contribuyentes asignados.");
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
                    where: { emition_date: { gte: start, lte: end } },
                    include: { IVAReports: true, ISLRReports: true, event: true },
                },
            },
        });
        if (!fiscal || fiscal.taxpayer.length < 1)
            throw new Error("Este fiscal no tiene contribuyentes.");
        const months = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        ];
        const monthlyStats: Record<
            string,
            { iva: number; islr: number; fines: number; total: number }
        > = Object.fromEntries(
            months.map((m) => [m, { iva: 0, islr: 0, fines: 0, total: 0 }])
        );
        for (const taxpayer of fiscal.taxpayer) {
            for (const report of taxpayer.IVAReports) {
                const month = formatInTimeZone(
                    report.date,
                    "UTC",
                    "MMMM",
                    { locale: es }
                );
                const value = new Decimal(report.paid).toNumber();
                monthlyStats[month].iva += value;
                monthlyStats[month].total += value;
            }
            for (const report of taxpayer.ISLRReports) {
                const month = formatInTimeZone(
                    report.emition_date,
                    "UTC",
                    "MMMM",
                    { locale: es }
                );
                const value = new Decimal(report.paid).toNumber();
                monthlyStats[month].islr += value;
                monthlyStats[month].total += value;
            }
            for (const event of taxpayer.event.filter(
                (e) => e.type === "FINE" && e.date
            )) {
                const month = formatInTimeZone(
                    event.date,
                    "UTC",
                    "MMMM",
                    { locale: es }
                );
                const value = new Decimal(event.amount).toNumber();
                monthlyStats[month].fines += value;
                monthlyStats[month].total += value;
            }
        }
        const orderedMonthlyStats: typeof monthlyStats = {};
        for (const month of months) orderedMonthlyStats[month] = monthlyStats[month];
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
    const start = new Date(Date.UTC(year - 1, 11, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    try {
        const fiscal = await db.user.findFirst({
            where: { id: fiscalId },
            include: {
                taxpayer: {
                    where: { emition_date: { gte: start, lte: end } },
                    include: { IVAReports: true, ISLRReports: true, event: true },
                },
            },
        });
        if (!fiscal || fiscal.taxpayer.length < 1)
            throw new Error("Este fiscal no tiene contribuyentes.");
        const months = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
        ];
        const monthlyTotals: Record<string, number> = {};
        for (const taxpayer of fiscal.taxpayer) {
            for (const report of taxpayer.IVAReports) {
                const d = new Date(report.date);
                const month = formatInTimeZone(d, "UTC", "MMMM", { locale: es });
                const y = d.getUTCFullYear();
                const amount = new Decimal(report.paid).toNumber();
                const key = `${month}-${y}`;
                if (!monthlyTotals[key]) monthlyTotals[key] = 0;
                monthlyTotals[key] += amount;
            }
            for (const report of taxpayer.ISLRReports) {
                const d = new Date(report.emition_date);
                const month = formatInTimeZone(d, "UTC", "MMMM", { locale: es });
                const y = d.getUTCFullYear();
                const amount = new Decimal(report.paid).toNumber();
                const key = `${month}-${y}`;
                if (!monthlyTotals[key]) monthlyTotals[key] = 0;
                monthlyTotals[key] += amount;
            }
            for (const e of taxpayer.event.filter(
                (e) => e.type === "FINE" && e.date
            )) {
                const d = new Date(e.date);
                const month = formatInTimeZone(d, "UTC", "MMMM", { locale: es });
                const y = d.getUTCFullYear();
                const amount = new Decimal(e.amount).toNumber();
                const key = `${month}-${y}`;
                if (!monthlyTotals[key]) monthlyTotals[key] = 0;
                monthlyTotals[key] += amount;
            }
        }
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
            const variation =
                prevTotal === 0
                    ? currentTotal > 0
                        ? 100
                        : 0
                    : ((currentTotal - prevTotal) / prevTotal) * 100;
            result.push({
                month: currentMonth,
                currentCollected: parseFloat(currentTotal.toFixed(2)),
                previousCollected: parseFloat(prevTotal.toFixed(2)),
                variation: parseFloat(variation.toFixed(2)),
            });
        }
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
            where: { officerId: fiscalId },
            include: {
                IVAReports: { where: { date: { gte: start, lte: end } } },
                ISLRReports: {
                    where: { emition_date: { gte: start, lte: end } },
                },
                event: { where: { date: { gte: start, lte: end } } },
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
        const fp = taxpayers.filter((t) => t.process === "FP");
        const af = taxpayers.filter((t) => t.process === "AF");
        const vdf = taxpayers.filter((t) => t.process === "VDF");
        let expectedFP = new Decimal(0);
        let collectedFP = new Decimal(0);
        let expectedAF = new Decimal(0);
        let collectedAF = new Decimal(0);
        let expectedVDF = new Decimal(0);
        let collectedVDF = new Decimal(0);
        const addForProcess = (
            list: typeof taxpayers,
            expected: Decimal,
            collected: Decimal
        ) => {
            let e = expected;
            let c = collected;
            for (const taxpayer of list) {
                for (const iva of taxpayer.IVAReports) {
                    const applicableIndex = indexIva.find(
                        (index) =>
                            index.contract_type === taxpayer.contract_type &&
                            new Date(index.created_at) <= new Date(iva.date) &&
                            (!index.expires_at ||
                                new Date(index.expires_at) > new Date(iva.date))
                    );
                    const indexForIva = applicableIndex
                        ? applicableIndex?.base_amount
                        : new Decimal(0);
                    e = e.plus(indexForIva);
                    c = c.plus(iva.paid);
                }
                const collectedIslr = taxpayer.ISLRReports.reduce(
                    (acc, rep) => acc.plus(rep.paid),
                    new Decimal(0)
                );
                const collectedFines = taxpayer.event
                    .filter((ev) => ev.type === "FINE")
                    .reduce((acc, ev) => acc.plus(ev.amount), new Decimal(0));
                c = c.plus(collectedIslr).plus(collectedFines);
            }
            return { expected: e, collected: c };
        };
        const fpRes = addForProcess(fp, expectedFP, collectedFP);
        const afRes = addForProcess(af, expectedAF, collectedAF);
        const vdfRes = addForProcess(vdf, expectedVDF, collectedVDF);
        const differenceVDF = vdfRes.expected.equals(0)
            ? new Decimal(0)
            : vdfRes.collected
                  .minus(vdfRes.expected)
                  .dividedBy(vdfRes.expected)
                  .times(100);
        const differenceAF = afRes.expected.equals(0)
            ? new Decimal(0)
            : afRes.collected
                  .minus(afRes.expected)
                  .dividedBy(afRes.expected)
                  .times(100);
        const differenceFP = fpRes.expected.equals(0)
            ? new Decimal(0)
            : fpRes.collected
                  .minus(fpRes.expected)
                  .dividedBy(fpRes.expected)
                  .times(100);
        return {
            expectedAF: afRes.expected,
            collectedAF: afRes.collected,
            differenceAF,
            expectedFP: fpRes.expected,
            collectedFP: fpRes.collected,
            differenceFP,
            expectedVDF: vdfRes.expected,
            collectedVDF: vdfRes.collected,
            differenceVDF,
        };
    } catch (e) {
        logger.error("[REPORTS] getComplianceByProcess failed", {
            fiscalId,
            date,
            error: e,
        });
        throw new Error("No se pudo obtener el cumplimiento por procedimiento.");
    }
}

export async function getFiscalTaxpayerCompliance(
    fiscalId: string,
    date?: Date
) {
    const baseDate = date || new Date();
    const currentYear = baseDate.getUTCFullYear();
    const start = new Date(Date.UTC(currentYear, 0, 1));
    try {
        const taxpayers = await db.taxpayer.findMany({
            where: { officerId: fiscalId },
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
        });
        const indexIva = await db.indexIva.findMany({
            select: {
                contract_type: true,
                base_amount: true,
                created_at: true,
                expires_at: true,
            },
        });
        const now = new Date();
        const nowYear = now.getUTCFullYear();
        const high: any[] = [];
        const medium: any[] = [];
        const low: any[] = [];
        for (const taxpayer of taxpayers) {
            const fechaFin =
                currentYear === nowYear
                    ? baseDate
                    : new Date(
                          Date.UTC(currentYear, 11, 31, 23, 59, 59)
                      );
            const complianceData = calculateComplianceScore(
                taxpayer,
                fechaFin,
                currentYear,
                indexIva
            );
            const taxpayerSummary = {
                name: taxpayer.name || "",
                rif: taxpayer.rif || "",
                complianceRate: complianceData.score || 0,
                complianceScore: complianceData.score || 0,
                mesesExigibles: complianceData.mesesExigibles || 1,
                pagosValidos: complianceData.pagosValidos || 0,
                clasificacion: complianceData.clasificacion || "BAJO",
                fechaFiscalizacion: complianceData.fechaInicio
                    ? complianceData.fechaInicio.toISOString()
                    : new Date().toISOString(),
            };
            if (complianceData.clasificacion === "ALTO") high.push(taxpayerSummary);
            else if (complianceData.clasificacion === "MEDIO")
                medium.push(taxpayerSummary);
            else low.push(taxpayerSummary);
        }
        return {
            high: high.sort(
                (a, b) =>
                    (b.complianceRate as number) - (a.complianceRate as number)
            ),
            medium: medium.sort(
                (a, b) =>
                    (b.complianceRate as number) - (a.complianceRate as number)
            ),
            low: low.sort(
                (a, b) =>
                    (b.complianceRate as number) - (a.complianceRate as number)
            ),
        };
    } catch (e) {
        logger.error("[REPORTS] getFiscalTaxpayerCompliance failed", {
            fiscalId,
            date,
            error: e,
        });
        throw new Error(
            "No se pudo obtener el cumplimiento de los contribuyentes."
        );
    }
}

export async function getCoordinationPerformance(date?: Date) {
    try {
        const now = date || new Date();
        const currentYear = now.getUTCFullYear();
        const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
        const currentMonthIdx = now.getUTCMonth();

        const groups = await db.fiscalGroup.findMany({
            include: {
                coordinator: { select: { id: true, name: true } },
                members: {
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

        const coordinationPerformance = groups.map((group) => {
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
                        if (hasPayment && !previousHadPayment)
                            currentStreakStart = reportDate;
                        else if (!hasPayment && previousHadPayment)
                            currentStreakStart = null;
                        previousHadPayment = hasPayment;
                    }
                    if (currentStreakStart) fechaCorte = currentStreakStart;
                    else {
                        const firstReportWithPayment = sortedReports.find(
                            (r: any) => r.paid.gt(0)
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
                for (const report of ivaReportsPostCorte)
                    totalIVA = totalIVA.plus(report.paid);
                let expectedIVA = new Decimal(0);
                if (corteYear === currentYear) {
                    for (let m = corteMonth; m <= currentMonthIdx; m++) {
                        const refDate = new Date(
                            Date.UTC(currentYear, m, 15)
                        );
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );
                        if (index)
                            expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                } else if (corteYear < currentYear) {
                    for (let m = corteMonth; m <= 11; m++) {
                        const refDate = new Date(
                            Date.UTC(corteYear, m, 15)
                        );
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );
                        if (index)
                            expectedIVA = expectedIVA.plus(index.base_amount);
                    }
                    for (let m = 0; m <= currentMonthIdx; m++) {
                        const refDate = new Date(
                            Date.UTC(currentYear, m, 15)
                        );
                        const index = indexIva.find(
                            (i) =>
                                i.contract_type === taxpayer.contract_type &&
                                refDate >= i.created_at &&
                                (i.expires_at === null || refDate < i.expires_at)
                        );
                        if (index)
                            expectedIVA = expectedIVA.plus(index.base_amount);
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
                    if (isNaN(compliance) || !isFinite(compliance))
                        compliance = 0;
                    else if (compliance > 100) compliance = 100;
                }
                if (compliance > 67) goodComplianceCount++;
            }
            const totalActiveTaxpayers = allActiveTaxpayers.length;
            const performance =
                totalActiveTaxpayers > 0
                    ? (goodComplianceCount / totalActiveTaxpayers) * 100
                    : 0;
            return {
                groupId: group.id,
                groupName: group.name,
                coordinatorName:
                    group.coordinator?.name || "Sin coordinador",
                totalActiveTaxpayers,
                goodComplianceCount,
                performance: Number(performance.toFixed(2)),
            };
        });
        return coordinationPerformance.sort(
            (a, b) => b.performance - a.performance
        );
    } catch (e) {
        logger.error("[REPORTS] getCoordinationPerformance failed", {
            error: e,
        });
        throw new Error(
            "Error al calcular el rendimiento de coordinación."
        );
    }
}

export async function getFiscalCollectAnalisis(
    fiscalId: string,
    date?: Date
) {
    const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    try {
        const taxpayers = await db.taxpayer.findMany({
            where: {
                officerId: fiscalId,
                status: true,
                emition_date: { gte: start, lt: end },
            },
            include: {
                IVAReports: { where: { date: { gte: start, lte: end } } },
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
        let taxpayerWithMostCollected: {
            name: string;
            rif: string;
            totalCollected: number;
            iva: number;
            islr: number;
            fines: number;
        } | null = null;
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
            if (fines.greaterThan(0)) taxpayersWithFines++;
            totalIva = totalIva.plus(iva);
            totalIslr = totalIslr.plus(islr);
            totalFines = totalFines.plus(fines);
            totalCollected = totalCollected.plus(collected);
        }

        const totalTaxpayers = taxpayers.length || 1;
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
        const sanitizeNumber = (value: number): number => {
            if (
                value === null ||
                value === undefined ||
                isNaN(value) ||
                !isFinite(value)
            )
                return 0;
            return value;
        };
        return {
            taxpayerWithMostCollected: taxpayerWithMostCollected || null,
            totalCollected: sanitizeNumber(
                Number(totalCollected.toFixed(2))
            ),
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
        throw new Error(
            "Error al obtener el análisis de recaudación."
        );
    }
}
