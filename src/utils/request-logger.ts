import { Request, Response, NextFunction } from 'express';
import logger from './logger';

/**
 * Middleware de logging de peticiones HTTP.
 * Registra cada petición con su requestId para correlación completa.
 *
 * Incluye:
 * - Método, ruta, status code, duración
 * - IP, User-Agent (para diagnosticar problemas por dispositivo)
 * - Request ID (para correlacionar con errores del frontend)
 * - User ID autenticado (si aplica)
 * - Versión del cliente (si el frontend lo envía)
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();

    // Capturar cuando se envía la respuesta
    res.on('finish', () => {
        const duration = Date.now() - start;
        const requestId = (req as any).requestId;
        const userId = (req as any).user?.id;

        const logData = {
            method: req.method,
            path: req.originalUrl,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip || req.headers['x-forwarded-for'],
            userAgent: req.headers['user-agent']?.substring(0, 150),
            requestId,
            ...(userId && { userId }),
            ...(req.headers['x-client-version'] && { clientVersion: req.headers['x-client-version'] }),
            // Tamaño de la respuesta (útil para diagnosticar respuestas enormes)
            responseSize: res.getHeader('content-length'),
        };

        // Log level según el status code y duración
        if (res.statusCode >= 500) {
            logger.error('[HTTP]', logData);
        } else if (res.statusCode >= 400) {
            logger.warn('[HTTP]', logData);
        } else if (duration > 3000) {
            // Requests lentos (>3s) como warning
            logger.warn('[HTTP_SLOW]', logData);
        } else {
            logger.info('[HTTP]', logData);
        }
    });

    next();
}
