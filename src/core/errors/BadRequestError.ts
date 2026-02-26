import { BaseError } from './BaseError';

export class BadRequestError extends BaseError {
  public readonly statusCode = 400;
  public readonly code = 'BAD_REQUEST';

  constructor(message: string = 'Petición inválida', details?: any) {
    super(message, details);
  }
}
