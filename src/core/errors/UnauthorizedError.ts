import { BaseError } from './BaseError';

export class UnauthorizedError extends BaseError {
  public readonly statusCode = 401;
  public readonly code = 'UNAUTHORIZED';

  constructor(message: string = 'No autorizado', details?: any) {
    super(message, details);
  }
}
