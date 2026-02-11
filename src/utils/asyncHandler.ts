import { Request, Response, NextFunction } from 'express';

/**
 * Wrapper para rutas async de Express.
 * Captura automáticamente cualquier error no manejado en un handler async
 * y lo pasa a next() para que lo atrape el globalErrorHandler.
 *
 * Uso:
 *   router.get('/ruta', asyncHandler(async (req, res) => { ... }));
 *
 * Sin este wrapper, un throw dentro de un async handler deja la petición
 * colgada (nunca envía respuesta), lo que causa timeouts en el cliente.
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
