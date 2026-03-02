import { injectable, inject } from "tsyringe";
import * as taxpayerServices from "./services"; // Importa el barrel con feature flags
import type { ITaxpayerRepository } from "./interfaces/ITaxpayerRepository";
import { TAXPAYER_REPOSITORY_TOKEN } from "./interfaces/ITaxpayerRepository";
import { CreateTaxpayerDto, UpdateTaxpayerDto } from "./dto/taxpayer-dto";
import type {
    NewEvent,
    NewFase,
    NewIvaReport,
    NewIslrReport,
    NewObservation,
    NewPayment,
    NewTaxpayerExcelInput,
    CreateIndexIva,
} from "./taxpayer-utils";
import type { IVAReports, ISLRReports } from "@prisma/client";
import type { Decimal } from "@prisma/client/runtime/library";

/**
 * Servicio de contribuyentes expuesto para inyección de dependencias.
 * Delega en los servicios modulares con feature flags para control de rollout.
 */
@injectable()
export class TaxpayerService {
    constructor(
        @inject(TAXPAYER_REPOSITORY_TOKEN) private readonly taxpayerRepository: ITaxpayerRepository
    ) {}

    async getTaxpayersForEvents(userId: string, userRole: string, page?: number, limit?: number, search?: string) {
        return taxpayerServices.getTaxpayersForEvents(userId, userRole, page, limit, search);
    }

    async getFiscalTaxpayersForStats(userId: string) {
        return taxpayerServices.getFiscalTaxpayersForStats(userId);
    }

    async getTaxpayers(page?: number, limit?: number, year?: number, search?: string) {
        return taxpayerServices.getTaxpayers(page, limit, year, search);
    }

    async getMyCurrentYearTaxpayers(userId: string) {
        return taxpayerServices.getMyCurrentYearTaxpayers(userId);
    }

    async getTeamCurrentYearTaxpayers(userId: string, userRole: string) {
        return taxpayerServices.getTeamCurrentYearTaxpayers(userId, userRole);
    }

    async generateDownloadRepairUrl(key: string) {
        return taxpayerServices.generateDownloadRepairUrl(key);
    }

    async generateDownloadInvestigationPdfUrl(key: string) {
        return taxpayerServices.generateDownloadInvestigationPdfUrl(key);
    }

    async createTaxpayer(input: CreateTaxpayerDto) {
        // ✅ Validar duplicado de RIF antes de delegar al servicio de dominio.
        // Nota: actualmente la tabla `taxpayer` no tiene `tenantId`, por lo que la validación
        // se hace a nivel global de SAC. Cuando exista `tenantId`, este chequeo debe
        // filtrarse también por ese campo.
        const existing = await this.taxpayerRepository.findByRif(input.rif);
        if (existing) {
            throw new Error(`Ya existe un contribuyente activo con el RIF ${input.rif}.`);
        }

        return taxpayerServices.createTaxpayer(input);
    }

    async uploadRepairReport(taxpayerId: string, pdf_url: string) {
        return taxpayerServices.uploadRepairReport(taxpayerId, pdf_url);
    }

    async updateRepairReportPdfUrl(repairReportId: string, pdf_url: string) {
        return taxpayerServices.updateRepairReportPdfUrl(repairReportId, pdf_url);
    }

    async deleteRepairReportById(repairReportId: string) {
        return taxpayerServices.deleteRepairReportById(repairReportId);
    }

    async getTaxpayerCategories() {
        return taxpayerServices.getTaxpayerCategories();
    }

    async getParishList() {
        return taxpayerServices.getParishList();
    }

    async createTaxpayerExcel(body: NewTaxpayerExcelInput) {
        return taxpayerServices.createTaxpayerExcel(body);
    }

    async getTaxpayerById(id: string) {
        return taxpayerServices.getTaxpayerById(id);
    }

    async getTaxpayersByUser(id: string) {
        return taxpayerServices.getTaxpayersByUser(id);
    }

    async updateTaxpayer(
        id: string,
        data: UpdateTaxpayerDto,
        userId: string,
        userRole: string
    ) {
        return taxpayerServices.updateTaxpayer(id, data, userId, userRole);
    }

    async updateObservation(id: string, newDescription: string) {
        return taxpayerServices.updateObservation(id, newDescription);
    }

    async updateFase(data: NewFase) {
        return taxpayerServices.updateFase(data);
    }

    async notifyTaxpayer(id: string) {
        return taxpayerServices.notifyTaxpayer(id);
    }

    async updatePayment(id: string, status: string) {
        return taxpayerServices.updatePayment(id, status);
    }

    async deleteTaxpayerById(id: string) {
        return taxpayerServices.deleteTaxpayerById(id);
    }

    async deleteObservation(id: string) {
        return taxpayerServices.deleteObservation(id);
    }

    async getEventsbyTaxpayer(taxpayerId?: string, type?: string) {
        return taxpayerServices.getEventsbyTaxpayer(taxpayerId, type);
    }

    async getTaxpayerData(id: string) {
        return taxpayerServices.getTaxpayerData(id);
    }

    async getObservations(id: string) {
        return taxpayerServices.getObservations(id);
    }

    async getIslrReports(id: string) {
        return taxpayerServices.getIslrReports(id);
    }

    async getTaxpayerSummary(id: string) {
        return taxpayerServices.getTaxpayerSummary(id);
    }

    async createEvent(input: NewEvent) {
        return taxpayerServices.createEvent(input);
    }

    async createIndexIva(data: any) {
        return taxpayerServices.createIndexIva(data);
    }

    async modifyIndexIva(newIndexIva: any, taxpayerId: string) {
        return taxpayerServices.modifyIndexIva(newIndexIva, taxpayerId);
    }

    async createIVA(
        data: any,
        userId?: string,
        userRole?: string
    ) {
        return taxpayerServices.createIVA(data, userId, userRole);
    }

    async createISLR(
        input: any,
        userId?: string,
        userRole?: string
    ) {
        return taxpayerServices.createISLR(input, userId, userRole);
    }

    async createPayment(input: Parameters<typeof taxpayerServices.createPayment>[0]) {
        return taxpayerServices.createPayment(input);
    }

    async createObservation(input: NewObservation) {
        return taxpayerServices.createObservation(input);
    }

    async updateEvent(eventId: string, input: Partial<NewEvent>) {
        return taxpayerServices.updateEvent(eventId, input);
    }

    async updateIvaReport(
        ivaId: string,
        input: any,
        userId?: string,
        userRole?: string
    ) {
        return taxpayerServices.updateIvaReport(ivaId, input, userId, userRole);
    }

    async updateCulminated(
        id: string,
        culminated: boolean,
        userId: string,
        userRole: string
    ) {
        return taxpayerServices.updateCulminated(id, culminated, userId, userRole);
    }

    async updateIslr(
        id: string,
        input: any,
        userId: string,
        userRole: string
    ) {
        return taxpayerServices.updateIslr(id, input, userId, userRole);
    }

    async deleteEvent(id: string) {
        return taxpayerServices.deleteEvent(id);
    }

    async deletePayment(id: string) {
        return taxpayerServices.deletePayment(id);
    }

    async deleteIva(id: string) {
        return taxpayerServices.deleteIva(id);
    }

    async deleteIslr(id: string) {
        return taxpayerServices.deleteIslr(id);
    }

    async CreateTaxpayerCategory(name: string) {
        return taxpayerServices.CreateTaxpayerCategory(name);
    }
}
