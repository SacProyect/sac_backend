import express from "express";
import type { Request, Response, NextFunction } from "express";
import * as UserService from "./user-services";
import { body, validationResult, query } from "express-validator";
import { authenticateToken, AuthRequest } from "./user-utils";
import logger from "../utils/logger";
import { cacheMiddleware, invalidateCacheMiddleware } from "../utils/cache-middleware";
import { env } from "../config/env-config";
import { BaseError } from "../core/errors/BaseError";

export const userRouter = express.Router();


userRouter.get('/all',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['users', 'users-list'], includeUser: true }),
    async (req: Request, res: Response, next: NextFunction) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")


        try {
            const users = await UserService.getAllUsers(user);
            return res.status(200).json(users)
        } catch (error: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && error instanceof BaseError) {
                return next(error);
            }
            logger.error("Error getAllUsers", { userId: user?.id, message: error.message, stack: error.stack });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)

userRouter.post('/',
    body("personId").isNumeric(),
    body("password").isString(),
    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            logger.warn("Login validación fallida", { path: '/user', details: errors.array() });
            return res.status(400).json({
                error: 'Validación fallida',
                details: errors.array()
            });
        }

        try {
            const { personId, password } = req.body;
            const data = await UserService.logIn(personId, password);
            return res.status(200).json(data);
        } catch (error: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && error instanceof BaseError) {
                return next(error);
            }
            logger.warn("Login fallido", { personId: req.body?.personId, message: error.message });

            if (error.message === 'Usuario no encontrado' || error.message === 'Las credenciales no son correctas.') {
                return res.status(401).json({ error: error.message });
            }

            if (error.name === 'NotFoundError') {
                return res.status(404).json({ error: 'Usuario no encontrado en base de datos' });
            }

            return res.status(500).json({ error: 'Error interno del servidor' });
        }
    }
);


const VALID_ROLES = ['FISCAL', 'ADMIN', 'COORDINATOR', 'SUPERVISOR'] as const;

userRouter.post('/sign-up',
    invalidateCacheMiddleware(['users', 'users-list', 'fiscals']),
    body("personId").isNumeric(),
    body("password").isString(),
    body("name").isString(),
    body("role").isString().isIn(VALID_ROLES).withMessage(`role debe ser uno de: ${VALID_ROLES.join(', ')}`),
    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            const payload = { error: 'Validación fallida', details: errors.array() };
            logger.warn("Sign-up validación fallida", { path: '/user/sign-up', body: req.body, details: errors.array() });
            return res.status(400).json(payload);
        }
        try {
            const input = req.body;
            const newUser = await UserService.signUp(input);
            logger.info("Usuario registrado", { name: input.name, role: input.role, personId: input.personId });
            return res.status(201).json(newUser);
        } catch (error: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && error instanceof BaseError) {
                return next(error);
            }
            const isValidation = error.name === 'PrismaClientValidationError' || error.message?.includes('Expected user_roles');
            if (isValidation) {
                logger.warn("Sign-up datos inválidos (Prisma)", { body: req.body, message: error.message });
                return res.status(400).json({ error: 'Datos inválidos', message: error.message || 'Rol no permitido. Use: FISCAL, ADMIN, COORDINATOR o SUPERVISOR.' });
            }
            if (error.code === 'P2002') {
                logger.warn("Sign-up cédula duplicada", { personId: req.body?.personId });
                return res.status(409).json({ error: 'Ya existe un usuario con esa cédula (personId).' });
            }
            logger.error("Sign-up error interno", { body: req.body, message: error.message, stack: error.stack });
            return res.status(500).json({ error: error.message || 'Error interno del servidor' });
        }
    }
);

userRouter.get("/me",
    authenticateToken,
    cacheMiddleware({ ttl: 60000, tags: ['users'], includeUser: true }),
    async (req: Request, res: Response, next: NextFunction) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access")

        try {

            const id = user.id;

            const response = await UserService.getUser(id);

            return res.status(200).json(response);

        } catch (err: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && err instanceof BaseError) {
                return next(err);
            }
            logger.error("Error in /users/me", { message: err?.message, stack: err?.stack });
            res.status(500).json({ message: "Server error" });
        }
    }
)

/**
 * ✅ CORRECCIÓN 2026: Agregado parámetro opcional de año para filtrar fiscales
 * Query params:
 * - year (opcional): Año para filtrar (2025 o 2026). Si no se especifica, retorna todos los fiscales.
 * 
 * Ejemplo: GET /users/get-fiscals-for-review?year=2025
 */
userRouter.get('/get-fiscals-for-review',
    authenticateToken,
    cacheMiddleware({ ttl: 120000, tags: ['users', 'fiscals'], includeUser: true }),
    query("year").optional().isInt().withMessage("Year must be an integer"),
    query("page").optional().isInt({ min: 1 }).withMessage("Page must be a positive integer"),
    query("limit").optional().isInt({ min: 1, max: 100 }).withMessage("Limit must be between 1 and 100"),

    async (req: Request, res: Response, next: NextFunction) => {

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role === "FISCAL") return res.status(403).json("Forbidden");

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {

            const userId = user.id;
            const userRole = user.role;

            // ✅ Parámetros de paginación (opcionales)
            const page = parseInt(req.query.page as string, 10) || 1;
            const limit = parseInt(req.query.limit as string, 10) || 50;

            // ✅ Obtener parámetro de año opcional
            const yearParam = req.query.year;
            const year = yearParam ? parseInt(yearParam as string, 10) : undefined;

            // Validar que el año sea razonable (2020-2030)
            if (year !== undefined && (year < 2020 || year > 2030)) {
                return res.status(400).json({ error: "El año debe estar entre 2020 y 2030" });
            }

            const response = await UserService.getFiscalsForReview(userId, userRole, year, page, limit);

            return res.status(200).json(response);

        } catch (err: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && err instanceof BaseError) {
                return next(err);
            }
            logger.error("Error in /users/get-fiscals-for-review", { message: err?.message, stack: err?.stack });
            res.status(500).json({ message: "Server error" });
        }
    }
)

userRouter.put('/update-by-name/:name',
    authenticateToken,
    invalidateCacheMiddleware(['users', 'users-list']),
    body("name").optional(),
    body("personId").optional(),
    body("email").optional(),

    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");

        try {
            const name: string = req.params.name;

            const data = req.body;

            const response = await UserService.updateUserByName(name, data);

            return res.status(200).json(response);

        } catch (e: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && e instanceof BaseError) {
                return next(e);
            }
            logger.error("Error update-by-name", { name: req.params.name, message: e?.message, stack: e?.stack });
            return res.status(500).json({ error: "Error interno del servidor" });
        }

    }
)

userRouter.put('/update-password/:id',
    authenticateToken,
    invalidateCacheMiddleware(['users']),
    body("password").notEmpty(),

    async (req: Request, res: Response, next: NextFunction) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { user } = req as AuthRequest

        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }

        try {
            // const userId: string = user.id;
            const userId: string = req.params.id;
            const { password } = req.body;


            const response = await UserService.updatePassword(userId, password);

            return res.status(200).json(response);

        } catch (e: any) {
            if (env.FF_NEW_ERROR_HIERARCHY && e instanceof BaseError) {
                return next(e);
            }
            logger.error("Error update-password", { userId: req.params.id, message: e?.message, stack: e?.stack });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
)