import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ObservationService } from '../observation.service';
import type { NewObservation } from '../../taxpayer-utils';
import { mockTaxpayerRepository } from '../../../__tests__/setup';

describe('ObservationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockTaxpayerRepository.createObservation as any)?.mockResolvedValue({ id: 'obs-1' });
  });

  it('create crea una observación con los datos correctos', async () => {
    const input: NewObservation = {
      description: 'Observación de prueba',
      date: new Date().toISOString(),
      taxpayerId: 'taxpayer-1',
    };

    const result = await ObservationService.create(input);

    expect(result).toMatchObject({ id: 'obs-1' });
    expect(mockTaxpayerRepository.createObservation).toHaveBeenCalledTimes(1);
  });
});

