/**
 * Legacy Taxpayer Service
 *
 * Funciones que aún no han sido migradas a servicios modulares.
 * Usado por services/index.ts para evitar dependencia circular con taxpayer-services.ts.
 */

import { db, runTransaction } from '../../utils/db-server';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import logger from '../../utils/logger';
import { emailService } from '../../services/EmailService';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import type { Event, NewFase, NewIvaReport } from '../taxpayer-utils';
import { IndexIvaService } from './index-iva.service';
import { validateFiscalAccessAndThrow } from '../helpers/access-control.helper';

// ---------------------------------------------------------------------------
// getTaxpayerCategories / getParishList → movidos a category-parish.service.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// getEventsbyTaxpayer (delegado al nuevo EventService)
// ---------------------------------------------------------------------------

export const getEventsbyTaxpayer = async (taxpayerId?: string, type?: string): Promise<Event[] | Error> => {
    try {
        return await EventService.getEventsbyTaxpayer(taxpayerId, type);
    } catch (error) {
        logger.error(error);
        throw error;
    }
};

// ---------------------------------------------------------------------------
// updateFase
// ---------------------------------------------------------------------------

export const updateFase = async (data: NewFase) => {
    try {
        const taxpayerBefore = await taxpayerRepository.findTaxpayerWithUserAndCoordinator(data.id);
        if (!taxpayerBefore) throw new Error('Taxpayer not found');

        const oldFase = taxpayerBefore.fase.replace("_", " ");
        const updatedTaxpayerFase = await runTransaction((tx) =>
            taxpayerRepository.updateTaxpayerFase(data.id, data.fase, tx)
        );

        const adminUsers = await taxpayerRepository.findAdminEmails();
        const recipients = [
            taxpayerBefore.user?.email,
            ...adminUsers.map((admin) => admin.email),
        ].filter(Boolean);

        const fiscalName = taxpayerBefore.user?.name || 'Fiscal asignado';
        const coordinatorName = taxpayerBefore.user?.group?.coordinator?.name || 'Coordinador asignado';
        const taxpayerName = taxpayerBefore.name;
        const taxpayerRif = taxpayerBefore.rif;
        const newFase = data.fase.replace("_", " ");

        emailService.sendWithRetry({
            to: recipients.join(', '),
            subject: `Cambio de fase de auditoría fiscal - ${taxpayerName}`,
            html: `
            <div style="font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 20px;">
            <div style="max-width: 600px; margin: auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                <h2 style="color: #2c3e50;">🔔 Cambio de Fase de Auditoría Fiscal</h2>
                <p style="font-size: 16px; color: #333;">Se ha actualizado la fase del contribuyente <strong>${taxpayerName}</strong> (RIF: ${taxpayerRif}).</p>
                <table style="width: 100%; font-size: 15px; color: #555; margin: 20px 0;">
                <tr><td><strong>Fase anterior:</strong></td><td>${oldFase}</td></tr>
                <tr><td><strong>Nueva fase:</strong></td><td>${newFase}</td></tr>
                <tr><td><strong>Fiscal responsable:</strong></td><td>${fiscalName}</td></tr>
                <tr><td><strong>Coordinador del grupo:</strong></td><td>${coordinatorName}</td></tr>
                </table>
                <p style="font-size: 15px; color: #333;">Puedes acceder a la plataforma para revisar el detalle del cambio.</p>
                <div style="text-align: center; margin: 30px 0;">
                <a href="https://sac-app.com/taxpayer/${data.id}" style="background-color: #1e88e5; color: white; text-decoration: none; padding: 12px 24px; border-radius: 6px; font-size: 16px;">Ver contribuyente</a>
                </div>
                <p style="font-size: 13px; color: #888;">Este cambio fue registrado automáticamente por el sistema SAC.</p>
            </div>
            </div>
        `,
        }).catch((err: unknown) => logger.error("Error inesperado al enviar email de cambio de fase:", err));

        return updatedTaxpayerFase;
    } catch (e) {
        logger.error(e);
        throw new Error('Could not update the fase');
    }
};

// ---------------------------------------------------------------------------
// updateCulminated
// ---------------------------------------------------------------------------

export const updateCulminated = async (
    id: string,
    culminated: boolean,
    userId?: string,
    userRole?: string
) => {
    try {
        if (userId && userRole && userRole === "FISCAL") {
            await validateFiscalAccessAndThrow(
                userId,
                id,
                "No tienes permisos para culminar este contribuyente. Solo el fiscal asignado o su supervisor pueden hacerlo."
            );
        }

        const taxpayerBefore = await db.taxpayer.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        name: true,
                        group: {
                            select: {
                                coordinator: { select: { email: true } },
                            },
                        },
                    },
                },
            },
        });

        if (!taxpayerBefore) throw new Error("Contribuyente no encontrado");
        if (!taxpayerBefore.status && taxpayerBefore.culminated) {
            throw new Error("Este caso ya está cerrado definitivamente y no puede ser modificado.");
        }

        const updatedCulminatedProcess = await runTransaction((tx) =>
            tx.taxpayer.update({
                where: { id },
                data: { culminated },
            })
        );
        return updatedCulminatedProcess;
    } catch (e: any) {
        logger.error(e);
        throw new Error(e.message || "Couldn't update the culminated field.");
    }
};

// ---------------------------------------------------------------------------
// createIVA
// ---------------------------------------------------------------------------

export const createIVA = async (data: NewIvaReport, userId?: string, userRole?: string) => {
    if (userId && userRole && userRole === "FISCAL") {
        await validateFiscalAccessAndThrow(
            userId,
            data.taxpayerId,
            "No tienes permisos para crear reportes de este contribuyente."
        );
    }

    const reportDate = new Date(data.date);
    if (isNaN(reportDate.getTime())) {
        throw new Error(`Fecha de reporte inválida: "${data.date}". Por favor verifica el formato de la fecha.`);
    }
    const year = reportDate.getFullYear();
    const month = reportDate.getMonth() + 1;
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const createData = {
        taxpayerId: data.taxpayerId,
        purchases: new Decimal(data.purchases),
        sells: new Decimal(data.sells),
        paid: new Decimal(data.paid),
        date: new Date(data.date),
        iva: data.iva != null ? new Decimal(data.iva) : null,
        excess: data.excess != null ? new Decimal(data.excess) : null,
    };

    const report = await runTransaction(async (tx) => {
        const existing = await tx.iVAReports.findFirst({
            where: {
                taxpayerId: data.taxpayerId,
                date: { gte: startDate, lte: endDate },
            },
        });
        if (existing) {
            throw new Error(`Ya existe un reporte IVA para este contribuyente en ${month}/${year}.`);
        }
        return tx.iVAReports.create({ data: createData });
    });
    return report;
};

// ---------------------------------------------------------------------------
// getTaxpayerData / getTaxpayerSummary → movidos a taxpayer-queries.service.ts
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// CreateTaxpayerCategory → movido a category-parish.service.ts
// ---------------------------------------------------------------------------
