import { describe, it, expect, vi, beforeEach } from "vitest";
import { Decimal } from "@prisma/client/runtime/library";
import { mockTaxpayerRepository, mockDb } from "../setup";
import * as TaxpayerServices from "../../taxpayer/taxpayer.services";

const EVENT_ID = "event-uuid-123";
const TAXPAYER_ID = "taxpayer-uuid-456";

describe("Taxpayer Services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1A. createPayment", () => {
    it("rejects payment when amount > debt of event", async () => {
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: EVENT_ID,
        debt: new Decimal(50),
      });
      const input = {
        eventId: EVENT_ID,
        taxpayerId: TAXPAYER_ID,
        amount: new Decimal(100),
        date: new Date(),
        debt: new Decimal(50),
      };
      await expect(TaxpayerServices.createPayment(input as any)).rejects.toMatchObject({
        name: "AmountError",
        message: "Payment can't be greater than debt",
      });
      expect(mockTaxpayerRepository.createPayment).not.toHaveBeenCalled();
      expect(mockTaxpayerRepository.updateEventDebt).not.toHaveBeenCalled();
    });

    it("creates payment and decrements debt when amount <= debt", async () => {
      const debt = new Decimal(100);
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: EVENT_ID,
        debt,
      });
      const payment = { id: "pay-1", eventId: EVENT_ID, amount: new Decimal(60), event: {} };
      (mockTaxpayerRepository.createPayment as ReturnType<typeof vi.fn>).mockResolvedValue(payment);
      (mockTaxpayerRepository.updateEventDebt as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const input = {
        eventId: EVENT_ID,
        taxpayerId: TAXPAYER_ID,
        amount: new Decimal(60),
        date: new Date(),
        debt,
      };
      const result = await TaxpayerServices.createPayment(input as any);
      expect(result).toEqual(payment);
      expect(mockTaxpayerRepository.createPayment).toHaveBeenCalledWith(input, expect.anything());
      expect(mockTaxpayerRepository.updateEventDebt).toHaveBeenCalledWith(EVENT_ID, input.amount, expect.anything());
    });

    it("throws when event does not exist", async () => {
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const input = {
        eventId: EVENT_ID,
        taxpayerId: TAXPAYER_ID,
        amount: new Decimal(50),
        date: new Date(),
        debt: new Decimal(50),
      };
      await expect(TaxpayerServices.createPayment(input as any)).rejects.toThrow("Event not found");
      expect(mockTaxpayerRepository.createPayment).not.toHaveBeenCalled();
    });
  });

  describe("1B. createEvent", () => {
    it("creates FINE event with expires_at auto-calculated (date + 15 days)", async () => {
      const date = new Date("2025-01-10");
      (mockTaxpayerRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID, status: true });
      const created = { id: "ev-1", date, type: "FINE", taxpayerId: TAXPAYER_ID, expires_at: new Date(date.getTime() + 15 * 24 * 60 * 60 * 1000) };
      (mockTaxpayerRepository.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue(created);

      const result = await TaxpayerServices.createEvent({
        type: "FINE",
        taxpayerId: TAXPAYER_ID,
        date,
      } as any);
      expect(result).toEqual(created);
      const call = (mockTaxpayerRepository.createEvent as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const expiresAt = call.expires_at as Date;
      expect(expiresAt.getTime()).toBe(date.getTime() + 15 * 24 * 60 * 60 * 1000);
    });

    it("rejects when taxpayer does not exist or is inactive", async () => {
      (mockTaxpayerRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(
        TaxpayerServices.createEvent({ type: "FINE", taxpayerId: TAXPAYER_ID, date: new Date() } as any)
      ).rejects.toThrow(/Contribuyente con ID .* no encontrado/);
      expect(mockTaxpayerRepository.createEvent).not.toHaveBeenCalled();
    });

    it("PAYMENT_COMPROMISE: rejects when fineEventId is missing", async () => {
      (mockTaxpayerRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID });
      await expect(
        TaxpayerServices.createEvent({
          type: "PAYMENT_COMPROMISE",
          taxpayerId: TAXPAYER_ID,
          date: new Date(),
          amount: new Decimal(50),
        } as any)
      ).rejects.toThrow("fineEventId es requerido");
      expect(mockTaxpayerRepository.createEvent).not.toHaveBeenCalled();
    });

    it("PAYMENT_COMPROMISE: rejects when amount > debt of referenced fine", async () => {
      (mockTaxpayerRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID });
      (mockTaxpayerRepository.findEventById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: "fine-ev-1",
        debt: new Decimal(50),
      });
      await expect(
        TaxpayerServices.createEvent({
          type: "PAYMENT_COMPROMISE",
          taxpayerId: TAXPAYER_ID,
          fineEventId: "fine-ev-1",
          date: new Date(),
          amount: new Decimal(100),
        } as any)
      ).rejects.toMatchObject({ name: "AmountError", message: /monto no puede ser mayor/ });
      expect(mockTaxpayerRepository.createEvent).not.toHaveBeenCalled();
    });

    it("rejects invalid date", async () => {
      (mockTaxpayerRepository.findById as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID });
      await expect(
        TaxpayerServices.createEvent({
          type: "FINE",
          taxpayerId: TAXPAYER_ID,
          date: "invalid-date",
        } as any)
      ).rejects.toThrow(/Fecha inválida/);
    });

    it("rejects when taxpayerId is missing", async () => {
      await expect(
        TaxpayerServices.createEvent({ type: "FINE", date: new Date() } as any)
      ).rejects.toThrow("El ID del contribuyente es requerido");
    });
  });

  describe("1C. createIVA", () => {
    const baseData = {
      taxpayerId: TAXPAYER_ID,
      purchases: "100",
      sells: "200",
      paid: "50",
      date: "2025-02-01",
      iva: "20",
      excess: "10",
    };

    it("creates IVA report successfully", async () => {
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const created = { id: "iva-1", ...baseData };
      (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      const result = await TaxpayerServices.createIVA(baseData as any);
      expect(result).toEqual(created);
      expect(mockDb.iVAReports.create).toHaveBeenCalled();
    });

    it("rejects duplicate for same month/year", async () => {
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "existing" });
      await expect(TaxpayerServices.createIVA(baseData as any)).rejects.toThrow(/Ya existe un reporte IVA/);
      expect(mockDb.iVAReports.create).not.toHaveBeenCalled();
    });

    it("FISCAL: allows when user is assigned officer", async () => {
      const userId = "fiscal-1";
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        officerId: userId,
        user: { supervisor: { id: "other" } },
      });
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockDb.iVAReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "iva-1" });
      await expect(TaxpayerServices.createIVA(baseData as any, userId, "FISCAL")).resolves.toBeDefined();
    });

    it("FISCAL: rejects when not officer nor supervisor", async () => {
      const userId = "fiscal-other";
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        officerId: "different-officer",
        user: { groupId: "g1", supervisor: { id: "other-sup" } },
      });
      (mockDb.fiscalGroup.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "g1", members: [] });
      await expect(TaxpayerServices.createIVA(baseData as any, userId, "FISCAL")).rejects.toThrow(/No tienes permisos/);
    });

    it("rejects invalid date", async () => {
      (mockDb.iVAReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      await expect(
        TaxpayerServices.createIVA({ ...baseData, date: "not-a-date" } as any)
      ).rejects.toThrow(/Fecha de reporte inválida/);
    });
  });

  describe("1D. createISLR", () => {
    const baseData = {
      taxpayerId: TAXPAYER_ID,
      incomes: new Decimal(1000),
      costs: new Decimal(200),
      expent: new Decimal(100),
      emition_date: new Date("2025-03-15"),
      paid: new Decimal(50),
    };

    it("creates ISLR report successfully", async () => {
      (mockDb.iSLRReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const created = { id: "islr-1", ...baseData };
      (mockDb.iSLRReports.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      const result = await TaxpayerServices.createISLR(baseData as any);
      expect(result).toEqual(created);
    });

    it("rejects duplicate for same year", async () => {
      (mockDb.iSLRReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "existing" });
      await expect(TaxpayerServices.createISLR(baseData as any)).rejects.toThrow(/Ya existe un reporte ISLR/);
      expect(mockDb.iSLRReports.create).not.toHaveBeenCalled();
    });

    it("FISCAL: same access rules as IVA (officer can create)", async () => {
      const userId = "fiscal-1";
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        officerId: userId,
        user: { supervisor: { id: "other" } },
      });
      (mockDb.iSLRReports.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      (mockDb.iSLRReports.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "islr-1" });
      await expect(TaxpayerServices.createISLR(baseData as any, userId, "FISCAL")).resolves.toBeDefined();
    });
  });

  describe("1E. notifyTaxpayer", () => {
    it("returns updated taxpayer (hotfix BUG-005)", async () => {
      const updated = { id: TAXPAYER_ID, name: "Tax Co", notified: true };
      (mockDb.taxpayer.update as ReturnType<typeof vi.fn>).mockResolvedValue(updated);
      (mockDb.taxpayer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        ...updated,
        user: { name: "Fiscal", group: { coordinator: { email: null } } },
      });
      const result = await TaxpayerServices.notifyTaxpayer(TAXPAYER_ID);
      expect(result).toBeDefined();
      expect(mockDb.taxpayer.update).toHaveBeenCalledWith({
        where: { id: TAXPAYER_ID },
        data: { notified: true },
      });
    });

    it("does not fail when coordinator email is missing", async () => {
      (mockDb.taxpayer.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID, notified: true });
      (mockDb.taxpayer.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        user: { group: { coordinator: { email: null } } },
      });
      await expect(TaxpayerServices.notifyTaxpayer(TAXPAYER_ID)).resolves.toBeDefined();
    });
  });

  describe("1F. createObservation", () => {
    it("returns created observation (hotfix BUG-003)", async () => {
      const obs = { id: "obs-1", taxpayerId: TAXPAYER_ID, description: "Test", date: new Date() };
      (mockTaxpayerRepository.createObservation as ReturnType<typeof vi.fn>).mockResolvedValue(obs);
      const result = await TaxpayerServices.createObservation({
        taxpayerId: TAXPAYER_ID,
        description: "Test",
        date: new Date().toISOString(),
      });
      expect(result).toEqual(obs);
      expect(mockTaxpayerRepository.createObservation).toHaveBeenCalled();
    });

    it("rejects when taxpayerId is missing", async () => {
      await expect(
        TaxpayerServices.createObservation({ description: "x", date: new Date().toISOString(), taxpayerId: "" } as any)
      ).rejects.toThrow("Missing taxpayerId for observation");
      expect(mockTaxpayerRepository.createObservation).not.toHaveBeenCalled();
    });
  });

  describe("1G. updateCulminated", () => {
    it("FISCAL assigned can culminate", async () => {
      const userId = "fiscal-1";
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          id: TAXPAYER_ID,
          officerId: userId,
          status: true,
          culminated: false,
          user: { supervisor: { id: "other" } },
        })
        .mockResolvedValueOnce({
          id: TAXPAYER_ID,
          status: true,
          culminated: false,
          user: {},
        });
      (mockDb.taxpayer.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID, culminated: true });
      const result = await TaxpayerServices.updateCulminated(TAXPAYER_ID, true, userId, "FISCAL");
      expect(result.culminated).toBe(true);
      expect(mockDb.taxpayer.update).toHaveBeenCalledWith({
        where: { id: TAXPAYER_ID },
        data: { culminated: true },
      });
    });

    it("rejects when case is already closed (status=false, culminated=true)", async () => {
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        status: false,
        culminated: true,
        user: {},
      });
      await expect(TaxpayerServices.updateCulminated(TAXPAYER_ID, false, undefined, undefined)).rejects.toThrow(
        /ya está cerrado definitivamente/
      );
      expect(mockDb.taxpayer.update).not.toHaveBeenCalled();
    });

    it("ADMIN/COORDINATOR can culminate without restriction", async () => {
      (mockDb.taxpayer.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: TAXPAYER_ID,
        status: true,
        culminated: false,
        user: {},
      });
      (mockDb.taxpayer.update as ReturnType<typeof vi.fn>).mockResolvedValue({ id: TAXPAYER_ID, culminated: true });
      await expect(TaxpayerServices.updateCulminated(TAXPAYER_ID, true, "admin-1", "ADMIN")).resolves.toBeDefined();
      expect(mockDb.taxpayer.update).toHaveBeenCalled();
    });
  });
});
