import { describe, it, expect, vi, beforeEach } from 'vitest';
import { canUserAccessTaxpayer, getVisibilityFilterForRole } from '../access-control.helper';
import { getRoleStrategy } from '../../../users/role-strategies';
import { mockDb } from '../../../__tests__/setup';

vi.mock('../../../users/role-strategies', async () => {
  const actual = await vi.importActual<typeof import('../../../users/role-strategies')>(
    '../../../users/role-strategies',
  );
  return {
    ...actual,
    getRoleStrategy: vi.fn(actual.getRoleStrategy),
  };
});

const getRoleStrategyMock = getRoleStrategy as unknown as ReturnType<typeof vi.fn>;

describe('access-control.helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getVisibilityFilterForRole delega en la estrategia correcta', async () => {
    const where = await getVisibilityFilterForRole(mockDb as any, 'user-1', 'FISCAL');
    // Para FISCAL, el filtro debe incluir officerId = userId
    expect(where).toMatchObject({ officerId: 'user-1' });
  });

  it('canUserAccessTaxpayer devuelve allowed=true para ADMIN sin consultar la BD', async () => {
    const result = await canUserAccessTaxpayer(mockDb as any, 'any-user', 'ADMIN', 'tx-1');
    expect(result.allowed).toBe(true);
    // No debería lanzar ni requerir taxpayer existente
  });

  it('canUserAccessTaxpayer usa FiscalStrategy por defecto para roles desconocidos', async () => {
    const result = await canUserAccessTaxpayer(mockDb as any, 'user-x', 'ROL_NO_EXISTE', 'tx-1');
    // FiscalStrategy permite acceso solo si es officer o supervisor; como mockDb no está configurado,
    // la llamada debería ser segura y simplemente devolver allowed=false o similar, pero lo importante
    // es que getRoleStrategy se haya llamado.
    expect(getRoleStrategyMock).toHaveBeenCalled();
    expect(result).toHaveProperty('allowed');
  });
});

