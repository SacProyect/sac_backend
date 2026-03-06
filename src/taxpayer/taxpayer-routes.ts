/**
 * Rutas de contribuyentes.
 * Delegan en TaxpayerController (DI); los servicios se consumen vía TaxpayerService
 * con imports específicos por módulo (./services/*.service.ts).
 */
import express from "express";
import type { Request, Response } from "express";
import { container } from "tsyringe";
import { TaxpayerController } from "./TaxpayerController";
import { body } from "express-validator";
import { authenticateToken } from "../users/user-utils";
import { createLocalUpload } from "../utils/multer-local";
import { uploadMemory } from "../utils/multer-memory";
import { cacheMiddleware, invalidateCacheMiddleware } from "../utils/cache-middleware";

// Define taxpayerController with a Proxy for lazy resolution
// This fixes errors where the router is imported before tsyringe is configured
const taxpayerController = new Proxy({} as TaxpayerController, {
    get: (_, prop: keyof TaxpayerController) => {
        const controller = container.resolve(TaxpayerController);
        const method = controller[prop];
        return typeof method === 'function' ? method.bind(controller) : method;
    }
});

export const taxpayerRouter = express.Router();


const uploadLocal = createLocalUpload([
    "application/pdf",
    "application/msword", // .doc
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
]);

taxpayerRouter.get(
    "/get-taxpayers-for-events",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["taxpayers-events"], includeUser: true }),
    (req: Request, res: Response) => taxpayerController.getTaxpayersForEvents(req, res)
)

taxpayerRouter.get(
    "/get-fiscal-taxpayers-for-stats/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["fiscal-stats"] }),
    (req: Request, res: Response) => taxpayerController.getFiscalTaxpayersForStats(req, res)
)

taxpayerRouter.get(
    "/get-taxpayers",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["taxpayers-list"], includeUser: true }),
    (req: Request, res: Response) => taxpayerController.getTaxpayers(req, res)
);

taxpayerRouter.get(
    "/my-current-year-taxpayers",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers-current-year"], includeUser: true }),
    (req: Request, res: Response) => taxpayerController.myCurrentYearTaxpayers(req, res)
);

taxpayerRouter.get(
    "/team-current-year-taxpayers",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers-current-year"], includeUser: true }),
    (req: Request, res: Response) => taxpayerController.teamCurrentYearTaxpayers(req, res)
);

taxpayerRouter.get(
    "/download-repair-report/:key",
    authenticateToken,
    (req: Request, res: Response) => taxpayerController.downloadRepairReport(req, res)
)






taxpayerRouter.get(
    "/download-investigation",
    authenticateToken,
    (req: Request, res: Response) => taxpayerController.downloadInvestigation(req, res)
)




taxpayerRouter.post(
    '/',
    authenticateToken,
    uploadLocal.array("pdfs", 20),
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list', 'taxpayer-categories']),
    body("providenceNum").isNumeric().withMessage("providenceNum must be numeric"),
    body("process").isString().withMessage("process must be a string"),
    body("name").isString().withMessage("name must be a string"),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid (must start with J, V, E, P or G followed by 9 digits)"),
    body("contract_type").isString().withMessage("contract_type must be a string"),
    body("officerName").isString().withMessage("officerName must be a string"),
    body("address").notEmpty().withMessage("address is required"),
    body("emition_date").notEmpty().withMessage("emition_date is required").isString().withMessage("emition_date must be a string"),
    body("category").notEmpty().withMessage("category must be provided").isString().withMessage("Category must be a string"),
    body("parish").notEmpty().withMessage("parish is required").isString().withMessage("parish must be a string"),

    (req: Request, res: Response) => taxpayerController.createTaxpayer(req, res)
);

taxpayerRouter.post(
    "/repair-report/:id",
    authenticateToken,
    uploadMemory.single("repairReport"),
    invalidateCacheMiddleware(["taxpayers", "repair-reports"]),
    (req: Request, res: Response) => taxpayerController.uploadRepairReport(req, res)
);

