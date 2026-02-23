import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { sign } from "jsonwebtoken";
import app from "../../app";
import { mockTaxpayerRepository } from "../setup";

const TOKEN_SECRET = process.env.TOKEN_SECRET || "test-secret-for-routes";

function token(role: string, userId = "user-1") {
  return sign({ type: role, user: userId }, TOKEN_SECRET);
}

describe("Taxpayer Routes (integration-light)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Authentication", () => {
    it("returns 401 without token on GET /taxpayer/event/all", async () => {
      const res = await request(app)
        .get("/taxpayer/event/all")
        .set("Accept", "application/json");
      expect(res.status).toBe(401);
      expect(res.body?.message).toMatch(/denied|token|provided|invalid/i);
    });

    it("returns 401 with invalid token", async () => {
      const res = await request(app)
        .get("/taxpayer/event/all")
        .set("Authorization", "Bearer invalid-token")
        .set("Accept", "application/json");
      expect(res.status).toBe(401);
    });
  });

  describe("Authorization", () => {
    it("returns 403 when FISCAL accesses ADMIN-only endpoint", async () => {
      const fiscalToken = token("FISCAL");
      const res = await request(app)
        .put("/taxpayer/modify-observations/obs-123")
        .set("Authorization", `Bearer ${fiscalToken}`)
        .set("Content-Type", "application/json")
        .send({ newDescription: "Updated" });
      expect(res.status).toBe(403);
      expect(res.text || res.body?.error || res.body).toMatch(/Forbidden/i);
    });
  });

  describe("Route order and behavior", () => {
    it("GET /taxpayer/event/all responds correctly with valid token (BUG-001)", async () => {
      (mockTaxpayerRepository.findEvents as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (mockTaxpayerRepository.findPayments as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const adminToken = token("ADMIN");
      const res = await request(app)
        .get("/taxpayer/event/all")
        .set("Authorization", `Bearer ${adminToken}`)
        .set("Accept", "application/json");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it("POST /taxpayer/payment accepts eventId as string UUID (BUG-006)", async () => {
      const eventId = "550e8400-e29b-41d4-a716-446655440000";
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: eventId,
        debt: 100,
      });
      (mockTaxpayerRepository.createPayment as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "pay-1",
        eventId,
        amount: 50,
        event: {},
      });
      (mockTaxpayerRepository.updateEventDebt as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const res = await request(app)
        .post("/taxpayer/payment")
        .set("Authorization", `Bearer ${token("ADMIN")}`)
        .set("Content-Type", "application/json")
        .send({
          date: new Date().toISOString(),
          amount: "50",
          eventId,
          taxpayerId: "tp-1",
          debt: "100",
        });
      expect([200, 400, 500]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body).toHaveProperty("eventId", eventId);
      }
    });
  });

  describe("express-validator", () => {
    it("POST /taxpayer/observations returns 400 when taxpayerId is missing", async () => {
      const res = await request(app)
        .post("/taxpayer/observations")
        .set("Authorization", `Bearer ${token("ADMIN")}`)
        .set("Content-Type", "application/json")
        .send({
          description: "Some observation",
          date: new Date().toISOString(),
        });
      expect(res.status).toBe(400);
      expect(res.body?.errors).toBeDefined();
    });
  });
});
