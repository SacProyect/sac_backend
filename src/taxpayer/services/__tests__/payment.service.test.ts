import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentService } from '../payment.service';
import type { NewPayment } from '../../taxpayer-utils';
import { mockTaxpayerRepository } from '../../../__tests__/setup';

describe('PaymentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validatePayment lanza error si el evento no existe', async () => {
    (mockTaxpayerRepository.findEventById as any).mockResolvedValueOnce(null);

    await expect(PaymentService.validatePayment('event-1', 100)).rejects.toThrow(
      'Event not found',
    );
  });

  it('create lanza error si el monto excede la deuda', async () => {
    const input: NewPayment = {
      date: new Date(),
      amount: 200 as any,
      eventId: 'event-1',
      taxpayerId: 'taxpayer-1',
      debt: 0 as any,
    };

    (mockTaxpayerRepository.findEventById as any).mockResolvedValueOnce({
      id: 'event-1',
      debt: 100 as any,
    } as any);

    await expect(PaymentService.create(input)).rejects.toThrow(
      "Payment can't be greater than debt",
    );
  });
});

