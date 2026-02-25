import { IAppError } from './baseError.interface';

export abstract class BaseError extends Error implements IAppError {
  public abstract readonly statusCode: number;
  public abstract readonly code: string;

  constructor(
    message: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}
