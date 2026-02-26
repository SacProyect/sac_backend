/**
 * Servicio de reportes y cálculos específicos de IVA.
 * Desacoplado de reports-services para reducir complejidad y mantener una fachada única.
 */

import { db } from "../utils/db-server";
import { Decimal } from "@prisma/client/runtime/library";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";
import logger from "../utils/logger";
import { MonthIva, MonthlyRow } from "./report-utils";

export function calculateComplianceScore(
    taxpayer: any,
    fechaFin: Date,
    yearFilter: number | undefined,
    indexIva: any[]
): {
    score: number;
    mesesExigibles: number;
    pagosValidos: number;
    clasificacion: "ALTO" | "MEDIO" | "BAJO";
    fechaInicio: Date;
} {
    try {
        if (!taxpayer || !taxpayer.id) {
            logger.error(`[COMPLIANCE_SCORE] Taxpayer inválido o sin ID`);
            return {
                score: 0,
                mesesExigibles: 1,
                pagosValidos: 0,
                clasificacion: "BAJO",
                fechaInicio: new Date(),
            };
        }

        const safeNumber = (v: unknown): number => {
            const n = typeof v === "number" ? v : Number(v);
            return Number.isFinite(n) ? n : 0;
        };

        let fechaInicio: Date;
        if (taxpayer.emition_date) {
            fechaInicio = new Date(taxpayer.emition_date);
        } else {
            logger.warn(
                `⚠️ [COMPLIANCE_SCORE] Contribuyente ${taxpayer.id} (${taxpayer.rif}) no tiene emition_date. Usando created_at como fallback.`
            );
            fechaInicio = new Date(taxpayer.created_at || new Date());
        }
        if (isNaN(fechaInicio.getTime())) fechaInicio = new Date();

        const fechaFinValida = !fechaFin || isNaN(fechaFin.getTime()) ? new Date() : fechaFin;
        const selectedYear = yearFilter ?? fechaFinValida.getUTCFullYear();
        const startOfYear = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0, 0));
        const endOfYearExclusive = new Date(Date.UTC(selectedYear + 1, 0, 1, 0, 0, 0, 0));
        const fechaInicioCalculo = fechaInicio < startOfYear ? startOfYear : fechaInicio;
        const fechaFinCalculo =
            fechaFinValida >= endOfYearExclusive
                ? new Date(Date.UTC(selectedYear, 11, 31, 23, 59, 59, 999))
                : fechaFinValida;

        const yDiff = fechaFinCalculo.getUTCFullYear() - fechaInicioCalculo.getUTCFullYear();
        const mDiff = fechaFinCalculo.getUTCMonth() - fechaInicioCalculo.getUTCMonth();
        const mesesExigibles = Math.max(1, yDiff * 12 + mDiff + 1);

        const contractType: string = taxpayer.contract_type || "UNKNOWN";
        const indicesForContract = (Array.isArray(indexIva) ? indexIva : [])
            .filter((i: any) => i?.contract_type === contractType)
            .sort(
                (a: any, b: any) =>
                    new Date(a?.created_at).getTime() - new Date(b?.created_at).getTime()
            );

        const getActiveIndexBaseAmount = (refDate: Date): number => {
            if (taxpayer.index_iva !== null && taxpayer.index_iva !== undefined) {
                const specificIndex = safeNumber(taxpayer.index_iva);
                if (specificIndex > 0) return specificIndex;
            }
            if (!indicesForContract.length) return 0;
            const t = refDate.getTime();
            const active = indicesForContract.filter((i: any) => {
                const c = new Date(i?.created_at).getTime();
                const e = i?.expires_at ? new Date(i.expires_at).getTime() : null;
                return Number.isFinite(c) && c <= t && (e === null || t < e);
            });
            const chosen = active.length
                ? active.reduce((latest: any, cur: any) =>
                      new Date(cur.created_at).getTime() > new Date(latest.created_at).getTime()
                          ? cur
                          : latest
                  )
                : indicesForContract
                      .filter((i: any) => i?.expires_at === null)
                      .sort(
                          (a: any, b: any) =>
                              new Date(a?.created_at).getTime() - new Date(b?.created_at).getTime()
                      )
                      .at(-1);
            return safeNumber(chosen?.base_amount);
        };

        const ivaReports = Array.isArray(taxpayer.IVAReports) ? taxpayer.IVAReports : [];
        const ivaPaidByMonth = new Map<string, number>();
        for (const r of ivaReports) {
            if (!r?.date) continue;
            const d = new Date(r.date);
            if (isNaN(d.getTime())) continue;
            if (d < fechaInicioCalculo || d > fechaFinCalculo) continue;
            if (d < startOfYear || d >= endOfYearExclusive) continue;
            const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            ivaPaidByMonth.set(key, (ivaPaidByMonth.get(key) ?? 0) + safeNumber(r?.paid));
        }

        let mesesEvaluables = 0;
        let mesesConPago = 0;
        let sumRatio = 0;
        for (let i = 0; i < mesesExigibles; i++) {
            const monthDate = new Date(
                Date.UTC(
                    fechaInicioCalculo.getUTCFullYear(),
                    fechaInicioCalculo.getUTCMonth() + i,
                    15,
                    0,
                    0,
                    0,
                    0
                )
            );
            if (monthDate < startOfYear || monthDate >= endOfYearExclusive) continue;
            if (monthDate > fechaFinCalculo) continue;
            const expected = getActiveIndexBaseAmount(monthDate);
            if (expected <= 0) continue;
            const key = `${monthDate.getUTCFullYear()}-${String(monthDate.getUTCMonth() + 1).padStart(2, "0")}`;
            const paid = safeNumber(ivaPaidByMonth.get(key) ?? 0);
            if (paid > 0) mesesConPago++;
            sumRatio += Math.min(1, paid / expected);
            mesesEvaluables++;
        }

        let score = 0;
        if (mesesEvaluables > 0) {
            score = Number(((sumRatio / mesesEvaluables) * 100).toFixed(2));
            score = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
        }
        let clasificacion: "ALTO" | "MEDIO" | "BAJO" = "BAJO";
        if (score >= 80) clasificacion = "ALTO";
        else if (score >= 50) clasificacion = "MEDIO";

        if (process.env.NODE_ENV !== "production") {
            logger.info(
                `[COMPLIANCE_SCORE_IVA] ID:${taxpayer.id} RIF:${taxpayer.rif || "N/A"} ` +
                    `Año:${selectedYear} MesesExigibles:${mesesExigibles} MesesEvaluables:${mesesEvaluables} ` +
                    `MesesConPago:${mesesConPago} Score:${score}% Clasificación:${clasificacion}`
            );
        }

        return {
            score: Number.isFinite(score) ? score : 0,
            mesesExigibles,
            pagosValidos: mesesConPago,
            clasificacion,
            fechaInicio,
        };
    } catch (error) {
        logger.error(
            `[COMPLIANCE_SCORE_IVA] Error crítico al calcular complianceScore para ${taxpayer?.id || "unknown"}:`,
            error
        );
        return {
            score: 0,
            mesesExigibles: 1,
            pagosValidos: 0,
            clasificacion: "BAJO",
            fechaInicio: new Date(),
        };
    }
}

