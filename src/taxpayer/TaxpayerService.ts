import { injectable, inject } from "tsyringe";
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

// ---------------------------------------------------------------------------
// Sprint 2 - Core Taxpayer
// ---------------------------------------------------------------------------
import { TaxpayerCrudService } from "./services/taxpayer-crud.service";
import {
    getTaxpayerCategories,
    getParishList,
    getEventsbyTaxpayer,
    getTaxpayerData as getTaxpayerDataLegacy,
    getTaxpayerSummary,
    updateFase,
    updateCulminated,
    CreateTaxpayerCategory as CreateTaxpayerCategoryLegacy,
    createIVA,
} from "./services/legacy-taxpayer.service";

// ---------------------------------------------------------------------------
// Sprint 3 - Sub-entidades
// ---------------------------------------------------------------------------
import { EventService } from "./services/event.service";
import { PaymentService } from "./services/payment.service";
import { ObservationService } from "./services/observation.service";
import { PdfService } from "./services/pdf.service";

// ---------------------------------------------------------------------------
// Reportes / Otros
// ---------------------------------------------------------------------------
import { IvaReportService } from "./services/iva-report.service";
import { IslrReportService } from "./services/islr-report.service";
import { IndexIvaService } from "./services/index-iva.service";
import { NotificationService } from "./services/notification.service";

/**
 * Servicio de contribuyentes expuesto para inyección de dependencias.
 * Delega en los servicios modulares (imports específicos por dominio).
 */
@injectable()
export class TaxpayerService {
    constructor(
        @inject(TAXPAYER_REPOSITORY_TOKEN) private readonly taxpayerRepository: ITaxpayerRepository
    ) {}

    async getTaxpayersForEvents(userId: string, userRole: string, page?: number, limit?: number, search?: string) {
        return TaxpayerCrudService.getForEvents(userId, userRole, page, limit, search);
    }

    async getFiscalTaxpayersForStats(userId: string) {
        return TaxpayerCrudService.getForStats(userId);
    }

    async getTaxpayers(page?: number, limit?: number, year?: number, search?: string) {
        return TaxpayerCrudService.getAll(page, limit, year, search);
    }

    async getMyCurrentYearTaxpayers(userId: string) {
        return TaxpayerCrudService.getMyCurrentYearTaxpayers(userId);
    }

    async getTeamCurrentYearTaxpayers(userId: string, userRole: string) {
        return TaxpayerCrudService.getTeamCurrentYearTaxpayers(userId, userRole);
    }

    async generateDownloadRepairUrl(key: string) {
        return PdfService.generateDownloadRepairUrl(key);
    }

    async generateDownloadInvestigationPdfUrl(key: string) {
        return PdfService.generateDownloadInvestigationPdfUrl(key);
    }

    async createTaxpayer(input: CreateTaxpayerDto) {
        const existing = await this.taxpayerRepository.findByRif(input.rif);
        if (existing) {
            throw new Error(`Ya existe un contribuyente activo con el RIF ${input.rif}.`);
        }
        return TaxpayerCrudService.create(input);
    }

    async uploadRepairReport(taxpayerId: string, pdf_url: string) {
        return PdfService.uploadRepairReport(taxpayerId, pdf_url);
    }

    async updateRepairReportPdfUrl(repairReportId: string, pdf_url: string) {
        return PdfService.updateRepairReportPdfUrl(repairReportId, pdf_url);
    }

    async deleteRepairReportById(repairReportId: string) {
        return PdfService.deleteRepairReportById(repairReportId);
    }

    async getTaxpayerCategories() {
        return getTaxpayerCategories();
    }

    async getParishList() {
        return getParishList();
    }

    async createTaxpayerExcel(body: NewTaxpayerExcelInput) {
        return TaxpayerCrudService.createTaxpayerExcel(body);
    }

    async getTaxpayerById(id: string) {
        return TaxpayerCrudService.getById(id);
    }

    async getTaxpayersByUser(id: string) {
        return TaxpayerCrudService.getByUserId(id);
    }

    async updateTaxpayer(
        id: string,
        data: UpdateTaxpayerDto,
        userId: string,
        userRole: string
    ) {
        return TaxpayerCrudService.update(id, data, userId, userRole);
    }

    async updateObservation(id: string, newDescription: string) {
        return ObservationService.update(id, newDescription);
    }

    async updateFase(data: NewFase) {
        return updateFase(data);
    }

    async notifyTaxpayer(id: string) {
        return NotificationService.notifyTaxpayer(id);
    }

    async updatePayment(id: string, status: string) {
        return PaymentService.update(id, status);
    }

    async deleteTaxpayerById(id: string) {
        return TaxpayerCrudService.delete(id);
    }

    async deleteObservation(id: string) {
        return ObservationService.delete(id);
    }

    async getEventsbyTaxpayer(taxpayerId?: string, type?: string) {
        return getEventsbyTaxpayer(taxpayerId, type);
    }

    async getTaxpayerData(id: string) {
        return getTaxpayerDataLegacy(id);
    }

    async getObservations(id: string) {
        return ObservationService.getByTaxpayer(id);
    }

    async getIslrReports(id: string) {
        return IslrReportService.getByTaxpayer(id);
    }

    async getTaxpayerSummary(id: string) {
        return getTaxpayerSummary(id);
    }

    async createEvent(input: NewEvent) {
        return EventService.create(input);
    }

    async createIndexIva(data: any) {
        return IndexIvaService.create(data);
    }

    async modifyIndexIva(newIndexIva: any, taxpayerId: string) {
        return IndexIvaService.modify(newIndexIva, taxpayerId);
    }

    async createIVA(
        data: any,
        userId?: string,
        userRole?: string
    ) {
        return createIVA(data, userId, userRole);
    }

    async createISLR(
        input: any,
        userId?: string,
        userRole?: string
    ) {
        return IslrReportService.create(input, userId, userRole);
    }

    async createPayment(input: Parameters<typeof PaymentService.create>[0]) {
        return PaymentService.create(input);
    }

    async createObservation(input: NewObservation) {
        return ObservationService.create(input);
    }

    async updateEvent(eventId: string, input: Partial<NewEvent>) {
        return EventService.update(eventId, input);
    }

    async updateIvaReport(
        ivaId: string,
        input: any,
        userId?: string,
        userRole?: string
    ) {
        return IvaReportService.update(ivaId, input, userId, userRole);
    }

    async updateCulminated(
        id: string,
        culminated: boolean,
        userId: string,
        userRole: string
    ) {
        return updateCulminated(id, culminated, userId, userRole);
    }

    async updateIslr(
        id: string,
        input: any,
        userId: string,
        userRole: string
    ) {
        return IslrReportService.update(id, input, userId, userRole);
    }

    async deleteEvent(id: string) {
        return EventService.delete(id);
    }

    async deletePayment(id: string) {
        return PaymentService.delete(id);
    }

    async deleteIva(id: string) {
        return IvaReportService.delete(id);
    }

    async deleteIslr(id: string) {
        return IslrReportService.delete(id);
    }

    async CreateTaxpayerCategory(name: string) {
        return CreateTaxpayerCategoryLegacy(name);
    }
}
