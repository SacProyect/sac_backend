import { Request, Response, NextFunction } from 'express';
import logger from './logger';
import { BaseError } from '../core/errors/BaseError';

/**
 * Middleware para rutas no encontradas (404).
 * Se registra DESPUÉS de todas las rutas válidas.
 */
export function notFoundHandler(req: Request, res: Response) {
    const requestId = (req as any).requestId;

    logger.warn('[404] Ruta no encontrada', {
        method: req.method,
        path: req.originalUrl,
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent']?.substring(0, 150),
        requestId,
    });

    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
            requestId,
        },
    });
}

/**
 * Middleware global de errores (DEBE tener 4 parámetros para que Express lo reconozca).
 *
 * Este handler atrapa TODOS los errores no manejados, incluyendo:
 * - Errores lanzados por asyncHandler
 * - Errores de JSON malformado en el body
 * - Errores de CORS
 * - Errores de Prisma (base de datos)
 * - Cualquier throw inesperado
 *
 * Loguea todo con contexto completo para poder diagnosticar problemas
 * que solo ocurren para ciertos usuarios/dispositivos/clientes.
 */
export function globalErrorHandler(err: Error & { status?: number; statusCode?: number; type?: string; code?: string }, req: Request, res: Response, _next: NextFunction) {
    const requestId = (req as any).requestId;

    // ── Errores de JSON malformado ───────────────────────────────────────
    // Estos ocurren cuando el cliente envía un body que no es JSON válido.
    // Común en dispositivos móviles con encodings diferentes.
    if (err.type === 'entity.parse.failed') {
        logger.warn('[BAD_JSON] Body con JSON malformado', {
            method: req.method,
            path: req.originalUrl,
            requestId,
            userAgent: req.headers['user-agent']?.substring(0, 150),
        });

        return res.status(400).json({
            success: false,
            error: {
                code: 'BAD_REQUEST',
                message: 'El cuerpo de la petición contiene JSON inválido',
                requestId,
            },
        });
    }

    // ── Errores de payload demasiado grande ──────────────────────────────
    if (err.type === 'entity.too.large') {
        logger.warn('[PAYLOAD_TOO_LARGE] Body excede el límite', {
            method: req.method,
            path: req.originalUrl,
            requestId,
        });

        return res.status(413).json({
            success: false,
            error: {
                code: 'BAD_REQUEST',
                message: 'El cuerpo de la petición es demasiado grande (máximo 10MB)',
                requestId,
            },
        });
    }

    // ── Errores de Prisma (base de datos) ────────────────────────────────
    if (err.code?.startsWith('P')) {
        logger.error('[DATABASE_ERROR] Error de Prisma', {
            code: err.code,
            message: err.message,
            method: req.method,
            path: req.originalUrl,
            requestId,
        });

        return res.status(500).json({
            success: false,
            error: {
                code: 'DATABASE_ERROR',
                message: 'Error de base de datos. Intente de nuevo.',
                requestId,
                ...(process.env.NODE_ENV === 'development' && { details: err.message }),
            },
        });
    }

    // ── Errores de Aplicación Estandarizados (BaseError) ────────────────
    if (err instanceof BaseError) {
        return res.status(err.statusCode).json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                requestId,
                ...(err.details && { details: err.details }),
            },
        });
    }

    // ── Error genérico ───────────────────────────────────────────────────
    const statusCode = err.status || err.statusCode || 500;

    logger.error('[UNHANDLED_ERROR]', {
        message: err.message,
        stack: err.stack,
        name: err.name,
        method: req.method,
        path: req.originalUrl,
        requestId,
        ip: req.ip || req.headers['x-forwarded-for'],
        userAgent: req.headers['user-agent']?.substring(0, 150),
        userId: (req as any).user?.id,
        userRole: (req as any).user?.role,
    });

    // Nunca filtrar el stack en producción
    const isDev = process.env.NODE_ENV === 'development';

    res.status(statusCode).json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: statusCode >= 500
                ? 'Error interno del servidor. Si el problema persiste, contacte al administrador.'
                : err.message,
            requestId,
            ...(isDev && { details: err.stack }),
        },
    });
}
