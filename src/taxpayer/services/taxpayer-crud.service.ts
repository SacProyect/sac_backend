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

            const fromAddress = process.env.EMAIL_FROM ?? 'no-reply@sac-app.com';
            const recipients = [
                ...admins.map(admin => admin.email),
                ...(officer?.group?.coordinator?.email ? [officer.group.coordinator.email] : []),
            ];

            if (recipients.length > 0) {
                const { emailService } = await import('../../services/EmailService');
                await emailService.sendWithRetry({
                    from: fromAddress,
                    to: recipients,
                    subject: `🔔 Nuevo Contribuyente AF: ${taxpayer.name}`,
                    html: this.buildTaxpayerCreatedEmailHtml(taxpayer, fiscalName),
                });
            }
        } catch (error) {
            logger.error("Error sending taxpayer created notification", error);
        }
    }

    /**
     * Construye HTML para email de contribuyente creado
     */
    private static buildTaxpayerCreatedEmailHtml(taxpayer: Taxpayer, fiscalName?: string | null): string {
        const now = new Date();
        const formattedDate = now.toLocaleDateString('es-VE', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });

        return `
        <div style="font-family: sans-serif; background-color: #f3f4f6; padding: 30px;">
            <div style="max-width: 600px; margin: auto; background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 14px rgba(0,0,0,0.1);">
                <h2 style="color: #2563eb;">📝 Nuevo Contribuyente Registrado</h2>
                <p>Se ha registrado un nuevo contribuyente en proceso <strong>AF</strong>.</p>
                <ul style="line-height: 1.6; font-size: 14px; padding-left: 20px; color: #374151;">
                    <li><strong>Nombre:</strong> ${taxpayer.name}</li>
                    <li><strong>RIF:</strong> ${taxpayer.rif}</li>
                    <li><strong>Proceso:</strong> ${taxpayer.process}</li>
                    <li><strong>Registrado por:</strong> ${fiscalName ?? '—'}</li>
                    <li><strong>Fecha:</strong> ${formattedDate}</li>
                </ul>
            </div>
        </div>
        `;
    }

    /**
     * Crea contribuyentes desde Excel
     */
    static async createTaxpayerExcel(input: NewTaxpayerExcelInput) {
        try {
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

        const taxpayer = await db.taxpayer.findUnique({
            where: { id: taxpayerId },
            include: { user: true },
        });

        if (!taxpayer) {
            throw new Error("Contribuyente no encontrado");
        }

        const isCurrentOfficer = taxpayer.officerId === userId;
        
        // FISCAL puede editar los propios
        if (userRole === "FISCAL" && isCurrentOfficer) {
            return;
        }

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

    /**
     * Obtiene contribuyentes para eventos
     */
    static async getForEvents(
        userId: string, 
        userRole: string, 
        page?: number, 
        limit?: number, 
        search?: string
    ) {
        const pageNum = page || 1;
        const limitNum = limit || 20;
        const skip = (pageNum - 1) * limitNum;

        const where: any = {
            status: true,
        };

        if (search) {
            where.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { rif: { contains: search, mode: 'insensitive' } },
            ];
        }

        // Filtrar por rol (ADMIN y COORDINATOR ven todo)
        if (userRole !== "ADMIN" && userRole !== "COORDINATOR") {
            const user = await db.user.findUnique({
                where: { id: userId },
                include: { group: true },
            });

            if (user?.groupId) {
                where.user = { groupId: user.groupId };
            } else {
                where.officerId = userId;
            }
        }

        const [data, total] = await Promise.all([
            db.taxpayer.findMany({
                where,
                skip,
                take: limitNum,
                select: {
                    id: true,
                    name: true,
                    rif: true,
                    process: true,
                    address: true,
                    status: true,
                },
                orderBy: { name: 'asc' },
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
     * Obtiene contribuyentes del fiscal para estadísticas
     */
    static async getForStats(userId: string) {
        const currentYear = new Date().getFullYear();
        const startOfYear = new Date(currentYear, 0, 1);

        return db.taxpayer.findMany({
            where: {
                officerId: userId,
                emition_date: { gte: startOfYear },
            },
            select: {
                id: true,
                name: true,
                rif: true,
                process: true,
                fase: true,
            },
        });
    }
}
