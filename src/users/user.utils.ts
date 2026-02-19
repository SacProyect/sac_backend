import { JwtPayload, sign, verify, JsonWebTokenError, TokenExpiredError } from "jsonwebtoken"
import { NextFunction, Request, Response } from "express"
import { hash } from "bcryptjs";
import { Taxpayer } from "../taxpayer/taxpayer.utils";
import { Taxpayer_Fases, user_roles } from "@prisma/client";
import logger from "../utils/logger";
import { db } from "../utils/db.server";

import * as dotenv from "dotenv";
import path from "path";

// Cargar variables de entorno
dotenv.config({ 
    path: path.resolve(__dirname, "../../.env"),
    override: true 
});

const TOKEN_SECRET = process.env.TOKEN_SECRET as string


export interface AuthRequest extends Request {
    user?: { id: string; role: string }; // Store user ID and role
}

export type AuthUser = {
    id: string;
    role: string;
};

export type User = {
    id: string;
    personId: number;
    name: string;
    role: string;
    supervised_members?: User[],
    taxpayer?: Taxpayer[];
    // fase?: Taxpayer_Fases;
};

export type UpdateUserByNameInput = {
    name: string,
    data: DataUserByNameInput,
}

export type DataUserByNameInput = {
    name?: string;
    personId?: string;
    email?: string;
}



export type NewUserInput = {
    id: string;
    personId: number;
    name: string;
    role: user_roles;
    password: string;
}

export interface AuthRequest extends Request {
    token: string | JwtPayload;
}

export const generateAcessToken = (user: User) => {
    return sign(
        {
            type: user.role,
            user: user.id,
        },
        TOKEN_SECRET,
    )
}

/** Header oculto para debug: si está presente y DEBUG_AUTH=true, se salta JWT y se usa el usuario indicado en debugUserId */
const DEBUG_AUTH_HEADER = "x-debug-auth";
const DEBUG_USER_ID_HEADER = "x-debug-user-id";
const DEBUG_USER_ID_QUERY = "debugUserId";

export const authenticateToken = (req: Request, res: Response, next: NextFunction) => {
    const requestId = (req as any).requestId;

    try {
        // Debug: saltar JWT y usar usuario por ID (solo si DEBUG_AUTH está habilitado en env)
        if (process.env.DEBUG_AUTH === "true" && req.headers[DEBUG_AUTH_HEADER]) {
            const debugUserId =
                (req.headers[DEBUG_USER_ID_HEADER] as string) ||
                (req.query[DEBUG_USER_ID_QUERY] as string);
            if (debugUserId) {
                const run = async () => {
                    const user = await db.user.findUnique({
                        where: { id: debugUserId },
                        select: { id: true, role: true },
                    });
                    if (user) {
                        (req as AuthRequest).user = { id: user.id, role: user.role };
                        logger.debug("[AUTH] Debug: usuario impersonado", { id: user.id, role: user.role });
                        next();
                    } else {
                        return res.status(404).json({
                            success: false,
                            error: {
                                code: "NOT_FOUND",
                                message: "Usuario no encontrado para debug.",
                                requestId,
                            },
                        });
                    }
                };
                run().catch((err) => {
                    logger.error("[AUTH] Error en debug auth", { message: err?.message, requestId });
                    return res.status(500).json({
                        success: false,
                        error: {
                            code: "INTERNAL_ERROR",
                            message: "Error al cargar usuario de debug.",
                            requestId,
                        },
                    });
                });
                return;
            }
        }

        const authHeader = req.headers["authorization"];
        const token = authHeader && authHeader.split(" ")[1];

        if (!token) {
            logger.warn('[AUTH] Petición sin token', {
                path: req.originalUrl,
                method: req.method,
                ip: req.ip || req.headers['x-forwarded-for'],
                userAgent: req.headers['user-agent']?.substring(0, 100),
                requestId,
            });
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Acceso denegado. No se proporcionó token.',
                    requestId,
                },
            });
        }

        // Verificar que TOKEN_SECRET esté configurado
        if (!TOKEN_SECRET) {
            logger.error('[AUTH] TOKEN_SECRET no configurado en variables de entorno');
            return res.status(500).json({
                success: false,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Error de configuración del servidor.',
                    requestId,
                },
            });
        }

        const decoded = verify(token, TOKEN_SECRET) as { type: string; user: string };

        if (!decoded || !decoded.user || !decoded.type) {
            logger.warn('[AUTH] Token con payload inválido', {
                path: req.originalUrl,
                requestId,
            });
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Token inválido.',
                    requestId,
                },
            });
        }

        // Adjuntar datos del usuario al request
        (req as AuthRequest).user = { id: decoded.user, role: decoded.type };

        next();
    } catch (error) {
        // Errores específicos de JWT para dar mensajes más claros
        if (error instanceof TokenExpiredError) {
            logger.warn('[AUTH] Token expirado', {
                path: req.originalUrl,
                requestId,
                expiredAt: error.expiredAt,
            });
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'La sesión ha expirado. Inicie sesión nuevamente.',
                    requestId,
                },
            });
        }

        if (error instanceof JsonWebTokenError) {
            logger.warn('[AUTH] Token malformado o inválido', {
                path: req.originalUrl,
                requestId,
                errorMessage: error.message,
            });
            return res.status(401).json({
                success: false,
                error: {
                    code: 'UNAUTHORIZED',
                    message: 'Token inválido. Inicie sesión nuevamente.',
                    requestId,
                },
            });
        }

        // Error inesperado
        logger.error('[AUTH] Error inesperado al autenticar', {
            message: (error as Error).message,
            stack: (error as Error).stack,
            path: req.originalUrl,
            requestId,
        });
        return res.status(401).json({
            success: false,
            error: {
                code: 'UNAUTHORIZED',
                message: 'Error al verificar credenciales.',
                requestId,
            },
        });
    }
};


export const passwordHashing = async (password: string) => {
    const hashedPassword = await hash(password, 10)
    return hashedPassword
}