// Checklist Sprint 3: POST /taxpayer/repair-report (taxpayerId en body, multipart)
taxpayerRouter.post(
    "/repair-report",
    authenticateToken,
    uploadMemory.single("repairReport"),
    invalidateCacheMiddleware(["taxpayers", "repair-reports"]),
    (req: Request, res: Response) => taxpayerController.uploadRepairReport(req, res)
);

// Checklist Sprint 3: PUT /taxpayer/repair-report/:id (actualizar URL)
taxpayerRouter.put(
    "/repair-report/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers", "repair-reports"]),
    body("pdf_url").isString().notEmpty(),
    (req: Request, res: Response) => taxpayerController.updateRepairReport(req, res)
);

// Checklist Sprint 3: DELETE /taxpayer/repair-report/:id
taxpayerRouter.delete(
    "/repair-report/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers", "repair-reports"]),
    (req: Request, res: Response) => taxpayerController.deleteRepairReport(req, res)
);

taxpayerRouter.get(
    "/get-taxpayer-categories",
    authenticateToken,
    cacheMiddleware({ ttl: 300000, tags: ["taxpayer-categories"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayerCategories(req, res)
)

taxpayerRouter.get(
    "/get-parish-list",
    authenticateToken,
    cacheMiddleware({ ttl: 300000, tags: ["parish-list"] }),
    (req: Request, res: Response) => taxpayerController.getParishList(req, res)
)

// ⚠️ IMPORTANT: Estas rutas específicas deben ir ANTES de /:id para evitar conflictos
taxpayerRouter.get(
    "/get-index-iva",
    authenticateToken,
    (req: Request, res: Response) => taxpayerController.getIndexIva(req, res)
)

taxpayerRouter.get(
    "/get-islr/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["islr-reports"] }),
    (req: Request, res: Response) => taxpayerController.getIslrReports(req, res)
)

taxpayerRouter.get(
    "/getTaxSummary/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers"] }),
    (req: Request, res: Response) => taxpayerController.getTaxSummary(req, res)
)

taxpayerRouter.get(
    "/data/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayerData(req, res)
)


taxpayerRouter.post(
    '/create-taxpayer',
    authenticateToken,
    invalidateCacheMiddleware(['taxpayers', 'taxpayers-list']),
    body("providenceNum").isNumeric().withMessage("providenceNum must be numeric"),
    body("process").isString().withMessage("process must be a string"),
    body("name").isString().withMessage("name must be a string"),
    body("rif").matches(/^[JVEPG]\d{9}$/).withMessage("RIF format is invalid (must start with J, V, E, P or G followed by 9 digits)"),
    body("contract_type").isString().withMessage("contract_type must be a string"),
    body("officerName").isString().withMessage("officerName must be a string"),
    body("address").notEmpty().withMessage("address is required"),
    body("emition_date").notEmpty().withMessage("emition_date is required").isString().withMessage("emition_date must be a string"),
    body("category").notEmpty().withMessage("category must be provided").isString().withMessage("Category must be a string"),
    body("parish").notEmpty().withMessage("parish is required").isString().withMessage("parish must be a string"),

    (req: Request, res: Response) => taxpayerController.createTaxpayerExcel(req, res)
);


taxpayerRouter.get(
    "/all/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["taxpayers-list"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayersByUser(req, res)
);

// ⚠️ IMPORTANT: /:id debe ir AL FINAL de los GETs para no capturar rutas específicas
taxpayerRouter.get(
    "/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayerById(req, res)
)



taxpayerRouter.put(
    "/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers", "taxpayers-list"]),
    body("providenceNum").isInt().optional({ values: "falsy" }),
    body("process").isString().optional({ values: "falsy" }),
    body("name").isString().optional({ values: "falsy" }),
    body("rif").isString().optional({ values: "falsy" }),
    body("contractType").isString().optional({ values: "falsy" }),
    body("officerId").isString().optional({ values: "falsy" }),
    (req: Request, res: Response) => taxpayerController.updateTaxpayer(req, res)
)

