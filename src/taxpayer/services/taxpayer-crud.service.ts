/**
 * TaxpayerCrudService - Servicio refactorizado para operaciones CRUD de contribuyentes
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 * y utiliza el patrón de Repository para acceso a datos.
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import { BadRequestError } from '../../utils/errors/bad-request-error';
import { 
    NewTaxpayer, 
    NewTaxpayerExcelInput
} from '../taxpayer-utils';
import type { taxpayer_process, taxpayer_contract_type, taxpayer as Taxpayer } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import logger from '../../utils/logger';
import { validateFiscalAccessAndThrow } from '../helpers/access-control.helper';
import { sendEmailWithRetry, buildNewTaxpayerEmailHtml } from '../helpers/email.helper';
import { validateDate } from '../helpers/validation.helper';

export class TaxpayerCrudService {
    
    /**
     * Crea un nuevo contribuyente
     */
    static async create(input: NewTaxpayer): Promise<Taxpayer | Error> {
        try {
            // Validar duplicado de RIF antes de cualquier inserción
            const existingByRif = await taxpayerRepository.findByRif(input.rif);
            if (existingByRif) {
                throw new Error(`Ya existe un contribuyente activo con el RIF ${input.rif}.`);
            }

            if (!validateDate(input.emition_date)) {
                throw new Error("Fecha de emisión inválida");
            }

            const emitionDate = new Date(input.emition_date);
            const inputYear = emitionDate.getFullYear();

            // Validaciones de negocio
            if (input.role !== "ADMIN") {
                const normalizedName = input.name.replace(/\s+/g, "").toLowerCase();
                const firstWord = input.name.trim().split(/\s+/)[0];

                const matches = await taxpayerRepository.findTaxpayersByNameOrProvidenceNum(
                    input.providenceNum, 
                    firstWord
                );

                for (const entry of matches) {
                    const normalized = entry.name.replace(/\s+/g, "").toLowerCase();
                    const sameName = normalized === normalizedName;
                    const prevDate = new Date(entry.emition_date);
                    const prevYear = prevDate.getFullYear();

                    if (sameName) {
                        const afFpCombo = (entry.process === "AF" && input.process === "FP") ||
                            (entry.process === "FP" && input.process === "AF");

                        if (afFpCombo && inputYear === prevYear) {
                            throw new Error(`No se pueden registrar AF y FP en el mismo año para el mismo contribuyente.`);
                        }
                    }
                }
            }

            if (!input.pdfs || input.pdfs.length === 0) {
                throw new Error("At least one PDF must be uploaded.");
            }

            if (!input.parishId || !input.categoryId) {
                throw new Error("Parroquia y Actividad Económica son campos obligatorios.");
            }

            const pdfs = input.pdfs!;
            const taxpayer = await runTransaction(async (tx) => {
                const created = await taxpayerRepository.createTaxpayer({
                    providenceNum: input.providenceNum,
                    process: input.process,
                    name: input.name,
                    contract_type: input.contract_type,
                    officerId: input.officerId,
                    rif: input.rif,
                    address: input.address,
                    emition_date: emitionDate.toISOString(),
                    taxpayer_category_id: input.categoryId,
                    parish_id: input.parishId,
                }, tx);

                await taxpayerRepository.createInvestigationPdfs(
                    pdfs.map((pdf) => ({
                        pdf_url: pdf.pdf_url,
                        taxpayerId: created.id,
                    })), 
                    tx
                );

                return created;
            });

            // Notificación si es proceso AF
            if (input.process === "AF") {
                await this.sendTaxpayerCreatedNotification(taxpayer, input);
            }

            // Invalidar cache (invalidate all taxpayer cache)
            invalidateTaxpayerCache();

            return taxpayer;
        } catch (error: any) {
            logger.error("Error creating taxpayer", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Envía notificación de contribuyente creado
     */
    private static async sendTaxpayerCreatedNotification(
        taxpayer: Taxpayer, 
        input: NewTaxpayer
    ): Promise<void> {
        try {
            const [officer, fiscalName, admins] = await Promise.all([
                taxpayerRepository.findUserByIdWithGroupCoordinator(input.officerId),
                taxpayerRepository.findUserNameById(input.userId ?? ""),
                taxpayerRepository.findAdmins(),
            ]);

            const recipients = [
                ...admins.map((admin) => admin.email),
                ...(officer?.group?.coordinator?.email ? [officer.group.coordinator.email] : []),
            ];

            if (recipients.length > 0) {
                await sendEmailWithRetry({
                    to: recipients,
                    subject: `🔔 Nuevo Contribuyente AF: ${taxpayer.name}`,
                    html: buildNewTaxpayerEmailHtml(taxpayer, fiscalName),
                });
            }
        } catch (error) {
            logger.error("Error sending taxpayer created notification", error);
        }
    }

    /**
     * Crea contribuyentes desde Excel
     */
    static async createTaxpayerExcel(input: NewTaxpayerExcelInput) {
        try {
            if (!validateDate(input.emition_date)) {
                throw new Error("Fecha de emisión inválida");
            }

            const emitionDate = new Date(input.emition_date);
            
            if (!input.officerId) {
                throw new Error("El ID del oficial es requerido");
            }
            
            const officerId = input.officerId as string;
            
            const taxpayer = await runTransaction(async (tx) => {
                return await taxpayerRepository.createTaxpayerFromExcel({
                    providenceNum: input.providenceNum,
                    process: input.process,
                    name: input.name,
                    rif: input.rif,
                    contract_type: input.contract_type,
                    officerId: officerId,
                    address: input.address,
                    emition_date: emitionDate,
                    taxpayer_category_id: input.categoryId,
                    parish_id: input.parishId,
                }, tx);
            });

            invalidateTaxpayerCache();
            return taxpayer;
        } catch (error: any) {
            logger.error("Error creating taxpayer from Excel", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Actualiza un contribuyente
     */
    static async update(
        id: string, 
        data: any, 
        userId: string, 
        userRole: string
    ): Promise<Taxpayer> {
        try {
            // Verificar permisos
            await this.checkUpdatePermissions(id, userId, userRole);

            const updateData: Prisma.taxpayerUpdateInput = {};

            if (data.name !== undefined) updateData.name = data.name;
            if (data.rif !== undefined) updateData.rif = data.rif;
            if (data.providenceNum !== undefined) updateData.providenceNum = data.providenceNum;
            if (data.contract_type !== undefined) updateData.contract_type = data.contract_type as taxpayer_contract_type;
            if (data.process !== undefined) updateData.process = data.process as taxpayer_process;
            if (data.fase !== undefined) updateData.fase = data.fase;
            if (data.address !== undefined) updateData.address = data.address;

            if (data.parish_id) {
                updateData.parish = { connect: { id: data.parish_id } };
            }

            if (data.taxpayer_category_id) {
                updateData.taxpayer_category = { connect: { id: data.taxpayer_category_id } };
            }

            const updatedTaxpayer = await runTransaction((tx) =>
                tx.taxpayer.update({
                    where: { id },
                    data: updateData,
                })
            );

            invalidateTaxpayerCache();

            return updatedTaxpayer;
        } catch (error: any) {
            logger.error("Error updateTaxpayer", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error(error);
        }
    }

    /**
     * Verifica permisos de actualización
     */
    private static async checkUpdatePermissions(
        taxpayerId: string, 
        userId: string, 
        userRole: string
    ): Promise<void> {
        // ADMIN puede editar todo
        if (userRole === "ADMIN") {
            return;
        }

        // FISCAL: officer, supervisor o miembro del grupo
        if (userRole === "FISCAL") {
            await validateFiscalAccessAndThrow(
                userId,
                taxpayerId,
                "No tienes permisos para editar este contribuyente."
            );
            return;
        }

        const taxpayer = await db.taxpayer.findUnique({
            where: { id: taxpayerId },
            include: { user: true },
        });

        if (!taxpayer) {
            throw new Error("Contribuyente no encontrado");
        }

        const isCurrentOfficer = taxpayer.officerId === userId;

        // SUPERVISOR puede editar los del equipo
        if (userRole === "SUPERVISOR") {
            const isCurrentSupervisor = taxpayer.user?.supervisorId === userId;
            
            if (!isCurrentOfficer && !isCurrentSupervisor) {
                if (taxpayer.user?.groupId) {
                    const group = await db.fiscalGroup.findUnique({
                        where: { id: taxpayer.user.groupId },
                        include: {
                            members: {
                                where: { supervisorId: userId }
                            }
                        }
                    });
                    
                    if (!group || group.members.length === 0) {
                        throw new Error("No tienes permisos para editar este contribuyente.");
                    }
                } else {
                    throw new Error("No tienes permisos para editar este contribuyente.");
                }
            }
            return;
        }

        // COORDINATOR puede editar los del grupo
        if (userRole === "COORDINATOR") {
            const user = await db.user.findUnique({
                where: { id: userId },
                include: { coordinatedGroup: true }
            });

            if (taxpayer.user?.groupId === user?.coordinatedGroup?.id) {
                return;
            }
        }

        throw new Error("No tienes permisos para editar este contribuyente.");
    }

    /**
     * Elimina un contribuyente (soft delete)
     */
    static async delete(id: string): Promise<Taxpayer> {
        try {
            const taxpayer = await runTransaction((tx) =>
                taxpayerRepository.deleteById(id, tx)
            );

            invalidateTaxpayerCache();

            return taxpayer;
        } catch (error: any) {
            logger.error("Error deleting taxpayer", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Obtiene todos los contribuyentes con paginación
     */
    static async getAll(
        page?: number, 
        limit?: number, 
        year?: number, 
        search?: string
    ) {
        const pageNum = page || 1;
        const limitNum = limit || 50;
        const skip = (pageNum - 1) * limitNum;

        const where: any = {};
        
        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { rif: { contains: search, mode: 'insensitive' } },
            ];
        }

        if (year) {
            const startOfYear = new Date(year, 0, 1);
            const endOfYear = new Date(year + 1, 0, 1);
            where.emition_date = {
                gte: startOfYear,
                lt: endOfYear,
            };
        }

        const [data, total] = await Promise.all([
            db.taxpayer.findMany({
                where,
                skip,
                take: limitNum,
                orderBy: { created_at: 'desc' },
                include: {
                    user: { select: { id: true, name: true } },
                    parish: { select: { id: true, name: true } },
                    taxpayer_category: { select: { id: true, name: true } },
                },
            }),
            db.taxpayer.count({ where }),
        ]);

        return {
            data,
            total,
            page: pageNum,
            totalPages: Math.ceil(total / limitNum),
            limit: limitNum,
        };
    }

    /**
     * Obtiene contribuyente por ID
     */
    static async getById(id: string) {
        return db.taxpayer.findUnique({
            where: { id },
            include: {
                user: { select: { id: true, name: true } },
                parish: true,
                taxpayer_category: true,
                RepairReports: true,
                investigation_pdfs: true,
                observations: { orderBy: { date: 'desc' } },
            },
        });
    }

    /**
     * Obtiene contribuyentes por usuario
     */
    static async getByUserId(userId: string) {
        return db.taxpayer.findMany({
            where: { officerId: userId },
            orderBy: { created_at: 'desc' },
        });
    }

    /**
     * Obtiene contribuyentes del año actual del usuario
     */
    static async getMyCurrentYearTaxpayers(userId: string) {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear + 1, 0, 1);

        return db.taxpayer.findMany({
            where: {
                officerId: userId,
                emition_date: {
                    gte: startOfYear,
                    lt: endOfYear,
                },
            },
            orderBy: { created_at: 'desc' },
        });
    }

    /**
     * Obtiene contribuyentes del equipo del año actual
     */
    static async getTeamCurrentYearTaxpayers(userId: string, userRole: string) {
        // ADMIN y COORDINATOR ven todos los contribuyentes del año
        if (userRole === "ADMIN" || userRole === "COORDINATOR") {
            return this.getMyCurrentYearTaxpayers(userId);
        }

        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);
        const endOfYear = new Date(currentYear + 1, 0, 1);

        const user = await db.user.findUnique({
            where: { id: userId },
            include: { group: true },
        });

        // Si no tiene grupo, solo ve los propios
        if (!user?.groupId) {
            return this.getMyCurrentYearTaxpayers(userId);
        }

        // SUPERVISOR: ve los del grupo
        if (userRole === "SUPERVISOR") {
            return db.taxpayer.findMany({
                where: {
                    user: {
                        groupId: user.groupId,
                    },
                    emition_date: {
                        gte: startOfYear,
                        lt: endOfYear,
                    },
                },
                orderBy: { created_at: 'desc' },
            });
        }

        // FISCAL: solo ve los propios
        return this.getMyCurrentYearTaxpayers(userId);
    }

    // getForEvents / getForStats → movidos a taxpayer-queries.service.ts
}
