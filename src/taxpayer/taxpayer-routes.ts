import express from "express";
import type { Request, Response } from "express";
import { container } from "tsyringe";
import { TaxpayerController } from "./TaxpayerController";
import { body } from "express-validator";
import { authenticateToken } from "../users/user-utils";
import { createLocalUpload } from "../utils/multer-local";
import { uploadMemory } from "../utils/multer-memory";
import { cacheMiddleware, invalidateCacheMiddleware } from "../utils/cache-middleware";

const taxpayerController = container.resolve(TaxpayerController);

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
    "/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayerById(req, res)
)



taxpayerRouter.get(
    "/all/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["taxpayers-list"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayersByUser(req, res)
);



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
)

taxpayerRouter.get(
    "/event/all",
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ["events"] }),
    (req: Request, res: Response) => taxpayerController.getEventsAll(req, res)
)

taxpayerRouter.get(
    "/event/:id/:type?",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["events", "taxpayers-events"] }),
    (req: Request, res: Response) => taxpayerController.getEventByIdType(req, res)
)

taxpayerRouter.get(
    "/data/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["taxpayers"] }),
    (req: Request, res: Response) => taxpayerController.getTaxpayerData(req, res)
)



taxpayerRouter.get(
    "/get-observations/:id",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ["observations"] }),
    (req: Request, res: Response) => taxpayerController.getObservations(req, res)
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

