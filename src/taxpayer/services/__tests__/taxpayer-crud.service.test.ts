import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaxpayerCrudService } from '../taxpayer-crud.service';
import type { NewTaxpayer, NewTaxpayerExcelInput } from '../../taxpayer-utils';
import { mockDb, mockTaxpayerRepository } from '../../../__tests__/setup';

describe('TaxpayerCrudService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset behaviour por defecto de mocks relevantes
    (mockTaxpayerRepository.findByRif as any)?.mockResolvedValue(null);
    (mockTaxpayerRepository.findTaxpayersByNameOrProvidenceNum as any)?.mockResolvedValue([]);
    (mockTaxpayerRepository.createTaxpayer as any)?.mockResolvedValue({
      id: 'taxpayer-1',
      name: 'ACME C.A.',
      rif: 'J123456789',
    });
    (mockTaxpayerRepository.createInvestigationPdfs as any)?.mockResolvedValue(undefined);
    (mockTaxpayerRepository.createTaxpayerFromExcel as any)?.mockResolvedValue({
      id: 'taxpayer-2',
      name: 'IMPORTADORA XYZ',
      rif: 'J987654321',
    });
  });

  it('create lanza error si no se envían PDFs', async () => {
    const input: NewTaxpayer = {
      providenceNum: BigInt(1),
      process: 'AF',
      name: 'ACME C.A.',
      rif: 'J123456789',
      emition_date: new Date(),
      contract_type: 'ORDINARY',
      officerId: 'officer-1',
      address: 'Caracas',
      pdfs: [],
      categoryId: 'cat-1',
      parishId: 'parish-1',
    };

    await expect(TaxpayerCrudService.create(input)).rejects.toThrow(
      'At least one PDF must be uploaded.',
    );
  });

  it('create lanza error si el RIF ya existe', async () => {
    (mockTaxpayerRepository.findByRif as any).mockResolvedValueOnce({ id: 'existing' } as any);

    const input: NewTaxpayer = {
      providenceNum: BigInt(1),
      process: 'AF',
      name: 'ACME C.A.',
      rif: 'J123456789',
      emition_date: new Date(),
      contract_type: 'ORDINARY',
      officerId: 'officer-1',
      address: 'Caracas',
      pdfs: [{ pdf_url: 'https://s3/p1.pdf' }],
      categoryId: 'cat-1',
      parishId: 'parish-1',
    };

    await expect(TaxpayerCrudService.create(input)).rejects.toThrow(
      `Ya existe un contribuyente activo con el RIF ${input.rif}.`,
    );
  });

  it('create crea el contribuyente y PDFs cuando los datos son válidos', async () => {
    const input: NewTaxpayer = {
      providenceNum: BigInt(1),
      process: 'AF',
      name: 'ACME C.A.',
      rif: 'J123456789',
      emition_date: new Date(),
      contract_type: 'ORDINARY',
      officerId: 'officer-1',
      address: 'Caracas',
      pdfs: [{ pdf_url: 'https://s3/p1.pdf' }],
      categoryId: 'cat-1',
      parishId: 'parish-1',
      userId: 'fiscal-1',
      role: 'FISCAL',
    };

    const result = await TaxpayerCrudService.create(input);

    expect(result).toMatchObject({
      id: 'taxpayer-1',
      name: 'ACME C.A.',
      rif: 'J123456789',
    });
  });

  it('update solo propaga campos permitidos al update de Prisma', async () => {
    (mockDb.taxpayer.update as any).mockResolvedValueOnce({
      id: 'taxpayer-1',
      name: 'Nuevo Nombre',
    } as any);

    const result = await TaxpayerCrudService.update(
      'taxpayer-1',
      {
        name: 'Nuevo Nombre',
        rif: 'J123456789',
        address: 'Nueva dirección',
        unknownField: 'no debe pasar',
      } as any,
      'admin-id',
      'ADMIN',
    );

    expect(mockDb.taxpayer.update).toHaveBeenCalledTimes(1);
    const call = (mockDb.taxpayer.update as any).mock.calls[0][0];
    expect(call.where).toEqual({ id: 'taxpayer-1' });
    expect(call.data).toMatchObject({
      name: 'Nuevo Nombre',
      rif: 'J123456789',
      address: 'Nueva dirección',
    });
    expect((call.data as any).unknownField).toBeUndefined();
    expect(result).toMatchObject({ id: 'taxpayer-1', name: 'Nuevo Nombre' });
  });

  it('createTaxpayerExcel lanza error si falta officerId', async () => {
    const input: NewTaxpayerExcelInput = {
      providenceNum: BigInt(1),
      process: 'AF',
      name: 'ACME C.A.',
      rif: 'J123456789',
      emition_date: new Date(),
      contract_type: 'ORDINARY',
      officerName: 'Fiscal X',
      address: 'Caracas',
      categoryId: 'cat-1',
      parishId: 'parish-1',
    };

    await expect(TaxpayerCrudService.createTaxpayerExcel(input)).rejects.toThrow(
      'El ID del oficial es requerido',
    );
  });
});

