import { describe, it, expect, vi } from 'vitest';
import { globalErrorHandler } from '../../utils/error-handler';
import { NotFoundError } from '../../core/errors/NotFoundError';
import { Request, Response } from 'express';

describe('Global Error Handler Integration', () => {
  it('should return structured JSON for BaseError instances', () => {
    const req = { requestId: 'test-req-id', headers: {}, ip: '127.0.0.1' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    const error = new NotFoundError('Not Found Test', { field: 'id' });

    globalErrorHandler(error, req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Not Found Test',
        requestId: 'test-req-id',
        details: { field: 'id' },
      },
    });
  });

  it('should return internal error for generic Error instances', () => {
    const req = { requestId: 'test-req-id', headers: {}, ip: '127.0.0.1' } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as unknown as Response;
    const next = vi.fn();

    const error = new Error('Generic Error');

    globalErrorHandler(error as any, req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({
        code: 'INTERNAL_ERROR',
        requestId: 'test-req-id',
      }),
    }));
  });
});
