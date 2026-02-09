import { Taxpayer_Fases } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { db } from "../../utils/db.server";
import { Taxpayer } from "../taxpayer.utils";

export class TaxpayerRepository {

    async findManyUsers() {
        return db.user.findMany();
    }

    /** Usado para emails: obtiene usuario (oficial) con grupo y coordinador. */
    async findUserByIdWithGroupCoordinator(userId: string) {
        return db.user.findUnique({
            where: { id: userId },
            include: {
                group: {
                    include: {
                        coordinator: { select: { email: true } },
                    },
                },
            },
        });
    }

    /** Obtiene solo el nombre de un usuario por ID. */
    async findUserNameById(userId: string): Promise<string | null> {
        const user = await db.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });
        return user?.name ?? null;
    }

    /** Obtiene todos los usuarios con rol ADMIN (para notificaciones). */
    async findAdmins() {
        return db.user.findMany({
            where: { role: "ADMIN" },
        });
    }

    /** Obtiene admins solo con email (para listas de destinatarios). */
    async findAdminEmails() {
        return db.user.findMany({
            where: { role: "ADMIN" },
            select: { email: true },
        });
    }

    /** Obtiene contribuyente con user, group y coordinator para emails/notificaciones. */
    async findTaxpayerWithUserAndCoordinator(taxpayerId: string) {
        return db.taxpayer.findUnique({
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
    async updateTaxpayerFase(taxpayerId: string, fase: Taxpayer_Fases) {
        return db.taxpayer.update({
            where: { id: taxpayerId },
            data: { fase },
        });
    }

    async findExistingByProvidence(providenceNum: bigint, startOfYear: Date, endOfYear: Date) {
        return db.taxpayer.findMany({
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

    async findCandidatesByName(firstWord: string) {
        return db.taxpayer.findMany({
            where: {
                name: { contains: firstWord },
            },
            select: {
                name: true,
                emition_date: true,
            },
        });
    }

    async createTaxpayer(data: any) { // Consider DTO
        return db.taxpayer.create({
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
    }) {
        return db.taxpayer.create({
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

    async createInvestigationPdfs(pdfs: { pdf_url: string, taxpayerId: string }[]) {
        return db.investigationPdf.createMany({
            data: pdfs
        });
    }

    async findTaxpayersByNameOrProvidenceNum(providenceNum: bigint, firstWord: string) {
        return db.taxpayer.findMany({
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
    
    async findIndexIvaExpired() {
        return db.indexIva.findMany({
            where: {
                expires_at: null,
            },
        });
    }

    async expireIndexIva() {
        return db.indexIva.updateMany({
            where: {
                expires_at: null,
            },
            data: {
                expires_at: new Date(),
            },
        });
    }

    async createIndexIvaRecord(contract_type: "SPECIAL" | "ORDINARY", base_amount: Decimal) {
        return db.indexIva.create({
            data: {
                contract_type,
                base_amount,
            },
        });
    }

    async updateTaxpayerIndexIva(where: any, data: any) {
        return db.taxpayer.updateMany({
            where,
            data,
        });
    }

    async updateIndexIva(taxpayerId: string, newIndexIva: Decimal) {
        return db.taxpayer.update({
            where: {
                id: taxpayerId,
            },
            data: {
                index_iva: newIndexIva,
            }
        });
    }

    async createPayment(input: any) { // Consider using a DTO for input here
        return db.payment.create({
            data: input,
            include: {
                event: true
            }
        });
    }

    async updateEventDebt(eventId: string, amount: Decimal) {
        return db.event.update({
            where: { id: eventId },
            data: { debt: { decrement: amount } }
        });
    }

    async findEventById(eventId: string) {
        return db.event.findUnique({
            where: { id: eventId },
        });
    }

    async createEvent(input: any) { // Consider using a DTO for input here
        return db.event.create({
            data: {
                ...input,
            }
        });
    }

    async createRepairReport(taxpayerId: string, pdf_url: string) {
        return db.repairReport.create({
            data: {
                taxpayerId,
                pdf_url,
            },
        });
    }

    async createObservation(input: { taxpayerId: string, description: string, date: Date }) {
        return db.observations.create({
            data: {
                taxpayerId: input.taxpayerId,
                description: input.description,
                date: input.date,
            }
        });
    }

    async deleteRepairReportById(id: string) {
        return db.repairReport.delete({
            where: { id },
        });
    }

    async deleteObservationById(id: string) {
        return db.observations.delete({
            where: {
                id: id,
            }
        });
    }

    async deletePaymentById(eventId: string) {
        return db.payment.update({
            where: {
                id: eventId
            },
            include: {
                event: true
            },
            data: {
                status: false
            }
        });
    }

    async deleteIslrById(id: string) {
        return db.iSLRReports.delete({
            where: { id: id }
        });
    }

    async deleteIvaById(id: string) {
        return db.iVAReports.delete({
            where: { id: id },
        });
    }

    async deleteEventById(eventId: string) {
        return db.event.delete({
            where: {
                id: eventId
            },
        });
    }

    async deleteById(taxpayerId: string) {
        return db.taxpayer.delete({
            where: {
                id: taxpayerId
            },
        });
    }

    async findIslrReportsByTaxpayer(taxpayerId: string) {
        return db.iSLRReports.findMany({
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

    async findIvaReportsByTaxpayer(taxpayerId: string) {
        return db.iVAReports.findMany({
            where: {
                taxpayerId: taxpayerId,
            }
        });
    }

    async findObservationsByTaxpayer(taxpayerId: string) {
        return db.observations.findMany({
            where: {
                taxpayerId: taxpayerId,
            }
        });
    }

    async getTaxpayerData(id: string) {
        return db.taxpayer.findUnique({
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

    async findPendingPayments(where: any) {
        return db.event.findMany({
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

    async findPayments(where: any) {
        return db.payment.findMany({
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

    async findEvents(where: any) {
        return db.event.findMany({
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

    async findTaxpayersForEvents(userId: string, userRole: string) {
        let taxpayers: any[] = [];

        if (userRole === "ADMIN") {
            taxpayers = await db.taxpayer.findMany({
                include: {
                    event: true,
                    IVAReports: true,
                    ISLRReports: true,
                    user: {
                        select: {
                            name: true,
                        },
                    },
                }
            });
        } else if (userRole === "COORDINATOR") {
            const group = await db.fiscalGroup.findUnique({
                where: {
                    coordinatorId: userId
                },

                include: {
                    members: {
                        include: {
                            taxpayer: {
                                include: {
                                    event: true,
                                    IVAReports: true,
                                    ISLRReports: true,
                                    user: {
                                        select: {
                                            name: true,
                                        },
                                    },
                                }
                            },
                        },
                    },
                },
            })
            if (!group) throw new Error("Grupo no encontrado para el coordinador");

            // Aplanamos los taxpayers de todos los miembros
            taxpayers = group.members.flatMap((member) => member.taxpayer);
        } else if (userRole === "SUPERVISOR") {
            const user = await db.user.findUnique({
                where: {
                    id: userId,
                },
                include: {
                    taxpayer: { // 👈 Taxpayers assigned directly to the supervisor
                        include: {
                            event: true,
                            IVAReports: true,
                            ISLRReports: true,
                            user: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                    supervised_members: {  // 👈 Taxpayers assigned to supervised members
                        include: {
                            taxpayer: {
                                include: {
                                    event: true,
                                    IVAReports: true,
                                    ISLRReports: true,
                                    user: {
                                        select: {
                                            name: true,
                                        },
                                    },
                                }
                            },
                        },
                    },
                },
            });

            if (!user) throw new Error("Usuario no encontrado.");

            // Combine supervised members' taxpayers and supervisor's own taxpayers
            const supervisedTaxpayers = user.supervised_members.flatMap((member) => member.taxpayer);
            taxpayers = [...user.taxpayer, ...supervisedTaxpayers];
        } else if (userRole === "FISCAL") {
            const fiscal = await db.user.findUnique({
                where: {
                    id: userId,
                },
                include: {
                    taxpayer: {
                        include: {
                            event: true,
                            IVAReports: true,
                            ISLRReports: true,
                            user: {
                                select: {
                                    name: true,
                                },
                            },
                        },
                    },
                }
            });
            if (!fiscal) throw new Error("Usuario no encontrado.");

            taxpayers = fiscal?.taxpayer;
        }

        return taxpayers;
    }
    
    async findUserWithTaxpayerStats(userId: string) {
        return db.user.findUnique({
            where: { id: userId },
            include: {
                taxpayer: {
                    include: {
                        IVAReports: true,
                        ISLRReports: true,
                        event: true,
                    },
                },
            },
        });
    }

    async findByUser(userId: string) {
        return db.taxpayer.findMany({
            where: {
                officerId: userId,
                status: true
            }
        });
    }

    async findAll() {
        return db.taxpayer.findMany({
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
            }
        });
    }

    async findById(taxpayerId: string): Promise<Taxpayer | null> {
        const taxpayer = await db.taxpayer.findUnique({
            where: { id: taxpayerId }
        });

        if (!taxpayer || !taxpayer.status) {
            return null;
        }

        return taxpayer;
    }
}

// Export a singleton instance
export const taxpayerRepository = new TaxpayerRepository();