taxpayerRouter.put(
    "/modify-observations/:id",
    authenticateToken,
    invalidateCacheMiddleware(["observations"]),
    body("newDescription").notEmpty().isString(),
    (req: Request, res: Response) => taxpayerController.modifyObservations(req, res)
);

// Checklist Sprint 3: PUT /taxpayer/observation/:id (alias)
taxpayerRouter.put(
    "/observation/:id",
    authenticateToken,
    invalidateCacheMiddleware(["observations"]),
    body("newDescription").notEmpty().isString(),
    (req: Request, res: Response) => taxpayerController.modifyObservations(req, res)
)

taxpayerRouter.put(
    "/update-fase/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers", "fase"]),
    body("fase").notEmpty().isString(),
    (req: Request, res: Response) => taxpayerController.updateFase(req, res)
)

taxpayerRouter.put(
    "/notify/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers"]),
    (req: Request, res: Response) => taxpayerController.notifyTaxpayer(req, res)
)


taxpayerRouter.put(
    "/updatePayment/:id",
    authenticateToken,
    invalidateCacheMiddleware(["payments", "taxpayers-events"]),
    body("status").isString(),
    (req: Request, res: Response) => taxpayerController.updatePayment(req, res)
);

// Checklist Sprint 3: PUT /taxpayer/payment/status/:id (alias)
taxpayerRouter.put(
    "/payment/status/:id",
    authenticateToken,
    invalidateCacheMiddleware(["payments", "taxpayers-events"]),
    body("status").isString(),
    (req: Request, res: Response) => taxpayerController.updatePayment(req, res)
)


taxpayerRouter.delete(
    "/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers", "taxpayers-list"]),
    (req: Request, res: Response) => taxpayerController.deleteTaxpayerById(req, res)
)

taxpayerRouter.delete(
    "/del-observation/:id",
    authenticateToken,
    invalidateCacheMiddleware(["observations"]),
    (req: Request, res: Response) => taxpayerController.delObservation(req, res)
);

// Checklist Sprint 3: DELETE /taxpayer/observation/:id (alias)
taxpayerRouter.delete(
    "/observation/:id",
    authenticateToken,
    invalidateCacheMiddleware(["observations"]),
    (req: Request, res: Response) => taxpayerController.delObservation(req, res)
)

taxpayerRouter.get(
    "/event/all",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["events"] }),
    (req: Request, res: Response) => taxpayerController.getEventsAll(req, res)
);

// Checklist Sprint 3: GET /taxpayer/pending-payments y GET /taxpayer/pending-payments/:id
taxpayerRouter.get(
    "/pending-payments",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["pending-payments", "events"], includeUser: true }),
    (req: Request, res: Response) => taxpayerController.getPendingPayments(req, res)
);
taxpayerRouter.get(
    "/pending-payments/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["pending-payments", "events"], includeUser: true }),
    (req: Request, res: Response) => taxpayerController.getPendingPayments(req, res)
)

taxpayerRouter.get(
    "/event/:id/:type?",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["events", "taxpayers-events"] }),
    (req: Request, res: Response) => taxpayerController.getEventByIdType(req, res)
)

// Checklist Sprint 3: GET /taxpayer/events (query type, taxpayerId) y GET /taxpayer/events/:taxpayerId
taxpayerRouter.get(
    "/events",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["events"] }),
    (req: Request, res: Response) => taxpayerController.getEvents(req, res)
)
taxpayerRouter.get(
    "/events/:taxpayerId",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["events", "taxpayers-events"] }),
    (req: Request, res: Response) => taxpayerController.getEventsByTaxpayerId(req, res)
)

taxpayerRouter.get(
    "/get-observations/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["observations"] }),
    (req: Request, res: Response) => taxpayerController.getObservations(req, res)
);

// Checklist Sprint 3: GET /taxpayer/observations/:taxpayerId (alias)
taxpayerRouter.get(
    "/observations/:taxpayerId",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["observations"] }),
    (req: Request, res: Response) => taxpayerController.getObservations(req, res)
)

taxpayerRouter.post(
    "/fine",
    authenticateToken,
    invalidateCacheMiddleware(["events", "taxpayers-events"]),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("description").isString().notEmpty(),
    (req: Request, res: Response) => taxpayerController.createFine(req, res)
)



