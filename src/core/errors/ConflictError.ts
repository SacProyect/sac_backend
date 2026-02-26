import { BaseError } from './BaseError';

export class ConflictError extends BaseError {
  public readonly statusCode = 409;
  public readonly code = 'CONFLICT';

  constructor(message: string = 'Conflicto en el recurso', details?: any) {
    super(message, details);
  }
}
