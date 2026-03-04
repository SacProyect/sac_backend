import type { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { validationResult } from "express-validator";
import fs from "fs";
import { Decimal } from "@prisma/client/runtime/library";
import { AuthRequest } from "../users/user-utils";
import { ApiError } from "../utils/api-response";
import logger from "../utils/logger";
import { EventType } from "./taxpayer-utils";
import { db } from "../utils/db-server";
import { getRoleStrategy } from "../users/role-strategies";
import { storageService } from "../services/StorageService";
import { TaxpayerService } from "./TaxpayerService";
import type { CreateTaxpayerDto, UpdateTaxpayerDto, TaxpayerResponseDto } from "./dto/taxpayer-dto";
import * as ReportService from "../reports/reports-services";

@injectable()
export class TaxpayerController {
    constructor(
        @inject(TaxpayerService) private taxpayerService: TaxpayerService
    ) {}

    async getTaxpayersForEvents(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        const userId = user.id;
        const userRole = user.role;
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const search = (req.query.search as string) || "";
        try {
            const result = await this.taxpayerService.getTaxpayersForEvents(userId, userRole, page, limit, search);
            return res.status(200).json(result);
        } catch (error: any) {
            logger.error("get-taxpayers-for-events", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async getFiscalTaxpayersForStats(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        const userId = req.params.id;
        try {
            const taxpayer = await this.taxpayerService.getFiscalTaxpayersForStats(userId);
            return res.status(200).json(taxpayer);
        } catch (error: any) {
            logger.error("get-fiscal-taxpayers-for-stats", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async getTaxpayers(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 50;
        const year = req.query.year ? parseInt(req.query.year as string) : undefined;
        const search = req.query.search as string | undefined;
        try {
            const result = await this.taxpayerService.getTaxpayers(page, limit, year, search);
            return res.status(200).json(result);
        } catch (error: any) {
            logger.error("get-taxpayers", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async myCurrentYearTaxpayers(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const data = await this.taxpayerService.getMyCurrentYearTaxpayers(user.id);
            return res.status(200).json(data);
        } catch (error: any) {
            logger.error("my-current-year-taxpayers", { message: error?.message });
            return res.status(500).json({ error: "Error al obtener contribuyentes del año en curso." });
        }
    }

    async teamCurrentYearTaxpayers(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const data = await this.taxpayerService.getTeamCurrentYearTaxpayers(user.id, user.role);
            return res.status(200).json(data);
        } catch (error: any) {
            logger.error("team-current-year-taxpayers", { message: error?.message });
            return res.status(500).json({ error: "Error al obtener contribuyentes del equipo para el año en curso." });
        }
    }

    async downloadRepairReport(req: Request, res: Response): Promise<Response> {
        try {
            const key: string = decodeURIComponent(req.params.key);
            const presignedUrl = await this.taxpayerService.generateDownloadRepairUrl(key);
            return res.status(201).json(presignedUrl);
        } catch (e: any) {
            logger.error("download-repair-report error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo generar la URL del acta de reparo");
        }
    }

    async downloadInvestigation(req: Request, res: Response): Promise<Response> {
        try {
            const key = decodeURIComponent(req.query.key as string);
            const presignedUrl = await this.taxpayerService.generateDownloadInvestigationPdfUrl(key);
            return res.status(200).json(presignedUrl);
        } catch (e: any) {
            logger.error("download-investigation error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al generar URL de investigación");
        }
    }

    async createTaxpayer(req: Request, res: Response): Promise<Response> {
        try {
            const { user } = req as AuthRequest;
            if (!user) return res.status(401).json({ message: "Unauthorized access" });
            if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") {
                return res.status(403).json({ message: "Forbidden" });
            }
            const userId = user?.id;
            const role = user?.role;
            const s3Files: { pdf_url: string }[] = [];
            for (const file of (req.files as Express.Multer.File[]) || []) {
                const fileStream = await fs.promises.readFile(file.path);
                const s3Key = `pdfs/${Date.now()}-${file.originalname}`;
                await storageService.upload({
                    key: s3Key,
                    body: fileStream,
                    contentType: file.mimetype,
                });
                s3Files.push({ pdf_url: storageService.getPublicUrl(s3Key) });
                await fs.promises.unlink(file.path);
            }
            const { providenceNum, process, name, rif, contract_type, officerId, address, emition_date, parish, category } = req.body;
            if (!parish || !category) {
                return res.status(400).json({
                    message: "Server error",
                    error: "Parroquia y Actividad Económica son campos obligatorios",
                });
            }
            const dto: CreateTaxpayerDto = {
                providenceNum: BigInt(providenceNum),
                process,
                name,
                rif,
                contract_type,
                officerId,
                emition_date: new Date(emition_date),
                address,
                pdfs: s3Files,
                userId: userId,
                role: role,
                parishId: parish,
                categoryId: category,
            };

            const created = await this.taxpayerService.createTaxpayer(dto);
            if (created instanceof Error) {
                throw created;
            }

            // Devolvemos la vista de detalle unificada para el frontend
            const detail = await this.taxpayerService.getTaxpayerById(created.id);
            return res.status(201).json(detail);
        } catch (error: any) {
            logger.error("create-taxpayer-post error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al crear el contribuyente");
        }
    }

    async uploadRepairReport(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        const taxpayerId = (req.params.id || req.body?.taxpayerId) as string;
        if (!taxpayerId) return res.status(400).json({ error: "taxpayerId es requerido (params.id o body.taxpayerId)" });
        try {
            const strategy = getRoleStrategy(user.role);
            const { allowed, reason } = await strategy.canAccessTaxpayer(db, user.id, taxpayerId);
            if (!allowed) {
                const isNotFound = reason === "Contribuyente no encontrado" || reason === "Usuario no encontrado" || reason === "Grupo no encontrado";
                const status = isNotFound ? 404 : 403;
                return res.status(status).json({ error: reason ?? "Acceso denegado" });
            }
        } catch (accessError: any) {
            logger.error("repair-report acceso error", { message: accessError?.message, stack: accessError?.stack });
            return ApiError.internal(res, "Error al verificar permisos de acceso");
        }
        if (!req.file) return res.status(400).json({ error: "Se requiere un archivo PDF" });
        const file = req.file;
        if (file.mimetype !== "application/pdf") return res.status(400).json({ error: "El archivo debe ser un PDF" });
        const s3Key = `repair-reports/${Date.now()}-${file.originalname}`;
        const pdf_url = storageService.getPublicUrl(s3Key);
        let repairReportId: string | null = null;
        try {
            const newRepairReport = await this.taxpayerService.uploadRepairReport(taxpayerId, "");
            if (!newRepairReport || !newRepairReport.id) {
                logger.error("repair-report: no se pudo crear registro", { taxpayerId });
                return ApiError.internal(res, "No se pudo crear el registro del acta de reparo");
            }
            repairReportId = newRepairReport.id;
            await storageService.upload({ key: s3Key, body: file.buffer, contentType: file.mimetype });
            const updatedRepairReport = await this.taxpayerService.updateRepairReportPdfUrl(repairReportId!, pdf_url);
            return res.status(201).json(updatedRepairReport);
        } catch (error: any) {
            logger.error("repair-report upload error", { message: error?.message, stack: error?.stack, taxpayerId, repairReportId });
            if (repairReportId) {
                try {
                    await this.taxpayerService.deleteRepairReportById(repairReportId);
                    logger.warn(`repair-report: limpieza de registro ${repairReportId} tras fallo`);
                } catch (deleteError: any) {
                    logger.error(`repair-report: no se pudo limpiar registro ${repairReportId}`, { message: deleteError?.message });
                }
            }
            return ApiError.internal(res, error.message || "Error desconocido al subir el acta de reparo", error.stack);
        }
    }

    async getTaxpayerCategories(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const categories = await this.taxpayerService.getTaxpayerCategories();
            return res.status(200).json(categories);
        } catch (e: any) {
            logger.error("get-taxpayer-categories error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudieron obtener las categorías de contribuyentes");
        }
    }

    async getParishList(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const parishList = await this.taxpayerService.getParishList();
            return res.status(200).json(parishList);
        } catch (e: any) {
            logger.error("get-parish-list error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo obtener la lista de parroquias");
        }
    }

    async createTaxpayerExcel(req: Request, res: Response): Promise<Response> {
        try {
            const { user } = req as AuthRequest;
            if (!user) return res.status(401).json({ error: "Unauthorized access" });
            if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) return res.status(403).json({ error: "Forbidden role" });
            const errors = validationResult(req);
            if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
            const response = await this.taxpayerService.createTaxpayerExcel(req.body);
            return res.status(201).json(response);
        } catch (error: any) {
            logger.error("create-taxpayer error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error desconocido al crear el contribuyente", error.stack);
        }
    }

    async getTaxpayerById(req: Request, res: Response): Promise<Response> {
        try {
            const id: string = req.params.id;
            const taxpayer = await this.taxpayerService.getTaxpayerById(id);
            return res.status(200).json(taxpayer);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async getTaxpayersByUser(req: Request, res: Response): Promise<Response> {
        try {
            const id: string = req.params.id;
            const taxpayers = await this.taxpayerService.getTaxpayersByUser(id);
            return res.status(200).json(taxpayers);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async updateTaxpayer(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const id: string = req.params.id;
            const body = req.body;

            const dto: UpdateTaxpayerDto = {
                name: body.name,
                rif: body.rif,
                providenceNum: body.providenceNum ? BigInt(body.providenceNum) : undefined,
                contract_type: body.contract_type,
                process: body.process,
                fase: body.fase,
                address: body.address,
                parish_id: body.parish_id,
                taxpayer_category_id: body.taxpayer_category_id,
            };

            await this.taxpayerService.updateTaxpayer(id, dto, user.id, user.role);

            // Devolvemos el contribuyente actualizado con la misma forma que getTaxpayerById
            const updatedDetail = await this.taxpayerService.getTaxpayerById(id);
            return res.status(200).json(updatedDetail);
        } catch (error: any) {
            logger.error("update-taxpayer error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res);
        }
    }

    async modifyObservations(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const { newDescription } = req.body;
            const updatedObservation = await this.taxpayerService.updateObservation(id, newDescription);
            return res.status(200).json(updatedObservation);
        } catch (e: any) {
            logger.error("modify-observations error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo actualizar la descripción");
        }
    }

    async updateFase(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const { user } = req as AuthRequest;
        const id: string = req.params.id;
        const { fase } = req.body;
        const validFases = ["FASE_1", "FASE_2", "FASE_3", "FASE_4"];
        if (!validFases.includes(fase)) return res.status(400).json({ error: "Invalid fase value" });
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "SUPERVISOR") return res.status(403).json({ error: "Forbidden" });
        try {
            const updatedFase = await this.taxpayerService.updateFase({ id, fase });
            return res.status(200).json(updatedFase);
        } catch (e: any) {
            logger.error("update-fase error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo actualizar la fase del contribuyente");
        }
    }

    async notifyTaxpayer(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        const id: string = req.params.id;
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const notified = await this.taxpayerService.notifyTaxpayer(id);
            return res.status(200).json(notified);
        } catch (e: any) {
            logger.error("notify error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al notificar al contribuyente");
        }
    }

    async updatePayment(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const { user } = req as AuthRequest;
        const id: string = req.params.id;
        if (!user) return res.status(401).json({ error: "Unauthorized" });
        const { status } = req.body;
        if (status !== "paid" && status !== "not_paid") return res.status(400).json({ error: "Bad Request" });
        try {
            const updatedPayment = await this.taxpayerService.updatePayment(id, status);
            return res.status(200).json(updatedPayment);
        } catch (e: any) {
            logger.error("updatePayment error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al actualizar el pago de la multa");
        }
    }

    async deleteTaxpayerById(req: Request, res: Response): Promise<Response> {
        try {
            const id: string = req.params.id;
            const taxpayer = await this.taxpayerService.deleteTaxpayerById(id);
            return res.status(200).json(taxpayer);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async delObservation(req: Request, res: Response): Promise<Response> {
        try {
            const { user } = req as AuthRequest;
            if (!user) return res.status(401).json("Unauthorized");
            if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
            const id: string = req.params.id;
            const observation = await this.taxpayerService.deleteObservation(id);
            return res.status(200).json(observation);
        } catch (e: any) {
            logger.error("del-observation error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo eliminar la observación");
        }
    }

    async getEventsAll(req: Request, res: Response): Promise<Response> {
        try {
            const events = await this.taxpayerService.getEventsbyTaxpayer();
            return res.status(200).json(events);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async getEventByIdType(req: Request, res: Response): Promise<Response> {
        try {
            const id: string = req.params.id;
            const type: string = req.params.type;
            const events = await this.taxpayerService.getEventsbyTaxpayer(id, type);
            return res.status(200).json(events);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    /** GET /taxpayer/events (query type, taxpayerId) y GET /taxpayer/events?type=payment — checklist Sprint 3 */
    async getEvents(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const type = req.query.type as string | undefined;
            const taxpayerId = req.query.taxpayerId as string | undefined;
            if (type === "payment") {
                const events = await ReportService.getPendingPayments(user, taxpayerId);
                return res.status(200).json(events);
            }
            const events = await this.taxpayerService.getEventsbyTaxpayer(taxpayerId, type);
            return res.status(200).json(events);
        } catch (error: any) {
            logger.error("getEvents error", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    /** GET /taxpayer/events/:taxpayerId — checklist Sprint 3 */
    async getEventsByTaxpayerId(req: Request, res: Response): Promise<Response> {
        try {
            const taxpayerId: string = req.params.taxpayerId;
            const type = req.query.type as string | undefined;
            const events = await this.taxpayerService.getEventsbyTaxpayer(taxpayerId, type);
            return res.status(200).json(events);
        } catch (error: any) {
            logger.error("getEventsByTaxpayerId error", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    /** POST /taxpayer/event — crear evento (type: FINE | PAYMENT_COMPROMISE | WARNING) — checklist Sprint 3 */
    async createEvent(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        const type = (req.body.type as string)?.toUpperCase?.() || "";
        try {
            if (type === EventType.FINE) {
                const input = { ...req.body, debt: req.body.amount, type: EventType.FINE };
                const fine = await this.taxpayerService.createEvent(input);
                return res.status(200).json(fine);
            }
            if (type === EventType.PAYMENT_COMPROMISE) {
                const input = { ...req.body, type: EventType.PAYMENT_COMPROMISE };
                const event = await this.taxpayerService.createEvent(input);
                return res.status(200).json(event);
            }
            if (type === EventType.WARNING) {
                const input = { ...req.body, type: EventType.WARNING };
                const event = await this.taxpayerService.createEvent(input);
                return res.status(200).json(event);
            }
            return res.status(400).json({ error: "type debe ser FINE, PAYMENT_COMPROMISE o WARNING" });
        } catch (error: any) {
            logger.error("createEvent error", { message: error?.message, stack: error?.stack });
            const statusCode = error?.message?.includes("no encontrado") || error?.message?.includes("requerido") ? 400 : 500;
            return res.status(statusCode).json({ error: error?.message || "Error al crear el evento" });
        }
    }

    /** PUT /taxpayer/event/:id — actualizar evento (cualquier tipo) — checklist Sprint 3 */
    async updateEventById(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        try {
            const id: string = req.params.id;
            const input = { ...req.body };
            const event = await this.taxpayerService.updateEvent(id, input);
            return res.status(200).json(event);
        } catch (error: any) {
            logger.error("updateEventById error", { message: error?.message });
            return res.status(500).json({ error: error?.message || "Error al actualizar el evento" });
        }
    }

    /** GET /taxpayer/pending-payments y GET /taxpayer/pending-payments/:id — checklist Sprint 3 */
    async getPendingPayments(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const taxpayerId = req.params.id as string | undefined;
            const events = await ReportService.getPendingPayments(user, taxpayerId);
            return res.status(200).json(events);
        } catch (error: any) {
            logger.error("getPendingPayments error", { message: error?.message });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    /** PUT /taxpayer/repair-report/:id — actualizar URL del reporte — checklist Sprint 3 */
    async updateRepairReport(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        try {
            const id: string = req.params.id;
            const pdf_url = req.body.pdf_url as string;
            if (!pdf_url || typeof pdf_url !== "string") return res.status(400).json({ error: "pdf_url es requerido" });
            const updated = await this.taxpayerService.updateRepairReportPdfUrl(id, pdf_url);
            return res.status(200).json(updated);
        } catch (error: any) {
            logger.error("updateRepairReport error", { message: error?.message });
            return res.status(500).json({ error: error?.message || "Error al actualizar el reporte de reparo" });
        }
    }

    /** DELETE /taxpayer/repair-report/:id — checklist Sprint 3 */
    async deleteRepairReport(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const id: string = req.params.id;
            await this.taxpayerService.deleteRepairReportById(id);
            return res.status(200).json({ success: true, message: "Reporte de reparo eliminado" });
        } catch (error: any) {
            logger.error("deleteRepairReport error", { message: error?.message });
            return res.status(500).json({ error: error?.message || "Error al eliminar el reporte de reparo" });
        }
    }

    async getTaxpayerData(req: Request, res: Response): Promise<Response> {
        try {
            const id: string = req.params.id;
            const data = await this.taxpayerService.getTaxpayerData(id);
            return res.status(200).json(data);
        } catch (e: any) {
            logger.error("data error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Ha ocurrido un error al obtener datos");
        }
    }

    async getObservations(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const id: string = (req.params.id || req.params.taxpayerId) as string;
            const observations = await this.taxpayerService.getObservations(id);
            return res.status(200).json(observations);
        } catch (e: any) {
            logger.error("get-observations error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al obtener las observaciones");
        }
    }

    async getIslrReports(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const islrReport = await this.taxpayerService.getIslrReports(id);
            return res.status(200).json(islrReport);
        } catch (e: any) {
            logger.error("get-islr error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "Error al obtener reportes ISLR");
        }
    }

    async getTaxSummary(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        const id: string = req.params.id;
        try {
            const taxSummary = await this.taxpayerService.getTaxpayerSummary(id);
            return res.status(200).json(taxSummary);
        } catch (e: any) {
            logger.error("getTaxSummary error", { message: e?.message, stack: e?.stack });
            return ApiError.internal(res, "No se pudo obtener el resumen tributario del contribuyente");
        }
    }

    async createFine(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("fine validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body, debt: req.body.amount, type: EventType.FINE };
            const fine = await this.taxpayerService.createEvent(input);
            return res.status(200).json(fine);
        } catch (error: any) {
            logger.error("fine error", { message: error?.message, stack: error?.stack });
            const errorMessage = error.message || "Error al crear la multa";
            const statusCode = errorMessage.includes("no encontrado") || errorMessage.includes("requerido") || errorMessage.includes("inválida") ? 400 : 500;
            return res.status(statusCode).json({ error: errorMessage });
        }
    }

    async createIndexIva(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("create-index-iva validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
        try {
            const data = req.body;
            const index = await this.taxpayerService.createIndexIva(data);
            return res.status(200).json(index);
        } catch (error: any) {
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async modifyIndividualIndexIva(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        const allowedRoles = ["ADMIN", "SUPERVISOR", "COORDINATOR", "FISCAL"];
        if (!allowedRoles.includes(user.role)) return res.status(403).json("Forbidden");
        try {
            const { newIndexIva } = req.body;
            const taxpayerId: string = req.params.id;
            const index = await this.taxpayerService.modifyIndexIva(new Decimal(newIndexIva), taxpayerId);
            return res.status(200).json(index);
        } catch (error: any) {
            logger.error("modify-individual-index-iva error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, "Error al modificar el índice IVA");
        }
    }

    async createIVA(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("createIVA validación fallida", { details: errors.array() });
            return res.status(400).json({ errors: errors.array() });
        }
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        const data = req.body;
        if (data.iva == null && data.excess == null) return res.status(400).json("Either IVA or Excess must be provided");
        try {
            const response = await this.taxpayerService.createIVA(data, user.id, user.role);
            return res.status(200).json(response);
        } catch (e: any) {
            logger.error("createIVA error", { message: e?.message, stack: e?.stack });
            if (e.message === "IVA report for this taxpayer and month already exists." || e.message?.includes("Ya existe un reporte IVA")) {
                return ApiError.conflict(res, e.message);
            }
            if (e.message?.includes("No tienes permisos")) return res.status(403).json({ error: e.message });
            return ApiError.internal(res, "Error al crear el reporte IVA");
        }
    }

    async createIslrReport(req: Request, res: Response): Promise<Response> {
        const autorizados = ["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"];
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (!autorizados.includes(user.role)) return res.status(403).json("Forbidden");
        const input = { ...req.body };
        const emitionYear = new Date(input.emition_date).getFullYear();
        try {
            const report = await this.taxpayerService.createISLR(input, user.id, user.role);
            logger.info("ISLR report created successfully");
            return res.status(200).json(report);
        } catch (e: any) {
            if (e.message === `ISLR Report for this taxpayer in: ${emitionYear} was already created`) {
                logger.error(e.message);
                return res.status(400).json({ error: e.message });
            }
            logger.error(e.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async createPayment(req: Request, res: Response): Promise<Response> {
        try {
            const input = { ...req.body };
            const payment = await this.taxpayerService.createPayment(input);
            logger.info("Payment created successfully");
            return res.status(200).json(payment);
        } catch (error: any) {
            if (error.name === "AmountError") {
                logger.error(error.message);
                return res.status(400).json({ error: error.message });
            }
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async createObservation(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body };
            const observation = await this.taxpayerService.createObservation(input);
            logger.info("Observation created successfully");
            return res.status(200).json(observation);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async createPaymentCompromise(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const input = { ...req.body, type: EventType.PAYMENT_COMPROMISE };
            const payment_compromise = await this.taxpayerService.createEvent(input);
            logger.info("Payment compromise created successfully");
            return res.status(200).json(payment_compromise);
        } catch (error: any) {
            logger.error("payment_compromise error", { message: error?.message, stack: error?.stack });
            if (error.name === "AmountError") return res.status(400).json({ error: error.message });
            return res.status(400).json({ error: error.message || "Error al crear el compromiso de pago" });
        }
    }

    async createWarning(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
        try {
            const input = { ...req.body, type: EventType.WARNING };
            const warning = await this.taxpayerService.createEvent(input);
            return res.status(200).json(warning);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(400).json({ error: error.message || "Error al crear el aviso" });
        }
    }

    async updateFine(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        try {
            const eventId = req.params.eventId;
            const input = { ...req.body };
            const fine = await this.taxpayerService.updateEvent(eventId, input);
            logger.info("Fine updated successfully");
            return res.status(200).json(fine);
        } catch (error: any) {
            logger.error("fine update error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al actualizar la multa");
        }
    }

    async updateIva(req: Request, res: Response): Promise<Response> {
        try {
            const { user } = req as AuthRequest;
            const ivaId = req.params.ivaId;
            const input = { ...req.body };
            const updated = await this.taxpayerService.updateIvaReport(ivaId, input, user?.id, user?.role);
            logger.info("IVA report updated successfully");
            return res.status(200).json(updated);
        } catch (error: any) {
            logger.error("updateIva error", { message: error?.message, stack: error?.stack });
            return ApiError.internal(res, error.message || "Error al actualizar reporte IVA");
        }
    }

    async updatePaymentEvent(req: Request, res: Response): Promise<Response> {
        try {
            const eventId = req.params.eventId;
            const input = { ...req.body };
            const payment = await this.taxpayerService.updateEvent(eventId, input);
            logger.info("Payment updated successfully");
            return res.status(200).json(payment);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async updateTaxpayerPut(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        let data: Record<string, unknown>;
        if (user.role === "ADMIN") {
            data = req.body;
        } else {
            const { parish_id, taxpayer_category_id } = req.body;
            data = { parish_id, taxpayer_category_id };
        }
        const id = req.params.id;
        try {
            const updated = await this.taxpayerService.updateTaxpayer(id, data, user.id, user.role);
            return res.status(201).json(updated);
        } catch (err: any) {
            logger.error("update-taxpayer-put error", { message: err?.message, stack: err?.stack });
            return ApiError.internal(res, "Error al actualizar el contribuyente");
        }
    }

    async updateCulminated(req: Request, res: Response): Promise<Response> {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.error(errors.array());
            return res.status(400).json({ errors: errors.array() });
        }
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const culminated = req.body.culminated;
            const culminatedSuccesfully = await this.taxpayerService.updateCulminated(id, culminated, user.id, user.role);
            logger.info("Case culminated successfully");
            return res.status(201).json(culminatedSuccesfully);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message || "Error al culminar el caso" });
        }
    }

    async updatePaymentCompromiseEvent(req: Request, res: Response): Promise<Response> {
        try {
            const eventId = req.params.eventId;
            const input = { ...req.body };
            const payment_compromise = await this.taxpayerService.updateEvent(eventId, input);
            logger.info("Payment compromise updated successfully");
            return res.status(200).json(payment_compromise);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async updateWarningEvent(req: Request, res: Response): Promise<Response> {
        try {
            const eventId = req.params.eventId;
            const input = { ...req.body };
            const warning = await this.taxpayerService.updateEvent(eventId, input);
            logger.info("Warning updated successfully");
            return res.status(200).json(warning);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async updateIslr(req: Request, res: Response): Promise<Response> {
        const autorizados = ["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"];
        try {
            const { user } = req as AuthRequest;
            if (!user) return res.status(401).json("Unauthorized access");
            if (!autorizados.includes(user.role)) return res.status(403).json("Forbidden");
            const id: string = req.params.id;
            const input = req.body;
            const updatedIslr = await this.taxpayerService.updateIslr(id, input, user.id, user.role);
            logger.info("ISLR updated successfully");
            return res.status(201).json(updatedIslr);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message });
        }
    }

    async deleteEvent(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const event = await this.taxpayerService.deleteEvent(id);
            logger.info("Event deleted successfully");
            return res.status(200).json(event);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ message: error.message });
        }
    }

    async deletePayment(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN" && user.role !== "COORDINATOR" && user.role !== "FISCAL" && user.role !== "SUPERVISOR") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const event = await this.taxpayerService.deletePayment(id);
            logger.info("Payment deleted successfully");
            return res.status(200).json(event);
        } catch (error: any) {
            logger.error(error.message);
            return res.status(500).json({ message: error.message || "Server error." });
        }
    }

    async deleteIva(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const ivaReport = await this.taxpayerService.deleteIva(id);
            logger.info("IVA report deleted successfully");
            return res.status(201).json(ivaReport);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message || "Server error." });
        }
    }

    async deleteIslr(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
        try {
            const id: string = req.params.id;
            const islrReport = await this.taxpayerService.deleteIslr(id);
            logger.info("ISLR report deleted successfully");
            return res.status(201).json(islrReport);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ message: e.message });
        }
    }

    async createTaxpayerCategory(req: Request, res: Response): Promise<Response> {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
        const { name } = req.body;
        try {
            const response = await this.taxpayerService.CreateTaxpayerCategory(name);
            logger.info("New category created successfully");
            return res.status(201).json(response);
        } catch (e: any) {
            logger.error(e.message);
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
}
