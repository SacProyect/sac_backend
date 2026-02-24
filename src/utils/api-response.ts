import { Response } from 'express';

/**
 * Formato estandarizado para TODAS las respuestas de error de la API.
 * 
 * Esto resuelve el problema de que el frontend recibía a veces un string,
 * a veces { error: "..." }, a veces { message: "..." }, haciendo imposible
 * parsear errores de forma confiable en diferentes dispositivos/clientes.
 *
 * Formato de respuesta de error:
 * {
 *   success: false,
 *   error: {
 *     code: "ERROR_CODE",
 *     message: "Mensaje para el usuario",
 *     requestId: "uuid-v4",         // Para correlacionar con logs
 *     details?: any                   // Solo en desarrollo
 *   }
 * }
 */

export interface ApiErrorBody {
    success: false;
    error: {
        code: string;
        message: string;
        requestId?: string;
        details?: unknown;
    };
}

export interface ApiSuccessBody<T = unknown> {
    success: true;
    data: T;
}

// Códigos de error estandarizados
export const ErrorCodes = {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    BAD_REQUEST: 'BAD_REQUEST',
    DATABASE_ERROR: 'DATABASE_ERROR',
    EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
    RATE_LIMIT: 'RATE_LIMIT',
    TIMEOUT: 'TIMEOUT',
} as const;

type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];

/**
 * Enviar respuesta de error estandarizada.
 * Incluye el requestId del middleware de correlación para rastreo.
 */
export function sendError(
    res: Response,
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: unknown
): Response {
    const requestId = (res.req as any)?.requestId as string | undefined;
    const isDev = process.env.NODE_ENV === 'development';

    const errorObj: ApiErrorBody['error'] = { code, message };

    if (requestId) {
        errorObj.requestId = requestId;
    }
    if (isDev && details) {
        errorObj.details = details;
    }

    const body: ApiErrorBody = { success: false, error: errorObj };

    return res.status(statusCode).json(body);
}

/** Atajos para los códigos HTTP más comunes */
export const ApiError = {
    badRequest: (res: Response, message = 'Solicitud inválida', details?: unknown) =>
        sendError(res, 400, ErrorCodes.BAD_REQUEST, message, details),

    validation: (res: Response, details: unknown, message = 'Validación fallida') =>
        sendError(res, 400, ErrorCodes.VALIDATION_ERROR, message, details),

    unauthorized: (res: Response, message = 'No autorizado') =>
        sendError(res, 401, ErrorCodes.UNAUTHORIZED, message),

    forbidden: (res: Response, message = 'Acceso denegado') =>
        sendError(res, 403, ErrorCodes.FORBIDDEN, message),

    notFound: (res: Response, message = 'Recurso no encontrado') =>
        sendError(res, 404, ErrorCodes.NOT_FOUND, message),

    conflict: (res: Response, message = 'Conflicto con el estado actual', details?: unknown) =>
        sendError(res, 409, ErrorCodes.CONFLICT, message, details),

    internal: (res: Response, message = 'Error interno del servidor', details?: unknown) =>
        sendError(res, 500, ErrorCodes.INTERNAL_ERROR, message, details),

    database: (res: Response, message = 'Error de base de datos', details?: unknown) =>
        sendError(res, 500, ErrorCodes.DATABASE_ERROR, message, details),

    externalService: (res: Response, message = 'Error en servicio externo', details?: unknown) =>
        sendError(res, 502, ErrorCodes.EXTERNAL_SERVICE_ERROR, message, details),
};
