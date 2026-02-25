import { BaseError } from './BaseError';

export class ForbiddenError extends BaseError {
  public readonly statusCode = 403;
  public readonly code = 'FORBIDDEN';

  constructor(message: string = 'Acceso prohibido', details?: any) {
    super(message, details);
  }
}
