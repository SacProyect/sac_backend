import { BaseError } from './BaseError';

export class NotFoundError extends BaseError {
  public readonly statusCode = 404;
  public readonly code = 'NOT_FOUND';

  constructor(message: string = 'Recurso no encontrado', details?: any) {
    super(message, details);
  }
}
