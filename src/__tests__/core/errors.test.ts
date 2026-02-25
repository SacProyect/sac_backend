import { describe, it, expect } from 'vitest';
import { NotFoundError } from '../../core/errors/NotFoundError';
import { BadRequestError } from '../../core/errors/BadRequestError';
import { ConflictError } from '../../core/errors/ConflictError';
import { UnauthorizedError } from '../../core/errors/UnauthorizedError';
import { ForbiddenError } from '../../core/errors/ForbiddenError';
import { BaseError } from '../../core/errors/BaseError';

describe('Error Classes', () => {
  it('NotFoundError should have correct properties', () => {
    const error = new NotFoundError('User not found', { id: 123 });
    expect(error).toBeInstanceOf(BaseError);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('User not found');
    expect(error.details).toEqual({ id: 123 });
  });

  it('BadRequestError should have correct properties', () => {
    const error = new BadRequestError();
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe('BAD_REQUEST');
  });

  it('ConflictError should have correct properties', () => {
    const error = new ConflictError();
    expect(error.statusCode).toBe(409);
    expect(error.code).toBe('CONFLICT');
  });

  it('UnauthorizedError should have correct properties', () => {
    const error = new UnauthorizedError();
    expect(error.statusCode).toBe(401);
    expect(error.code).toBe('UNAUTHORIZED');
  });

  it('ForbiddenError should have correct properties', () => {
    const error = new ForbiddenError();
    expect(error.statusCode).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });
});
