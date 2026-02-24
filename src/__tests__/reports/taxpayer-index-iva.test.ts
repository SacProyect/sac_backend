import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb } from "../setup";
import * as Service from "../../reports/taxpayer-index-iva.services";

describe("TaxpayerIndexIva CRUD Services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. Crear índice personalizado para un contribuyente -> Se crea registro con active: true", async () => {
    const input = {
      taxpayerId: "tp-1",
      baseAmount: 150,
      assignedById: "user-1",
    };
    
    (mockDb.taxpayer.findUnique as any).mockResolvedValue({ id: "tp-1" });
    (mockDb.taxpayerIndexIva.updateMany as any).mockResolvedValue({ count: 1 });
    (mockDb.taxpayerIndexIva.create as any).mockResolvedValue({
      id: "idx-1",
      base_amount: 150,
      taxpayerId: "tp-1",
      active: true,
      assignedBy: { name: "Admin" },
      taxpayer: { name: "Taxpayer", rif: "J-1" }
    });

    const result = await Service.createTaxpayerIndexIva(input);

    expect(result.active).toBe(true);
    expect(mockDb.taxpayerIndexIva.updateMany).toHaveBeenCalledWith({
      where: { taxpayerId: "tp-1", active: true },
      data: { active: false }
    });
    expect(mockDb.taxpayerIndexIva.create).toHaveBeenCalled();
  });

  it("2. Crear segundo índice -> desactiva el anterior", async () => {
    // This is essentially covered by Case 1's mock of updateMany
    const input = { taxpayerId: "tp-1", baseAmount: 200, assignedById: "u-1" };
    (mockDb.taxpayer.findUnique as any).mockResolvedValue({ id: "tp-1" });
    (mockDb.taxpayerIndexIva.create as any).mockResolvedValue({ id: "idx-2" });

    await Service.createTaxpayerIndexIva(input);
    
    expect(mockDb.taxpayerIndexIva.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { taxpayerId: "tp-1", active: true } })
    );
  });

  it("3. Obtener índice activo de un contribuyente -> Devuelve solo el activo y vigente", async () => {
    const activeIdx = { id: "idx-1", active: true, expires_at: null };
    (mockDb.taxpayerIndexIva.findFirst as any).mockResolvedValue(activeIdx);

    const result = await Service.getActiveTaxpayerIndexIva("tp-1");
    expect(result).toEqual(activeIdx);
    expect(mockDb.taxpayerIndexIva.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ active: true, taxpayerId: "tp-1" })
      })
    );
  });

  it("4. Obtener índice de contribuyente sin uno personalizado -> Devuelve null", async () => {
    (mockDb.taxpayerIndexIva.findFirst as any).mockResolvedValue(null);
    const result = await Service.getActiveTaxpayerIndexIva("tp-none");
    expect(result).toBeNull();
  });

  it("5. Desactivar un índice -> active: false", async () => {
    (mockDb.taxpayerIndexIva.findUnique as any).mockResolvedValue({ id: "idx-1" });
    (mockDb.taxpayerIndexIva.update as any).mockResolvedValue({ id: "idx-1", active: false });

    const result = await Service.deactivateTaxpayerIndexIva("idx-1");
    expect(result.active).toBe(false);
    expect(mockDb.taxpayerIndexIva.update).toHaveBeenCalledWith({
      where: { id: "idx-1" },
      data: { active: false }
    });
  });

  it("6. Historial muestra todos (activos e inactivos) -> Lista ordenada por created_at DESC", async () => {
    const history = [{ id: "2" }, { id: "1" }];
    (mockDb.taxpayerIndexIva.findMany as any).mockResolvedValue(history);

    const result = await Service.getTaxpayerIndexIvaHistory("tp-1");
    expect(result).toHaveLength(2);
    expect(mockDb.taxpayerIndexIva.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { created_at: "desc" } })
    );
  });

  it("7. Índice con expires_at pasado no se retorna como activo -> findFirst query includes date filter", async () => {
    // The service implementation uses findFirst with a filter for expires_at
    await Service.getActiveTaxpayerIndexIva("tp-1");
    const callArgs = (mockDb.taxpayerIndexIva.findFirst as any).mock.calls[0][0];
    
    // Check OR condition for expires_at
    const orCond = callArgs.where.OR;
    expect(orCond).toContainEqual({ expires_at: null });
    expect(orCond).toContainEqual(expect.objectContaining({ expires_at: { gt: expect.any(Date) } }));
  });

  it("8. Validación: base_amount debe ser > 0 -> Error de validación", async () => {
    await expect(Service.createTaxpayerIndexIva({
      taxpayerId: "tp-1",
      baseAmount: 0,
      assignedById: "u-1"
    })).rejects.toThrow("El monto base del índice IVA debe ser mayor a 0.");
    
    await expect(Service.createTaxpayerIndexIva({
      taxpayerId: "tp-1",
      baseAmount: -10,
      assignedById: "u-1"
    })).rejects.toThrow("El monto base del índice IVA debe ser mayor a 0.");
  });

  it("9. Validación: taxpayerId debe existir -> Error si no se encuentra", async () => {
    (mockDb.taxpayer.findUnique as any).mockResolvedValue(null);
    await expect(Service.createTaxpayerIndexIva({
      taxpayerId: "non-existent",
      baseAmount: 100,
      assignedById: "u-1"
    })).rejects.toThrow("El contribuyente no existe.");
  });
});
