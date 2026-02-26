import { injectable, inject } from "tsyringe";
import type { Request, Response } from "express";
import { UserService } from "./UserService";
import { AuthRequest } from "./user-utils";
import { loginSchema } from "./dtos/login.dto";
import { createUserSchema } from "./dtos/create-user.dto";
import { updateUserByNamesSchema, updatePasswordSchema } from "./dtos/update-user.dto";
import { randomUUID } from "crypto";
import logger from "../utils/logger";

@injectable()
export class UserController {
    constructor(@inject(UserService) private readonly userService: UserService) {}

    async getAllUsers(req: Request, res: Response) {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const users = await this.userService.getAllUsers(user);
            return res.status(200).json(users);
        } catch (error: any) {
            logger.error("Error getAllUsers", { userId: user?.id, message: error.message, stack: error.stack });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async login(req: Request, res: Response) {
        const parsed = loginSchema.safeParse(req.body);
        if (!parsed.success) {
            logger.warn("Login validación fallida", { path: "/user", details: parsed.error.flatten() });
            return res.status(400).json({
                error: "Validación fallida",
                details: parsed.error.flatten().fieldErrors,
            });
        }
        const { personId, password } = parsed.data;
        try {
            const data = await this.userService.logIn(personId, password);
            return res.status(200).json(data);
        } catch (error: any) {
            logger.warn("Login fallido", { personId: req.body?.personId, message: error.message });
            if (
                error.message === "Usuario no encontrado" ||
                error.message === "Las credenciales no son correctas."
            ) {
                return res.status(401).json({ error: error.message });
            }
            if (error.name === "NotFoundError") {
                return res.status(404).json({ error: "Usuario no encontrado en base de datos" });
            }
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async signUp(req: Request, res: Response) {
        const parsed = createUserSchema.safeParse(req.body);
        if (!parsed.success) {
            const payload = {
                error: "Validación fallida",
                details: parsed.error.flatten().fieldErrors,
            };
            logger.warn("Sign-up validación fallida", {
                path: "/user/sign-up",
                body: req.body,
                details: parsed.error.flatten(),
            });
            return res.status(400).json(payload);
        }
        const dto = parsed.data;
        const input = {
            id: randomUUID(),
            personId: dto.personId,
            name: dto.name,
            role: dto.role,
            password: dto.password,
        };
        try {
            const newUser = await this.userService.signUp(input);
            logger.info("Usuario registrado", {
                name: dto.name,
                role: dto.role,
                personId: dto.personId,
            });
            return res.status(201).json(newUser);
        } catch (error: any) {
            const isValidation =
                error.name === "PrismaClientValidationError" ||
                error.message?.includes("Expected user_roles");
            if (isValidation) {
                logger.warn("Sign-up datos inválidos (Prisma)", {
                    body: req.body,
                    message: error.message,
                });
                return res.status(400).json({
                    error: "Datos inválidos",
                    message:
                        error.message ||
                        "Rol no permitido. Use: FISCAL, ADMIN, COORDINATOR o SUPERVISOR.",
                });
            }
            if (error.code === "P2002") {
                logger.warn("Sign-up cédula duplicada", { personId: req.body?.personId });
                return res.status(409).json({
                    error: "Ya existe un usuario con esa cédula (personId).",
                });
            }
            logger.error("Sign-up error interno", {
                body: req.body,
                message: error.message,
                stack: error.stack,
            });
            return res.status(500).json({
                error: error.message || "Error interno del servidor",
            });
        }
    }

    async getMe(req: Request, res: Response) {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        try {
            const response = await this.userService.getUser(user.id);
            return res.status(200).json(response);
        } catch (err: any) {
            logger.error("Error in /users/me", { message: err?.message, stack: err?.stack });
            return res.status(500).json({ message: "Server error" });
        }
    }

    async getFiscalsForReview(req: Request, res: Response) {
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role === "FISCAL") return res.status(403).json("Forbidden");
        const page = parseInt(req.query.page as string, 10) || 1;
        const limit = parseInt(req.query.limit as string, 10) || 50;
        const yearParam = req.query.year;
        const year = yearParam ? parseInt(yearParam as string, 10) : undefined;
        if (year !== undefined && (year < 2020 || year > 2030)) {
            return res.status(400).json({ error: "El año debe estar entre 2020 y 2030" });
        }
        try {
            const response = await this.userService.getFiscalsForReview(
                user.id,
                user.role,
                year,
                page,
                limit
            );
            return res.status(200).json(response);
        } catch (err: any) {
            logger.error("Error in /users/get-fiscals-for-review", {
                message: err?.message,
                stack: err?.stack,
            });
            return res.status(500).json({ message: "Server error" });
        }
    }

    async updateByName(req: Request, res: Response) {
        const parsed = updateUserByNamesSchema.safeParse(req.body);
        if (!parsed.success) {
            return res
                .status(400)
                .json({
                    error: "Validación fallida",
                    details: parsed.error.flatten().fieldErrors,
                });
        }
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json("Unauthorized access");
        if (user.role !== "ADMIN") return res.status(403).json("Forbidden");
        try {
            const name = req.params.name as string;
            const response = await this.userService.updateUserByName(name, parsed.data);
            return res.status(200).json(response);
        } catch (e: any) {
            logger.error("Error update-by-name", {
                name: req.params.name,
                message: e?.message,
                stack: e?.stack,
            });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }

    async updatePassword(req: Request, res: Response) {
        const parsed = updatePasswordSchema.safeParse(req.body);
        if (!parsed.success) {
            return res
                .status(400)
                .json({
                    error: "Validación fallida",
                    details: parsed.error.flatten().fieldErrors,
                });
        }
        const { user } = req as AuthRequest;
        if (!user) return res.status(401).json({ error: "Unauthorized access" });
        if (!["ADMIN", "COORDINATOR", "FISCAL", "SUPERVISOR"].includes(user.role)) {
            return res.status(403).json({ error: "Forbidden role" });
        }
        try {
            const userId = req.params.id;
            const response = await this.userService.updatePassword(userId, parsed.data.password);
            return res.status(200).json(response);
        } catch (e: any) {
            logger.error("Error update-password", {
                userId: req.params.id,
                message: e?.message,
                stack: e?.stack,
            });
            return res.status(500).json({ error: "Error interno del servidor" });
        }
    }
}