export function hadGoodComplianceBeforeProcedure(
    taxpayer: any,
    procedureDate: Date,
    indexIva: any[],
    currentYear: number
): boolean {
    const procedureYear = procedureDate.getUTCFullYear();
    const procedureMonth = procedureDate.getUTCMonth();
    if (procedureYear < currentYear) return false;
    const startOfYear = new Date(Date.UTC(currentYear, 0, 1));
    const monthBeforeProcedure =
        procedureMonth === 0
            ? new Date(Date.UTC(currentYear - 1, 11, 31))
            : new Date(Date.UTC(currentYear, procedureMonth - 1, 31));
    const ivaReportsBefore = taxpayer.IVAReports.filter((report: any) => {
        const reportDate = new Date(report.date);
        return reportDate >= startOfYear && reportDate <= monthBeforeProcedure;
    });
    if (ivaReportsBefore.length === 0) return false;
    let totalPaidBefore = new Decimal(0);
    for (const report of ivaReportsBefore) {
        totalPaidBefore = totalPaidBefore.plus(report.paid || 0);
    }
    let expectedBefore = new Decimal(0);
    const monthsToEvaluate = procedureYear === currentYear ? procedureMonth : 0;
    for (let m = 0; m < monthsToEvaluate; m++) {
        const refDate = new Date(Date.UTC(currentYear, m, 15));
        const index = indexIva.find(
            (i: any) =>
                i.contract_type === taxpayer.contract_type &&
                refDate >= i.created_at &&
                (i.expires_at === null || refDate < i.expires_at)
        );
        if (index) expectedBefore = expectedBefore.plus(index.base_amount);
    }
    if (expectedBefore.equals(0)) return false;
    const complianceBefore = totalPaidBefore.div(expectedBefore).times(100).toNumber();
    return complianceBefore > 67;
}