taxpayerRouter.post(
    "/create-index-iva",
    authenticateToken,
    body("specialAmount").isDecimal(),
    body("ordinaryAmount").isDecimal(),
    (req: Request, res: Response) => taxpayerController.createIndexIva(req, res)
)

taxpayerRouter.put(
    "/modify-individual-index-iva/:id",
    authenticateToken,
    body("newIndexIva"),
    (req: Request, res: Response) => taxpayerController.modifyIndividualIndexIva(req, res)
)

taxpayerRouter.post(
    "/createIVA",
    authenticateToken,
    invalidateCacheMiddleware(["iva-reports", "taxpayers"]),
    body("taxpayerId").isString().notEmpty(),
    body("iva").optional(),
    body("purchases").notEmpty().isNumeric(),
    body("sells").notEmpty().isNumeric(),
    body("excess").optional(),
    body("date").isISO8601().notEmpty(),
    body("paid").notEmpty(),
    (req: Request, res: Response) => taxpayerController.createIVA(req, res)
)



taxpayerRouter.post(
    "/create-islr-report",
    authenticateToken,
    invalidateCacheMiddleware(["islr-reports", "taxpayers"]),
    body("incomes").isDecimal(),
    body("costs").isDecimal(),
    body("expent").isDecimal(),
    body("emition_date").isISO8601().notEmpty(),
    body("taxpayerId").isString().notEmpty(),
    body("paid").notEmpty(),
    (req: Request, res: Response) => taxpayerController.createIslrReport(req, res)
)

taxpayerRouter.post(
    "/payment",
    authenticateToken,
    invalidateCacheMiddleware(["payments", "events"]),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("eventId").isString().notEmpty(),
    body("taxpayerId").isString(),
    body("debt").isNumeric(),
    (req: Request, res: Response) => taxpayerController.createPayment(req, res)
)

taxpayerRouter.post(
    "/observations",
    authenticateToken,
    invalidateCacheMiddleware(["observations"]),
    body("description").notEmpty().isString(),
    body("date").notEmpty().isString().isISO8601(),
    body("taxpayerId").notEmpty().isString(),
    (req: Request, res: Response) => taxpayerController.createObservation(req, res)
);

// Checklist Sprint 3: POST /taxpayer/observation (alias)
taxpayerRouter.post(
    "/observation",
    authenticateToken,
    invalidateCacheMiddleware(["observations"]),
    body("description").notEmpty().isString(),
    body("date").notEmpty().isString().isISO8601(),
    body("taxpayerId").notEmpty().isString(),
    (req: Request, res: Response) => taxpayerController.createObservation(req, res)
)


taxpayerRouter.post(
    "/payment_compromise",
    authenticateToken,
    invalidateCacheMiddleware(["events", "taxpayers-events"]),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("fineEventId").isString().notEmpty(),
    (req: Request, res: Response) => taxpayerController.createPaymentCompromise(req, res)
)





taxpayerRouter.post(
    "/warning",
    authenticateToken,
    invalidateCacheMiddleware(["events", "taxpayers-events"]),
    body("date").isISO8601().toDate(),
    body("amount").isNumeric(),
    body("taxpayerId").isString().notEmpty(),
    body("fineEventId").isString().notEmpty(),
    (req: Request, res: Response) => taxpayerController.createWarning(req, res)
)



taxpayerRouter.put(
    "/fine/:eventId",
    authenticateToken,
    invalidateCacheMiddleware(["events", "taxpayers-events"]),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    body("description").isString().optional({ checkFalsy: true }),
    body("type").isString().optional({ checkFalsy: true }),
    (req: Request, res: Response) => taxpayerController.updateFine(req, res)
);

taxpayerRouter.put(
    "/updateIva/:ivaId",
    authenticateToken,
    invalidateCacheMiddleware(["iva-reports", "taxpayers"]),
    (req: Request, res: Response) => taxpayerController.updateIva(req, res)
);

