import { injectable, inject } from "tsyringe";
import * as taxpayerServiceImpl from "./taxpayer-services";
import type { ITaxpayerRepository } from "./interfaces/ITaxpayerRepository";
import { TAXPAYER_REPOSITORY_TOKEN } from "./interfaces/ITaxpayerRepository";

/**
 * Servicio de contribuyentes expuesto para inyección de dependencias.
 * Depende de ITaxpayerRepository para facilitar pruebas unitarias con mocks.
 */
@injectable()
export class TaxpayerService {
    constructor(
        @inject(TAXPAYER_REPOSITORY_TOKEN) private readonly taxpayerRepository: ITaxpayerRepository
    ) {}

    async getTaxpayersForEvents(userId: string, userRole: string, page?: number, limit?: number, search?: string) {
        return taxpayerServiceImpl.getTaxpayersForEvents(userId, userRole, page, limit, search);
    }

    async getFiscalTaxpayersForStats(userId: string) {
        return taxpayerServiceImpl.getFiscalTaxpayersForStats(userId);
    }

    async getTaxpayers(page?: number, limit?: number, year?: number, search?: string) {
        return taxpayerServiceImpl.getTaxpayers(page, limit, year, search, this.taxpayerRepository);
    }

    async getMyCurrentYearTaxpayers(userId: string) {
        return taxpayerServiceImpl.getMyCurrentYearTaxpayers(userId);
    }

    async getTeamCurrentYearTaxpayers(userId: string, userRole: string) {
        return taxpayerServiceImpl.getTeamCurrentYearTaxpayers(userId, userRole);
    }

    async generateDownloadRepairUrl(key: string) {
        return taxpayerServiceImpl.generateDownloadRepairUrl(key);
    }

    async generateDownloadInvestigationPdfUrl(key: string) {
        return taxpayerServiceImpl.generateDownloadInvestigationPdfUrl(key);
    }

    async createTaxpayer(input: Parameters<typeof taxpayerServiceImpl.createTaxpayer>[0]) {
        return taxpayerServiceImpl.createTaxpayer(input);
    }

    async uploadRepairReport(taxpayerId: string, pdf_url: string) {
        return taxpayerServiceImpl.uploadRepairReport(taxpayerId, pdf_url);
    }

    async updateRepairReportPdfUrl(repairReportId: string, pdf_url: string) {
        return taxpayerServiceImpl.updateRepairReportPdfUrl(repairReportId, pdf_url);
    }

    async deleteRepairReportById(repairReportId: string) {
        return taxpayerServiceImpl.deleteRepairReportById(repairReportId);
    }

    async getTaxpayerCategories() {
        return taxpayerServiceImpl.getTaxpayerCategories();
    }

    async getParishList() {
        return taxpayerServiceImpl.getParishList();
    }

    async createTaxpayerExcel(body: Parameters<typeof taxpayerServiceImpl.createTaxpayerExcel>[0]) {
        return taxpayerServiceImpl.createTaxpayerExcel(body);
    }

    async getTaxpayerById(id: string) {
        return taxpayerServiceImpl.getTaxpayerById(id);
    }

    async getTaxpayersByUser(id: string) {
        return taxpayerServiceImpl.getTaxpayersByUser(id);
    }

    async updateTaxpayer(
        id: string,
        data: Parameters<typeof taxpayerServiceImpl.updateTaxpayer>[1],
        userId: string,
        userRole: string
    ) {
        return taxpayerServiceImpl.updateTaxpayer(id, data, userId, userRole);
    }

    async updateObservation(id: string, newDescription: string) {
        return taxpayerServiceImpl.updateObservation(id, newDescription);
    }

    async updateFase(data: Parameters<typeof taxpayerServiceImpl.updateFase>[0]) {
        return taxpayerServiceImpl.updateFase(data);
    }

    async notifyTaxpayer(id: string) {
        return taxpayerServiceImpl.notifyTaxpayer(id);
    }

