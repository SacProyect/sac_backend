/**
 * Tests: Módulo de Carga de IVA para Fiscales
 *
 * Cubre los bugs identificados:
 *  - BUG-IVA-01: iva=0 (falsy) era rechazado por la ruta con 400
 *  - BUG-IVA-02: Error de permisos devolvía 500 en vez de 403
 *  - BUG-IVA-03: Mensaje de duplicado en español no era detectado (→ conflict)
 *  - BUG-IVA-04: Fiscal sin groupId al que no le pertenece el contribuyente
 *  - BUG-IVA-05: Fiscal que ES el officerId puede crear sin problemas
 *  - BUG-IVA-06: Fiscal como supervisor actual puede crear
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { sign } from "jsonwebtoken";
import { Decimal } from "@prisma/client/runtime/library";
import app from "../../app";
import { mockDb } from "../setup";
import * as TaxpayerServices from "../../taxpayer/taxpayer-services";

const TOKEN_SECRET = process.env.TOKEN_SECRET || "test-secret-for-routes";
const TAXPAYER_ID = "taxpayer-iva-test-001";

/** Genera un JWT firmado con el rol y userId dados */
function makeToken(role: string, userId = "user-test-1") {
  return sign({ type: role, user: userId }, TOKEN_SECRET);
}

