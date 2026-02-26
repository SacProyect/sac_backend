import { Taxpayer_Fases } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { db, TxClient } from "../../utils/db-server";
import { Taxpayer } from "../taxpayer-utils";
import { getRoleStrategy } from "../../users/role-strategies";
import type {
    ITaxpayerRepository,
    CreateTaxpayerData,
    UpdateTaxpayerData,
    TaxpayersPaginated,
} from "../interfaces/ITaxpayerRepository";

export class TaxpayerRepository implements ITaxpayerRepository {

    async findManyUsers(tx?: TxClient) {
        const client = tx ?? db;
        return client.user.findMany({
            select: {
                id: true,
                name: true,
                role: true,
                personId: true,
                status: true,
                email: true,
                groupId: true,
                supervisorId: true,
                updated_at: true,
            },
        });
    }

    /** Usado para emails: obtiene usuario (oficial) con grupo y coordinador. */
    async findUserByIdWithGroupCoordinator(userId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                group: {
                    select: {
                        id: true,
                        name: true,
                        coordinator: { select: { email: true, name: true } },
                    },
                },
            },
        });
    }

    /** Obtiene solo el nombre de un usuario por ID. */
    async findUserNameById(userId: string, tx?: TxClient): Promise<string | null> {
        const client = tx ?? db;
        const user = await client.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });
        return user?.name ?? null;
    }

    /** Obtiene todos los usuarios con rol ADMIN (para notificaciones). */
    async findAdmins(tx?: TxClient) {
        const client = tx ?? db;
        return client.user.findMany({
            where: { role: "ADMIN" },
            select: { id: true, name: true, email: true },
        });
    }

    /** Obtiene admins solo con email (para listas de destinatarios). */
    async findAdminEmails(tx?: TxClient) {
        const client = tx ?? db;
        return client.user.findMany({
            where: { role: "ADMIN" },
            select: { email: true },
        });
    }

    /** Obtiene contribuyente con user, group y coordinator para emails/notificaciones. */
    async findTaxpayerWithUserAndCoordinator(taxpayerId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.findUnique({
            where: { id: taxpayerId },
            include: {
                user: {
                    include: {
                        group: {
                            include: {
                                coordinator: true,
                            },
                        },
                    },
                },
            },
        });
    }

    /** Actualiza solo la fase de un contribuyente. */
    async updateTaxpayerFase(taxpayerId: string, fase: Taxpayer_Fases, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.update({
            where: { id: taxpayerId },
            data: { fase },
        });
    }

    async findExistingByProvidence(providenceNum: bigint, startOfYear: Date, endOfYear: Date, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.findMany({
            where: {
                providenceNum,
                status: true,
                emition_date: {
                    gte: startOfYear,
                    lt: endOfYear,
                }
            },
            select: {
                id: true,
                process: true,
                emition_date: true,
                status: true
            }
        });
    }

    async findCandidatesByName(firstWord: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.findMany({
            where: {
                name: { contains: firstWord },
            },
            select: {
                name: true,
                emition_date: true,
            },
        });
    }

    async createTaxpayer(data: any, tx?: TxClient) { // Consider DTO
        const client = tx ?? db;
        return client.taxpayer.create({
            data: data
        });
    }

    /** Crear contribuyente desde flujo Excel/formulario (sin PDFs). */
    async createTaxpayerFromExcel(data: {
        providenceNum: bigint;
        process: string;
        name: string;
        rif: string;
        contract_type: string;
        officerId: string;
        address: string;
        emition_date: Date;
        taxpayer_category_id: string;
        parish_id: string;
    }, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.create({
            data: {
                providenceNum: data.providenceNum,
                process: data.process as any,
                name: data.name,
                rif: data.rif,
                contract_type: data.contract_type as any,
                officerId: data.officerId,
                address: data.address,
                emition_date: data.emition_date,
                taxpayer_category_id: data.taxpayer_category_id,
                parish_id: data.parish_id,
            },
        });
    }

    async createInvestigationPdfs(pdfs: { pdf_url: string, taxpayerId: string }[], tx?: TxClient) {
        const client = tx ?? db;
        return client.investigationPdf.createMany({
            data: pdfs
        });
    }

    async findTaxpayersByNameOrProvidenceNum(providenceNum: bigint, firstWord: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.findMany({
            where: {
                OR: [
                    { providenceNum: providenceNum },
                    { name: { contains: firstWord } }
                ]
            },
            select: {
                name: true,
                emition_date: true,
                process: true,
                providenceNum: true
            }
        });
    }
    
    async findIndexIvaExpired(tx?: TxClient) {
        const client = tx ?? db;
        return client.indexIva.findMany({
            where: { expires_at: null },
            select: { id: true, contract_type: true, base_amount: true, created_at: true, expires_at: true },
        });
    }

    async expireIndexIva(tx?: TxClient) {
        const client = tx ?? db;
        return client.indexIva.updateMany({
            where: {
                expires_at: null,
            },
            data: {
                expires_at: new Date(),
            },
        });
    }

    async createIndexIvaRecord(contract_type: "SPECIAL" | "ORDINARY", base_amount: Decimal, tx?: TxClient) {
        const client = tx ?? db;
        return client.indexIva.create({
            data: {
                contract_type,
                base_amount,
            },
        });
    }

    async updateTaxpayerIndexIva(where: any, data: any, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.updateMany({
            where,
            data,
        });
    }

    async updateIndexIva(taxpayerId: string, newIndexIva: Decimal, tx?: TxClient) {
        const client = tx ?? db;
        return await client.taxpayer.update({
            where: {
                id: taxpayerId,
            },
            data: {
                index_iva: newIndexIva,
            }
        });
    }

    /**
     * Índice Soberano: obtiene el índice general activo para un tipo de contrato en una fecha.
     * Usado como fallback cuando el contribuyente no tiene index_iva propio.
     */
    async findActiveGeneralIndexIva(contractType: string, refDate: Date, tx?: TxClient): Promise<{ base_amount: Decimal } | null> {
        const client = tx ?? db;
        const record = await client.indexIva.findFirst({
            where: {
                contract_type: contractType as "SPECIAL" | "ORDINARY",
                created_at: { lte: refDate },
                OR: [
                    { expires_at: null },
                    { expires_at: { gt: refDate } },
                ],
            },
            select: { base_amount: true },
            orderBy: { created_at: "desc" },
        });
        return record;
    }

    async createPayment(input: any, tx?: TxClient) { // Consider using a DTO for input here
        const client = tx ?? db;
        return client.payment.create({
            data: input,
            include: {
                event: true
            }
        });
    }

    async updateEventDebt(eventId: string, amount: Decimal, tx?: TxClient) {
        const client = tx ?? db;
        return client.event.update({
            where: { id: eventId },
            data: { debt: { decrement: amount } },
        });
    }

    /** Restaura la deuda del evento al eliminar (soft) un pago. */
    async restoreEventDebt(eventId: string, amount: Decimal, tx?: TxClient) {
        const client = tx ?? db;
        return client.event.update({
            where: { id: eventId },
            data: { debt: { increment: amount } },
        });
    }

    async findPaymentById(paymentId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.payment.findUnique({
            where: { id: paymentId },
            select: {
                id: true,
                amount: true,
                date: true,
                status: true,
                eventId: true,
                taxpayerId: true,
                updated_at: true,
                event: {
                    select: {
                        id: true,
                        amount: true,
                        type: true,
                        date: true,
                        debt: true,
                        taxpayerId: true,
                        status: true,
                    },
                },
            },
        });
    }

    async findEventById(eventId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.event.findFirst({
            where: { id: eventId, status: true },
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
        });
    }

    async createEvent(input: any, tx?: TxClient) { // Consider using a DTO for input here
        const client = tx ?? db;
        return client.event.create({
            data: {
                ...input,
            }
        });
    }

    async createRepairReport(taxpayerId: string, pdf_url: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.repairReport.create({
            data: {
                taxpayerId,
                pdf_url,
            },
        });
    }

    async createObservation(input: { taxpayerId: string, description: string, date: Date }, tx?: TxClient) {
        const client = tx ?? db;
        return await client.observations.create({
            data: {
                taxpayerId: input.taxpayerId,
                description: input.description,
                date: input.date,
            }
        });
    }

    async deleteRepairReportById(id: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.repairReport.delete({
            where: { id },
        });
    }

    async deleteObservationById(id: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.observations.delete({
            where: {
                id: id,
            }
        });
    }

    /** Soft delete: solo marca status false. La restauración de deuda se hace en el servicio dentro de la transacción. */
    async deletePaymentById(paymentId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.payment.update({
            where: { id: paymentId },
            include: { event: true },
            data: { status: false },
        });
    }

    async deleteIslrById(id: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.iSLRReports.delete({
            where: { id: id }
        });
    }

    async deleteIvaById(id: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.iVAReports.delete({
            where: { id: id },
        });
    }

    /** Soft delete: marca el evento como inactivo (status: false). */
    async deleteEventById(eventId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.event.update({
            where: { id: eventId },
            data: { status: false },
        });
    }

    /** Soft delete: marca el contribuyente como inactivo (status: false). */
    async deleteById(taxpayerId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.update({
            where: { id: taxpayerId },
            data: { status: false },
        });
    }

    async findIslrReportsByTaxpayer(taxpayerId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.iSLRReports.findMany({
            where: {
                taxpayerId: taxpayerId,
            },
            include: {
                taxpayer: {
                    select: {
                        name: true,
                        process: true,
                    }
                }
            }
        });
    }

    async findIvaReportsByTaxpayer(taxpayerId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.iVAReports.findMany({
            where: { taxpayerId },
            select: {
                id: true,
                date: true,
                paid: true,
                iva: true,
                excess: true,
                purchases: true,
                sells: true,
                taxpayerId: true,
                updated_at: true,
            },
        });
    }

    async findObservationsByTaxpayer(taxpayerId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.observations.findMany({
            where: { taxpayerId },
            select: { id: true, description: true, date: true, taxpayerId: true },
        });
    }

    async getTaxpayerData(id: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.findUnique({
            where: {
                id: id
            },
            include: {
                RepairReports: true,
                investigation_pdfs: true,
                user: {
                    select: {
                        id: true,
                        name: true,
                        group: {
                            select: {
                                coordinatorId: true,
                                coordinator: {
                                    select: {
                                        name: true
                                    }
                                }
                            }
                        },
                        supervisorId: true,
                    }
                },
                IVAReports: {
                    take: 1,
                    orderBy: {
                        date: 'desc'
                    }
                },
                taxpayer_category: true,
                parish: true,
            },
        });
    }

    async findPendingPayments(where: any, tx?: TxClient) {
        const client = tx ?? db;
        return client.event.findMany({
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                taxpayerId: true,
                taxpayer: {
                    select: {
                        name: true,
                        rif: true,
                    }
                }

            },
            where
        });
    }

    async findPayments(where: any, tx?: TxClient) {
        const client = tx ?? db;
        return client.payment.findMany({
            where,
            select: {
                id: true,
                date: true,
                amount: true,
                event: true,
                taxpayerId: true,
                taxpayer: {
                    select: {
                        officerId: true,
                        name: true,
                        rif: true,
                    }
                }
            }
        });
    }

    async findEvents(where: any, tx?: TxClient) {
        const client = tx ?? db;
        return client.event.findMany({
            where,
            select: {
                id: true,
                date: true,
                amount: true,
                type: true,
                taxpayerId: true,
                debt: true,
                description: true,
                taxpayer: {
                    select: {
                        officerId: true,
                        name: true,
                        rif: true,
                    }
                }
            }
        });
    }

    /** Filtra en memoria por nombre, RIF, nombre del fiscal o providenceNum (si search es numérico). */
    private filterTaxpayersBySearch(taxpayers: any[], search: string | undefined): any[] {
        if (!search || typeof search !== "string") return taxpayers;
        const s = search.trim().toLowerCase();
        if (!s) return taxpayers;
        const searchNum = s.replace(/\D/g, "");
        return taxpayers.filter((t: any) => {
            const name = (t.name || "").toLowerCase();
            const rif = (t.rif || "").toLowerCase();
            const userName = (t.user?.name || "").toLowerCase();
            if (name.includes(s) || rif.includes(s) || userName.includes(s)) return true;
            if (searchNum && t.providenceNum != null) {
                const prov = String(t.providenceNum);
                if (prov.includes(searchNum)) return true;
            }
            return false;
        });
    }

    async findTaxpayersForEvents(userId: string, userRole: string, page: number = 1, limit: number = 50, search?: string, tx?: TxClient) {
        const client = tx ?? db;
        const skip = (page - 1) * limit;
        const strategy = getRoleStrategy(userRole);
        const visibilityWhere = await strategy.getTaxpayerVisibilityWhere(client, userId);

        const where: any = { status: true, ...visibilityWhere };
        if (search && search.trim()) {
            const searchFilters: any[] = [
                { name: { contains: search } },
                { rif: { contains: search } },
                { user: { name: { contains: search } } },
            ];
            if (!isNaN(Number(search))) {
                searchFilters.push({ providenceNum: BigInt(search) });
            }
            where.AND = [...(where.AND || []), { OR: searchFilters }];
        }

        const [taxpayers, total] = await Promise.all([
            client.taxpayer.findMany({
                skip,
                take: limit,
                where,
                include: {
                    event: { where: { status: true } },
                    IVAReports: true,
                    ISLRReports: true,
                    user: { select: { name: true } },
                },
                orderBy: { created_at: "asc" },
            }),
            client.taxpayer.count({ where }),
        ]);

        return {
            data: taxpayers,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            limit,
        };
    }
    
    async findUserWithTaxpayerStats(userId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                role: true,
                taxpayer: {
                    where: { status: true },
                    select: {
                        id: true,
                        IVAReports: { select: { id: true, paid: true, date: true } },
                        ISLRReports: { select: { id: true, paid: true, emition_date: true } },
                        event: { select: { id: true, amount: true, type: true, date: true } },
                    },
                },
            },
        });
    }

    async findByUser(userId: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayer.findMany({
            where: { officerId: userId, status: true },
            select: {
                id: true,
                name: true,
                rif: true,
                status: true,
                officerId: true,
                process: true,
                address: true,
                emition_date: true,
                contract_type: true,
                providenceNum: true,
                fase: true,
                notified: true,
                culminated: true,
                created_at: true,
                updated_at: true,
                index_iva: true,
                parish_id: true,
                taxpayer_category_id: true,
            },
        });
    }

    /** Contribuyentes del año fiscal en curso asignados al usuario (officerId = userId). */
    async findMyCurrentYearTaxpayers(userId: string, tx?: TxClient) {
        const client = tx ?? db;
        const now = new Date();
        const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
        const endOfYear = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
        return client.taxpayer.findMany({
            where: {
                officerId: userId,
                status: true,
                emition_date: { gte: startOfYear, lt: endOfYear },
            },
            select: {
                id: true,
                name: true,
                rif: true,
                status: true,
                officerId: true,
                process: true,
                address: true,
                emition_date: true,
                contract_type: true,
                providenceNum: true,
                fase: true,
                notified: true,
                culminated: true,
                user: { select: { id: true, name: true } },
                parish: { select: { id: true, name: true } },
                taxpayer_category: { select: { id: true, name: true } },
            },
            orderBy: { emition_date: "desc" },
        });
    }

    /** Contribuyentes del año fiscal en curso del equipo (según rol, vía estrategia). */
    async findTeamCurrentYearTaxpayers(userId: string, userRole: string, tx?: TxClient) {
        const client = tx ?? db;
        const now = new Date();
        const startOfYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
        const endOfYear = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1, 0, 0, 0, 0));
        const strategy = getRoleStrategy(userRole);
        const visibilityWhere = await strategy.getTaxpayerVisibilityWhere(client, userId);

        return client.taxpayer.findMany({
            where: {
                status: true,
                emition_date: { gte: startOfYear, lt: endOfYear },
                ...visibilityWhere,
            },
            select: {
                id: true,
                name: true,
                rif: true,
                status: true,
                officerId: true,
                process: true,
                address: true,
                emition_date: true,
                contract_type: true,
                providenceNum: true,
                fase: true,
                notified: true,
                culminated: true,
                user: { select: { id: true, name: true } },
                parish: { select: { id: true, name: true } },
                taxpayer_category: { select: { id: true, name: true } },
            },
            orderBy: { emition_date: "desc" },
        });
    }

    async findAll(page: number = 1, limit: number = 50, year?: number, search?: string, tx?: TxClient) {
        const client = tx ?? db;
        const skip = (page - 1) * limit;
        
        const where: any = { status: true };

        if (year) {
            const startDate = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
            const endDate = new Date(Date.UTC(year + 1, 0, 1, 0, 0, 0, 0));
            
            where.emition_date = {
                gte: startDate,
                lt: endDate
            };
        }

        if (search) {
            const searchFilters: any[] = [
                { name: { contains: search } },
                { rif: { contains: search } },
                { user: { name: { contains: search } } }
            ];

            // Si es un número, intentar buscar por número de providencia
            if (!isNaN(Number(search))) {
                searchFilters.push({ providenceNum: BigInt(search) });
            }

            where.AND = [
                ...(where.AND || []), // Mantener otros AND si existieran
                { OR: searchFilters }
            ];
        }

        const [taxpayers, total] = await Promise.all([
            client.taxpayer.findMany({
                skip,
                take: limit,
                where: where,
                select: {
                    id: true,
                    name: true,
                    rif: true,
                    address: true,
                    process: true,
                    providenceNum: true,
                    contract_type: true,
                    emition_date: true,
                    taxpayer_category: true,
                    parish: true,
                    user: {
                        select: {
                            id: true,
                            name: true,
                        }
                    }
                },
                orderBy: { created_at: 'asc' },
            }),
            client.taxpayer.count({ where: where })
        ]);
        
        return {
            data: taxpayers,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            limit
        };
    }

    async findById(taxpayerId: string, tx?: TxClient): Promise<Taxpayer | null> {
        const client = tx ?? db;
        const taxpayer = await client.taxpayer.findUnique({
            where: { id: taxpayerId },
            select: {
                id: true,
                providenceNum: true,
                address: true,
                process: true,
                name: true,
                rif: true,
                emition_date: true,
                contract_type: true,
                status: true,
                fase: true,
                notified: true,
                culminated: true,
                officerId: true,
                created_at: true,
                updated_at: true,
                index_iva: true,
                parish_id: true,
                taxpayer_category_id: true,
            },
        });

        if (!taxpayer || !taxpayer.status) {
            return null;
        }

        return taxpayer as Taxpayer;
    }

    // ─── ITaxpayerRepository ─────────────────────────────────────────────────────

    async findByRif(rif: string, tx?: TxClient): Promise<Taxpayer | null> {
        const client = tx ?? db;
        const taxpayer = await client.taxpayer.findFirst({
            where: { rif, status: true },
            select: {
                id: true,
                providenceNum: true,
                address: true,
                process: true,
                name: true,
                rif: true,
                emition_date: true,
                contract_type: true,
                status: true,
                fase: true,
                notified: true,
                culminated: true,
                officerId: true,
                created_at: true,
                updated_at: true,
                index_iva: true,
                parish_id: true,
                taxpayer_category_id: true,
            },
        });
        return taxpayer ? (taxpayer as Taxpayer) : null;
    }

    async getAll(
        page: number = 1,
        limit: number = 50,
        year?: number,
        search?: string,
        tx?: TxClient
    ): Promise<TaxpayersPaginated> {
        const result = await this.findAll(page, limit, year, search, tx);
        return result as unknown as TaxpayersPaginated;
    }

    async create(data: CreateTaxpayerData, tx?: TxClient): Promise<Taxpayer> {
        const created = await this.createTaxpayer(data as any, tx);
        return created as unknown as Taxpayer;
    }

    async update(id: string, data: Partial<UpdateTaxpayerData>, tx?: TxClient): Promise<Taxpayer> {
        const client = tx ?? db;
        const updated = await client.taxpayer.update({
            where: { id },
            data: data as any,
        });
        return updated as unknown as Taxpayer;
    }
}

// Export a singleton instance
export const taxpayerRepository = new TaxpayerRepository();
