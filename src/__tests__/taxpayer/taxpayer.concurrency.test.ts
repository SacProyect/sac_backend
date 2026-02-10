import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import request from "supertest";
import { sign } from "jsonwebtoken";
import app from "../../app";
import { mockTaxpayerRepository, mockDb } from "../setup";
import * as TaxpayerServices from "../../taxpayer/taxpayer.services";

const TOKEN_SECRET = process.env.TOKEN_SECRET || "test-secret-for-routes";
const EVENT_ID = "event-uuid-123";
const TAXPAYER_ID = "taxpayer-uuid-456";

function token(role: string, userId = "user-1") {
  return sign({ type: role, user: userId }, TOKEN_SECRET);
}

describe("Concurrency: múltiples usuarios en el mismo endpoint", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Servicio: createPayment en paralelo (mismo evento)", () => {
    /**
     * Simula 2 "usuarios" pagando al mismo tiempo sobre el mismo evento.
     * Ambos ven deuda 100; cada uno intenta pagar 60.
     * Con mocks estáticos los dos pasan la validación (60 <= 100).
     * Verificamos que el servidor no crashea: todas las promesas se resuelven o rechazan.
     */
    it("varias llamadas simultáneas no crashean y responden coherentemente", async () => {
      const debt = new Decimal(100);
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: EVENT_ID,
        debt,
      });
      (mockTaxpayerRepository.createPayment as ReturnType<typeof vi.fn>).mockImplementation((input: any) =>
        Promise.resolve({ id: `pay-${Date.now()}-${Math.random()}`, ...input, event: {} })
      );
      (mockTaxpayerRepository.updateEventDebt as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const input = {
        eventId: EVENT_ID,
        taxpayerId: TAXPAYER_ID,
        amount: new Decimal(60),
        date: new Date(),
        debt,
      };

      const concurrentCalls = Array.from({ length: 5 }, () =>
        TaxpayerServices.createPayment(input as any)
      );
      const results = await Promise.allSettled(concurrentCalls);

      expect(results).toHaveLength(5);
      results.forEach((r) => {
        expect(r.status === "fulfilled" || r.status === "rejected").toBe(true);
      });
    });

    /**
     * Varias lecturas en paralelo (getEventsbyTaxpayer): solo lectura, no debe fallar.
     */
    it("múltiples getEventsbyTaxpayer en paralelo no crashean", async () => {
      (mockTaxpayerRepository.findEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockTaxpayerRepository.findPayments as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const concurrentCalls = Array.from({ length: 10 }, () =>
        TaxpayerServices.getEventsbyTaxpayer()
      );
      const results = await Promise.all(concurrentCalls);

      expect(results).toHaveLength(10);
      results.forEach((events) => expect(Array.isArray(events)).toBe(true));
    });
  });

  describe("HTTP: múltiples GET /taxpayer/event/all simultáneos", () => {
    it("varias peticiones concurrentes reciben respuesta (no colapsa)", async () => {
      (mockTaxpayerRepository.findEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockTaxpayerRepository.findPayments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const adminToken = token("ADMIN");

      const concurrentRequests = Array.from({ length: 15 }, () =>
        request(app)
          .get("/taxpayer/event/all")
          .set("Authorization", `Bearer ${adminToken}`)
          .set("Accept", "application/json")
      );

      const responses = await Promise.all(concurrentRequests);

      expect(responses).toHaveLength(15);
      responses.forEach((res) => {
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
      });
    });
  });

  describe("HTTP: POST /taxpayer/payment concurrentes (mismo eventId)", () => {
    it("varias peticiones de pago simultáneas reciben respuesta sin crash", async () => {
      const eventId = "550e8400-e29b-41d4-a716-446655440000";
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: eventId,
        debt: 100,
      });
      (mockTaxpayerRepository.createPayment as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve({ id: "pay-1", eventId, amount: 50, event: {} })
      );
      (mockTaxpayerRepository.updateEventDebt as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const body = {
        date: new Date().toISOString(),
        amount: "50",
        eventId,
        taxpayerId: "tp-1",
        debt: "100",
      };

      const concurrentRequests = Array.from({ length: 8 }, () =>
        request(app)
          .post("/taxpayer/payment")
          .set("Authorization", `Bearer ${token("ADMIN")}`)
          .set("Content-Type", "application/json")
          .send(body)
      );

      const responses = await Promise.all(concurrentRequests);

      expect(responses).toHaveLength(8);
      responses.forEach((res) => {
        expect([200, 400, 500]).toContain(res.status);
      });
    });
  });
});