/** Payload base IVA válido */
const validIvaPayload = {
  taxpayerId: TAXPAYER_ID,
  purchases: "5000",
  sells: "8000",
  paid: "1000",
  date: "2025-06-01T00:00:00.000Z",
  iva: "20",
  excess: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 1 — Tests de RUTA (HTTP layer)
// ─────────────────────────────────────────────────────────────────────────────
describe("IVA Fiscal — Ruta POST /taxpayer/createIVA", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Autenticación ──────────────────────────────────────────────────────────
  describe("Autenticación", () => {
    it("401 — sin token", async () => {
      const res = await request(app)
        .post("/taxpayer/createIVA")
        .send(validIvaPayload);
      expect(res.status).toBe(401);
    });

    it("401 — token inválido", async () => {
      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", "Bearer token-falso-xyz")
        .send(validIvaPayload);
      expect(res.status).toBe(401);
    });

    it("403 — rol no autorizado (ej: rol desconocido)", async () => {
      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("UNKNOWN_ROLE")}`)
        .send(validIvaPayload);
      expect(res.status).toBe(403);
    });
  });

  // ── Validación de campos ───────────────────────────────────────────────────
  describe("Validación express-validator", () => {
    it("400 — falta taxpayerId", async () => {
      const { taxpayerId, ...withoutId } = validIvaPayload;
      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("ADMIN")}`)
        .send(withoutId);
      expect(res.status).toBe(400);
      expect(res.body?.errors).toBeDefined();
    });

    it("400 — date con formato inválido", async () => {
      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("ADMIN")}`)
        .send({ ...validIvaPayload, date: "no-es-fecha" });
      expect(res.status).toBe(400);
      expect(res.body?.errors).toBeDefined();
    });

    it("400 — falta tanto iva como excess (ambos null/undefined)", async () => {
      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("ADMIN")}`)
        .send({ ...validIvaPayload, iva: undefined, excess: undefined });
      expect(res.status).toBe(400);
    });
  });

  // ── BUG-IVA-01: iva=0 no debe ser rechazado ────────────────────────────────
  describe("BUG-IVA-01: iva=0 es válido (no falsy)", () => {
    it("NO debe devolver 400 cuando iva=0 y excess tiene valor", async () => {
      // Simulamos que el servicio acepta la petición
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null); // no es FISCAL
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "iva-created",
        ...validIvaPayload,
        iva: new Decimal(0),
        excess: new Decimal(50),
      });

      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("ADMIN")}`)
        .send({ ...validIvaPayload, iva: 0, excess: "50" });

      // Con el fix aplicado: iva=0 + excess="50" → NO debe ser 400
      expect(res.status).not.toBe(400);
    });

    it("NO debe devolver 400 cuando excess=0 y iva tiene valor", async () => {
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "iva-created-2",
      });

      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("ADMIN")}`)
        .send({ ...validIvaPayload, iva: "15", excess: 0 });

      expect(res.status).not.toBe(400);
    });
  });

  // ── BUG-IVA-02: Error de permisos → 403 no 500 ────────────────────────────
  describe("BUG-IVA-02: Error 403 claro cuando fiscal no tiene permisos", () => {
    it("devuelve 403 cuando el servicio lanza 'No tienes permisos'", async () => {
      const fiscalId = "fiscal-sin-acceso";

      // fiscal NO es el officerId actual del contribuyente y no tiene grupo
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        officerId: "otro-fiscal",
        user: {
          groupId: null,
          supervisor: { id: "otro-supervisor" },
        },
      });

      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("FISCAL", fiscalId)}`)
        .send(validIvaPayload);

      // Con el fix: debe ser 403 (no 500)
      expect(res.status).toBe(403);
      expect(res.body?.error).toMatch(/No tienes permisos/i);
    });
  });

  // ── BUG-IVA-03: Respuesta de conflicto en español detectada ───────────────
  describe("BUG-IVA-03: Duplicado → 409 Conflict (mensaje en español)", () => {
    it("devuelve 409 cuando ya existe un reporte IVA para ese mes", async () => {
      // Simulamos que findFirst ya tiene un reporte existente
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "iva-existente",
      });

      const res = await request(app)
        .post("/taxpayer/createIVA")
        .set("Authorization", `Bearer ${makeToken("ADMIN")}`)
        .send(validIvaPayload);

      // El servicio lanza "Ya existe un reporte IVA..." → debe ser 409
      expect(res.status).toBe(409);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BLOQUE 2 — Tests de SERVICIO (unit)
// ─────────────────────────────────────────────────────────────────────────────
describe("IVA Fiscal — Servicio createIVA (unit tests)", () => {
  const baseData = {
    taxpayerId: TAXPAYER_ID,
    purchases: "1000",
    sells: "2000",
    paid: "100",
    date: "2025-04-01T00:00:00.000Z",
    iva: "50",
    excess: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── BUG-IVA-05: Fiscal asignado puede crear ────────────────────────────────
  it("BUG-IVA-05: FISCAL que es el officerId actual puede crear reporte IVA", async () => {
    const fiscalId = "fiscal-asignado";

    (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TAXPAYER_ID,
      officerId: fiscalId, // ← es el oficial actual
      user: { groupId: null, supervisor: null },
    });
    (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "iva-new",
      ...baseData,
    });

    await expect(
      TaxpayerServices.createIVA(baseData as any, fiscalId, "FISCAL")
    ).resolves.toHaveProperty("id", "iva-new");
  });

  // ── BUG-IVA-06: Fiscal como supervisor actual puede crear ─────────────────
  it("BUG-IVA-06: FISCAL que es el supervisor actual puede crear reporte IVA", async () => {
    const supervisorId = "supervisor-actual";

    (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TAXPAYER_ID,
      officerId: "otro-fiscal",
      user: {
        groupId: null,
        supervisor: { id: supervisorId }, // ← es el supervisor actual
      },
    });
    (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "iva-supervisor",
    });

    await expect(
      TaxpayerServices.createIVA(baseData as any, supervisorId, "FISCAL")
    ).resolves.toBeDefined();
  });

  // ── BUG-IVA-04: Fiscal sin groupId y sin acceso → rechazado ──────────────
  it("BUG-IVA-04: FISCAL sin groupId que no es el official → lanza error de permisos", async () => {
    const intrusoId = "fiscal-sin-acceso";

    (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TAXPAYER_ID,
      officerId: "otro-oficial",
      user: {
        groupId: null,   // ← sin grupo
        supervisor: { id: "otro-supervisor" },
      },
    });

    await expect(
      TaxpayerServices.createIVA(baseData as any, intrusoId, "FISCAL")
    ).rejects.toThrow(/No tienes permisos/);

    // Nunca debe intentar crear el reporte
    expect(mockDb.iVAReports.create).not.toHaveBeenCalled();
  });

  // ── Fiscal en grupo del supervisor puede crear (miembro del grupo) ─────────
  it("FISCAL en grupo supervisado puede crear reporte IVA", async () => {
    const supervisorGrupoId = "sup-de-grupo";

    (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: TAXPAYER_ID,
      officerId: "oficial-del-grupo",
      user: {
        groupId: "grupo-1",
        supervisor: { id: "otro-sup" },
      },
    });

    // El grupo sí tiene al supervisor como miembro
    (mockDb.fiscalGroup.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "grupo-1",
      members: [{ supervisorId: supervisorGrupoId }],
    });

    (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "iva-grupo",
    });

    await expect(
      TaxpayerServices.createIVA(baseData as any, supervisorGrupoId, "FISCAL")
    ).resolves.toBeDefined();
  });

  // ── ADMIN no pasa por validación de permisos ────────────────────────────────
  it("ADMIN puede crear IVA sin validación de permisos", async () => {
    (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "iva-admin",
    });

    // Sin userId/userRole → no entra en la validación de permisos
    await expect(
      TaxpayerServices.createIVA(baseData as any)
    ).resolves.toHaveProperty("id", "iva-admin");

    // findUnique de taxpayer no debe llamarse (no hay rol FISCAL)
    expect(mockDb.taxpayer.findUnique).not.toHaveBeenCalled();
  });

  // ── Fecha inválida → error descriptivo ────────────────────────────────────
  it("lanza error descriptivo si la fecha es inválida", async () => {
    await expect(
      TaxpayerServices.createIVA({ ...baseData, date: "no-es-fecha" } as any)
    ).rejects.toThrow(/Fecha de reporte inválida/);

    expect(mockDb.iVAReports.create).not.toHaveBeenCalled();
  });

  // ── Duplicado → error con mes/año ─────────────────────────────────────────
  it("lanza error de duplicado con mes y año en el mensaje", async () => {
    (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "ya-existe",
    });

    // Nota: el mes exacto puede variar por offset UTC del servidor.
    // Verificamos que el mensaje mencione "Ya existe un reporte IVA" y un año en formato n/YYYY
    await expect(
      TaxpayerServices.createIVA(baseData as any)
    ).rejects.toThrow(/Ya existe un reporte IVA para este contribuyente en \d+\/2025/);

    expect(mockDb.iVAReports.create).not.toHaveBeenCalled();
  });

  // ── iva=0 debe ser aceptado por el servicio ─────────────────────────────────
  it("BUG-IVA-01 (servicio): iva=0 con excess válido es procesado correctamente", async () => {
    const dataConIvaCero = { ...baseData, iva: "0", excess: "100" };

    (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "iva-cero",
      iva: new Decimal(0),
      excess: new Decimal(100),
    });

    const result = await TaxpayerServices.createIVA(dataConIvaCero as any);
    expect(result).toHaveProperty("id", "iva-cero");

    // Verificar que la llamada create recibió Decimal(0) para iva
    const createCall = (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(createCall.data.iva.toString()).toBe("0");
    expect(createCall.data.excess.toString()).toBe("100");
  });
});
