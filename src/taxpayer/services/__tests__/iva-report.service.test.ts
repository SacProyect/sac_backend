import { describe, it, expect } from 'vitest';
import { IvaReportService } from '../iva-report.service';

describe('IvaReportService', () => {
  it('calculateExcess calcula correctamente el exceso de IVA', () => {
    expect(IvaReportService.calculateExcess(100, 150)).toBe(50);
    expect(IvaReportService.calculateExcess(200, 150)).toBe(0);
  });
});