export const getGlobalPerformance = async (date: Date): Promise<MonthlyRow[]> => {
    try {
        if (!date) {
            const now = new Date();
            date = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
        }
        const year = date.getUTCFullYear();
        const startOfYear = new Date(Date.UTC(year, 0, 1));
        const startOfNextYear = new Date(Date.UTC(year + 1, 0, 1));

        const taxpayers = await db.taxpayer.findMany({
            where: { emition_date: { gte: startOfYear, lt: startOfNextYear } },
            select: { id: true, contract_type: true, emition_date: true },
        });

        const ivaReports = await db.iVAReports.findMany({
            where: {
                taxpayerId: { in: taxpayers.map((t) => t.id) },
                date: { gte: startOfYear, lt: startOfNextYear },
            },
            select: { taxpayerId: true, date: true, paid: true },
        });

        const indexes = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

        const idxByContract = new Map<string, typeof indexes>();
        for (const ct of new Set(indexes.map((i) => i.contract_type))) {
            idxByContract.set(
                ct,
                indexes
                    .filter((i) => i.contract_type === ct)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            );
        }

        const getIndexFor = (contractType: string, refDate: Date) => {
            const list = idxByContract.get(contractType);
            if (!list || list.length === 0) return null;
            let chosen: (typeof list)[number] | null = null;
            const ref = refDate.getTime();
            for (const idx of list) {
                const c = new Date(idx.created_at).getTime();
                const e = idx.expires_at ? new Date(idx.expires_at).getTime() : null;
                const active = c <= ref && (e === null || ref < e);
                if (active && (!chosen || c > new Date(chosen.created_at).getTime())) chosen = idx;
            }
            return chosen;
        };

        const realByMonth = new Map<string, number>();
        for (const r of ivaReports) {
            const d = new Date(r.date);
            const key = `${year}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
            realByMonth.set(key, (realByMonth.get(key) ?? 0) + Number(r.paid ?? 0));
        }

        const rows: MonthlyRow[] = [];
        for (let m = 0; m <= 11; m++) {
            const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;
            const monthStart = new Date(Date.UTC(year, m, 1));
            const monthEnd = new Date(Date.UTC(year, m + 1, 1));
            const midMonth = new Date(Date.UTC(year, m, 15));
            const realAmount = Number((realByMonth.get(monthKey) ?? 0).toFixed(2));
            let expected = new Decimal(0);
            for (const t of taxpayers) {
                const idx = getIndexFor(t.contract_type, midMonth);
                if (idx?.base_amount != null) expected = expected.plus(idx.base_amount);
            }
            const taxpayersEmitted = taxpayers.filter((t) => {
                const e = new Date(t.emition_date);
                return e >= monthStart && e < monthEnd;
            }).length;
            rows.push({ month: monthKey, expectedAmount: Number(expected.toFixed(2)), realAmount, taxpayersEmitted });
        }
        return rows;
    } catch (error) {
        logger.error("[REPORTS] getGlobalPerformance failed", {
            inputDate: date,
            year: date ? date.getUTCFullYear() : undefined,
            error,
        });
        throw new Error("Can't get the global performance");
    }
};

export async function getIvaByMonth(date: Date): Promise<{
    year: number;
    months: MonthIva[];
    totalIvaCollected: number;
}> {
    if (!date) {
        const now = new Date();
        date = new Date(now.getUTCFullYear(), now.getUTCMonth(), 1);
    }
    const year = date.getUTCFullYear();
    const start = new Date(Date.UTC(year, 0, 1));
    const end = new Date(Date.UTC(year + 1, 0, 1));
    const monthNames = [
        "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
    ];
    const buckets: { amount: Decimal }[] = Array.from({ length: 12 }, () => ({ amount: new Decimal(0) }));

    const ivaReports = await db.iVAReports.findMany({
        where: {
            date: { gte: start, lt: end },
            AND: {
                taxpayer: {
                    emition_date: { gte: start, lte: end },
                },
            },
        },
        select: { date: true, paid: true },
    });

    for (const rep of ivaReports) {
        if (!rep?.date) continue;
        const m = new Date(rep.date).getUTCMonth();
        buckets[m].amount = buckets[m].amount.plus(new Decimal(rep.paid ?? 0));
    }

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
    const startOf2025 = new Date(Date.UTC(2025, 0, 1));
    const endOf2025 = new Date(Date.UTC(2026, 0, 1));
    const cutoffDate = new Date(Date.UTC(2025, 0, 1));
    try {
        const ivaReports2025 = await db.iVAReports.findMany({
            where: { date: { gte: startOf2025, lt: endOf2025 } },
            select: { taxpayer: { select: { emition_date: true } } },
        });
        const mismatched = ivaReports2025.filter((iva) => iva.taxpayer.emition_date < cutoffDate);
        logger.info("[REPORTS] debugQuery 2025 IVA reports summary", {
            totalReports: ivaReports2025.length,
            mismatchedCount: mismatched.length,
        });
        return mismatched;
    } catch (e) {
        logger.error("[REPORTS] debugQuery failed", { error: e });
        return [];
    }
}

export async function getIndividualIvaReport(id: string, date?: Date) {
    try {
        const year = date ? date.getUTCFullYear() : new Date().getUTCFullYear();
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year + 1, 0, 1));

        const ivaReports = await db.iVAReports.findMany({
            where: { taxpayerId: id, date: { gte: start, lt: end } },
            orderBy: { date: "asc" },
            select: {
                id: true,
                date: true,
                paid: true,
                taxpayer: { select: { index_iva: true, contract_type: true } },
            },
        });

        if (ivaReports.length === 0) {
            const empty = { performance: "0.00%", variationFromPrevious: "0.00%" };
            return {
                enero: empty, febrero: empty, marzo: empty, abril: empty, mayo: empty, junio: empty,
                julio: empty, agosto: empty, septiembre: empty, octubre: empty, noviembre: empty, diciembre: empty,
            };
        }

        const taxpayer = ivaReports[0].taxpayer;
        if (taxpayer.index_iva === null) {
            throw new Error("No se encontró un índice IVA aplicable para este contribuyente.");
        }

        const applicableIndex = await db.indexIva.findFirst({
            where: { base_amount: taxpayer.index_iva, contract_type: taxpayer.contract_type },
            select: { base_amount: true },
        });
        if (!applicableIndex) {
            throw new Error("No se encontró un índice IVA aplicable para este contribuyente.");
        }
        const base = Number(applicableIndex.base_amount);

        const performanceByMonth: Record<string, { performance: string; variationFromPrevious?: string }> = {};
        let lastPerformance: number | null = null;

        for (const report of ivaReports) {
            const month = formatInTimeZone(report.date, "UTC", "MMMM", { locale: es });
            const paid = Number(report.paid);
            const performance = ((paid - base) / base) * 100;
            const entry: { performance: string; variationFromPrevious?: string } = { performance: `${performance.toFixed(2)}%` };
            if (lastPerformance !== null && lastPerformance !== 0) {
                const variation = ((performance - lastPerformance) / Math.abs(lastPerformance)) * 100;
                entry.variationFromPrevious = `${variation.toFixed(2)}%`;
            }
            if (lastPerformance !== null && lastPerformance === 0) entry.variationFromPrevious = `${performance.toFixed(2)}%`;
            if (lastPerformance === null) entry.variationFromPrevious = `${performance.toFixed(2)}%`;
            performanceByMonth[month] = entry;
            lastPerformance = performance;
        }

        const completeMonths = [
            "enero", "febrero", "marzo", "abril", "mayo", "junio",
            "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
        ];
        for (const month of completeMonths) {
            if (!Object.keys(performanceByMonth).includes(month)) {
                performanceByMonth[month] = { performance: "0.00%", variationFromPrevious: "0.00%" };
            }
        }
        return performanceByMonth;
    } catch (e) {
        logger.error("[REPORTS] getIndividualIvaReport failed", { taxpayerId: id, date, error: e });
        throw new Error("Failed to fetch individual IVA report");
    }
}

export async function getExpectedAmount(date?: Date) {
    try {
        const baseDate = date || new Date();
        const currentYear = baseDate.getUTCFullYear();
        const currentMonthIdx = baseDate.getUTCMonth();
        const prevMonthIdx = currentMonthIdx === 0 ? 0 : currentMonthIdx - 1;
        const prevMonthStart = new Date(Date.UTC(currentYear, prevMonthIdx, 1));
        const prevMonthEnd = new Date(Date.UTC(currentYear, prevMonthIdx + 1, 1));

        const ivaReports = await db.iVAReports.findMany({
            where: { date: { gte: prevMonthStart, lt: prevMonthEnd } },
            include: { taxpayer: true },
        });

        const taxpayers = await db.taxpayer.findMany({
            where: {
                emition_date: {
                    gte: new Date(Date.UTC(currentYear, 0, 1)),
                    lt: new Date(Date.UTC(currentYear + 1, 0, 1)),
                },
            },
            select: { id: true, contract_type: true, emition_date: true },
        });

        const indexIva = await db.indexIva.findMany({
            select: { contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });

        const idxByContract = new Map<string, typeof indexIva>();
        for (const ct of new Set(indexIva.map((i) => i.contract_type))) {
            idxByContract.set(
                ct,
                indexIva
                    .filter((i) => i.contract_type === ct)
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            );
        }

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
                    new Date(cur.created_at).getTime() > new Date(latest.created_at).getTime() ? cur : latest
                );
            }
            const fallback = list
                .filter((i) => i.expires_at === null)
                .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                .at(-1);
            return fallback ?? null;
        };

        let totalExpected = new Decimal(0);
        let totalPaid = new Decimal(0);
        let reportCount = 0;

        for (const report of ivaReports) {
            const taxpayer = report.taxpayer;
            if (!taxpayer) continue;
            const idx = getActiveIndexOrFallback(taxpayer.contract_type, new Date(report.date));
            if (!idx) continue;
            totalExpected = totalExpected.plus(idx.base_amount);
            totalPaid = totalPaid.plus(report.paid ?? 0);
            reportCount++;
        }

        for (const t of taxpayers) {
            if (ivaReports.some((r) => r.taxpayer?.id === t.id)) continue;
            const refDate = new Date(Date.UTC(currentYear, prevMonthIdx, 15));
            const idx = getActiveIndexOrFallback(t.contract_type, refDate);
            if (idx?.base_amount != null) totalExpected = totalExpected.plus(idx.base_amount);
        }

        const difference = totalPaid.minus(totalExpected);
        const percentageDifference = totalExpected.gt(0)
            ? difference.dividedBy(totalExpected).times(100).toDecimalPlaces(2)
            : new Decimal(0);
        const compliancePercentage = totalExpected.gt(0)
            ? totalPaid.dividedBy(totalExpected).times(100).toDecimalPlaces(2)
            : new Decimal(0);

        return {
            month: prevMonthIdx + 1,
            totalReports: reportCount,
            totalExpected: totalExpected.toNumber(),
            totalPaid: totalPaid.toNumber(),
            difference: difference.toNumber(),
            percentage: percentageDifference.toNumber(),
            compliance: compliancePercentage.toNumber(),
            status: percentageDifference.gte(0) ? "superávit" : "déficit",
        };
    } catch (e) {
        logger.error("[REPORTS] getExpectedAmount failed", { date, error: e });
        throw new Error("Error al calcular la recaudación esperada.");
    }
}

/**
 * Calcula el excedente de crédito fiscal (IVA) siguiendo la lógica de consumo por IVA.
 */
export function calculateCreditSurplus(
    reports: { date: Date; excess: Decimal | null; iva: Decimal | null }[]
): number {
    const sorted = reports
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let accumulated = 0;
    let totalAdded = 0;
    for (const r of sorted) {
        const ex = r.excess ? Number(r.excess) : 0;
        const iv = r.iva ? Number(r.iva) : 0;
        if (accumulated === 0 && ex > 0) {
            accumulated = ex;
            totalAdded += ex;
        } else if (accumulated > 0) {
            accumulated -= iv;
            if (accumulated < 0) accumulated = 0;
        }
    }
    return totalAdded;
}