    async updatePayment(id: string, status: string) {
        return taxpayerServiceImpl.updatePayment(id, status);
    }

    async deleteTaxpayerById(id: string) {
        return taxpayerServiceImpl.deleteTaxpayerById(id);
    }

    async deleteObservation(id: string) {
        return taxpayerServiceImpl.deleteObservation(id);
    }

    async getEventsbyTaxpayer(taxpayerId?: string, type?: string) {
        return taxpayerServiceImpl.getEventsbyTaxpayer(taxpayerId, type);
    }

    async getTaxpayerData(id: string) {
        return taxpayerServiceImpl.getTaxpayerData(id);
    }

    async getObservations(id: string) {
        return taxpayerServiceImpl.getObservations(id);
    }

    async getIslrReports(id: string) {
        return taxpayerServiceImpl.getIslrReports(id);
    }

    async getTaxpayerSummary(id: string) {
        return taxpayerServiceImpl.getTaxpayerSummary(id);
    }

    async createEvent(input: Parameters<typeof taxpayerServiceImpl.createEvent>[0]) {
        return taxpayerServiceImpl.createEvent(input);
    }

    async createIndexIva(data: Parameters<typeof taxpayerServiceImpl.createIndexIva>[0]) {
        return taxpayerServiceImpl.createIndexIva(data);
    }

    async modifyIndexIva(newIndexIva: Parameters<typeof taxpayerServiceImpl.modifyIndexIva>[0], taxpayerId: string) {
        return taxpayerServiceImpl.modifyIndexIva(newIndexIva, taxpayerId);
    }

    async createIVA(
        data: Parameters<typeof taxpayerServiceImpl.createIVA>[0],
        userId?: string,
        userRole?: string
    ) {
        return taxpayerServiceImpl.createIVA(data, userId, userRole);
    }

    async createISLR(
        input: Parameters<typeof taxpayerServiceImpl.createISLR>[0],
        userId?: string,
        userRole?: string
    ) {
        return taxpayerServiceImpl.createISLR(input, userId, userRole);
    }

    async createPayment(input: Parameters<typeof taxpayerServiceImpl.createPayment>[0]) {
        return taxpayerServiceImpl.createPayment(input);
    }

    async createObservation(input: Parameters<typeof taxpayerServiceImpl.createObservation>[0]) {
        return taxpayerServiceImpl.createObservation(input);
    }

    async updateEvent(eventId: string, input: Parameters<typeof taxpayerServiceImpl.updateEvent>[1]) {
        return taxpayerServiceImpl.updateEvent(eventId, input);
    }

    async updateIvaReport(
        ivaId: string,
        input: Parameters<typeof taxpayerServiceImpl.updateIvaReport>[1],
        userId?: string,
        userRole?: string
    ) {
        return taxpayerServiceImpl.updateIvaReport(ivaId, input, userId, userRole);
    }

    async updateCulminated(
        id: string,
        culminated: boolean,
        userId: string,
        userRole: string
    ) {
        return taxpayerServiceImpl.updateCulminated(id, culminated, userId, userRole);
    }

    async updateIslr(
        id: string,
        input: Parameters<typeof taxpayerServiceImpl.updateIslr>[1],
        userId: string,
        userRole: string
    ) {
        return taxpayerServiceImpl.updateIslr(id, input, userId, userRole);
    }

    async deleteEvent(id: string) {
        return taxpayerServiceImpl.deleteEvent(id);
    }

    async deletePayment(id: string) {
        return taxpayerServiceImpl.deletePayment(id);
    }

    async deleteIva(id: string) {
        return taxpayerServiceImpl.deleteIva(id);
    }

    async deleteIslr(id: string) {
        return taxpayerServiceImpl.deleteIslr(id);
    }

    async CreateTaxpayerCategory(name: string) {
        return taxpayerServiceImpl.CreateTaxpayerCategory(name);
    }
}
