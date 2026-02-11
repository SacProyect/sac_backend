import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Middleware de ID de correlación (Request ID).
 *
 * Asigna un UUID único a cada petición entrante, lo cual permite:
 * 1. Rastrear una petición del frontend al backend y viceversa
 * 2. Correlacionar logs de BetterStack con reportes de error de usuarios
 * 3. Diagnosticar por qué un endpoint falla para un usuario pero no para otro
 *
 * El ID se envía de vuelta al cliente en el header `X-Request-Id`,
 * para que el frontend pueda incluirlo en reportes de error.
 *
 * Si el cliente ya envía un header `X-Request-Id` (ej: desde el frontend),
 * se reutiliza para mantener la correlación end-to-end.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
    // Reutilizar el ID del cliente si viene, o generar uno nuevo
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();

    // Adjuntar al request para uso interno (logging, error handler, etc.)
    (req as any).requestId = requestId;

    // Enviar al cliente para correlación
    res.setHeader('X-Request-Id', requestId);

    next();
}