taxpayerRouter.put(
    "/payment/:eventId",
    authenticateToken,
    invalidateCacheMiddleware(["payments", "events"]),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    (req: Request, res: Response) => taxpayerController.updatePaymentEvent(req, res)
);

taxpayerRouter.put(
    "/update-taxpayer/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers", "taxpayers-list"]),
    body("address").optional(),
    body("providenceNum").optional(),
    body("process").optional(),
    body("name").optional(),
    body("rif").optional(),
    body("parish_id").optional(),
    body("taxpayer_category_id").optional(),
    (req: Request, res: Response) => taxpayerController.updateTaxpayerPut(req, res)
);

/**
 * ✅ REFACTORIZACIÓN 2026: Ruta reactivada para permitir culminar casos 2025
 * - Permite acceso a fiscales rotados
 * - No valida restricciones de año fiscal
 */
taxpayerRouter.put(
    "/update-culminated/:id",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayers"]),
    body("culminated").isBoolean().notEmpty(),
    (req: Request, res: Response) => taxpayerController.updateCulminated(req, res)
)

taxpayerRouter.put(
    "/payment_compromise/:eventId",
    authenticateToken,
    invalidateCacheMiddleware(["events"]),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    body("amount").isDecimal().optional({ checkFalsy: true }),
    (req: Request, res: Response) => taxpayerController.updatePaymentCompromiseEvent(req, res)
);

taxpayerRouter.put(
    "/warning/:eventId",
    authenticateToken,
    invalidateCacheMiddleware(["events"]),
    body("date").isISO8601().toDate().optional({ checkFalsy: true }),
    (req: Request, res: Response) => taxpayerController.updateWarningEvent(req, res)
);

taxpayerRouter.put(
    "/update-islr/:id",
    authenticateToken,
    invalidateCacheMiddleware(["islr-reports", "taxpayers"]),
    (req: Request, res: Response) => taxpayerController.updateIslr(req, res)
)

taxpayerRouter.delete(
    "/event/:id",
    authenticateToken,
    (req: Request, res: Response) => taxpayerController.deleteEvent(req, res)
);

// Checklist Sprint 3: POST /taxpayer/event (type: FINE | PAYMENT_COMPROMISE | WARNING)
taxpayerRouter.post(
    "/event",
    authenticateToken,
    invalidateCacheMiddleware(["events", "taxpayers-events"]),
    body("type").isString().isIn(["FINE", "PAYMENT_COMPROMISE", "WARNING"]),
    body("date").isISO8601().toDate(),
    body("amount").isDecimal(),
    body("taxpayerId").isString().notEmpty(),
    body("description").optional().isString(),
    body("fineEventId").optional().isString(),
    (req: Request, res: Response) => taxpayerController.createEvent(req, res)
);

// Checklist Sprint 3: PUT /taxpayer/event/:id
taxpayerRouter.put(
    "/event/:id",
    authenticateToken,
    invalidateCacheMiddleware(["events", "taxpayers-events"]),
    body("date").optional().isISO8601().toDate(),
    body("amount").optional().isDecimal(),
    body("description").optional().isString(),
    body("type").optional().isString(),
    (req: Request, res: Response) => taxpayerController.updateEventById(req, res)
);

taxpayerRouter.delete(
    "/payment/:id",
    authenticateToken,
    (req: Request, res: Response) => taxpayerController.deletePayment(req, res)
);

taxpayerRouter.delete(
    "/delete-iva/:id",
    authenticateToken,
    invalidateCacheMiddleware(["iva-reports", "taxpayers"]),
    (req: Request, res: Response) => taxpayerController.deleteIva(req, res)
);



taxpayerRouter.delete(
    "/delete-islr/:id",
    authenticateToken,
    invalidateCacheMiddleware(["islr-reports", "taxpayers"]),
    (req: Request, res: Response) => taxpayerController.deleteIslr(req, res)
)


taxpayerRouter.post(
    "/create-taxpayer-category",
    authenticateToken,
    invalidateCacheMiddleware(["taxpayer-categories"]),
    body("name"),
    (req: Request, res: Response) => taxpayerController.createTaxpayerCategory(req, res)
)

