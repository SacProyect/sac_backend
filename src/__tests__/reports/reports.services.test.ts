import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockDb } from "../setup";
import * as ReportsServices from "../../reports/reports.services";

describe("Reports Services", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("getPendingPayments", () => {
    const baseWhere = {
      debt: { gt: 0 },
      taxpayer: { status: true },
      NOT: { type: "WARNING" },
    };

    it("FISCAL sees only their pending events", async () => {
      const userId = "fiscal-1";
      const events = [
        {
          id: "ev-1",
          date: new Date(),
          amount: 100,
          type: "FINE",
          debt: 50,
          taxpayerId: "tp-1",
          taxpayer: { name: "Tax Co", rif: "J-1" },
          expires_at: null,
        },
      ];
      (mockDb.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(events);
      const result = await ReportsServices.getPendingPayments({ id: userId, role: "FISCAL" });
      expect(result).toHaveLength(1);
      expect(result[0].taxpayerId).toBe("tp-1");
      expect(mockDb.event.findMany).toHaveBeenCalledWith({
        where: { ...baseWhere, taxpayer: { status: true, officerId: userId } },
        select: expect.any(Object),
      });
    });

    it("COORDINATOR sees events from group members", async () => {
      (mockDb.fiscalGroup.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
        members: [{ id: "m1" }, { id: "m2" }],
      });
      (mockDb.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await ReportsServices.getPendingPayments({ id: "coord-1", role: "COORDINATOR" });
      expect(mockDb.event.findMany).toHaveBeenCalledWith({
        where: {
          ...baseWhere,
          taxpayer: { status: true, officerId: { in: ["m1", "m2"] } },
        },
        select: expect.any(Object),
      });
    });

    it("ADMIN sees all pending events", async () => {
      (mockDb.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: "e1", date: new Date(), amount: 1, type: "FINE", debt: 1, taxpayerId: "t1", taxpayer: { name: "N", rif: "R" }, expires_at: null },
      ]);
      const result = await ReportsServices.getPendingPayments({ id: "admin-1", role: "ADMIN" });
      expect(result.length).toBeGreaterThanOrEqual(0);
      expect(mockDb.event.findMany).toHaveBeenCalledWith({
        where: baseWhere,
        select: expect.any(Object),
      });
    });

    it("filters by debt > 0 and excludes WARNING", async () => {
      (mockDb.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await ReportsServices.getPendingPayments({ id: "admin-1", role: "ADMIN" });
      const where = (mockDb.event.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(where.debt).toEqual({ gt: 0 });
      expect(where.NOT).toEqual({ type: "WARNING" });
    });

    it("filters by taxpayerId when provided", async () => {
      (mockDb.event.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      await ReportsServices.getPendingPayments({ id: "admin-1", role: "ADMIN" }, "taxpayer-123");
      const where = (mockDb.event.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].where;
      expect(where["taxpayer"].id).toBe("taxpayer-123");
    });
  });

  describe("createError", () => {
    it("creates error with images (hotfix BUG-004)", async () => {
      const input = {
        title: "Test Error",
        type: "GENERAL" as any,
        description: "Desc",
        userId: "user-1",
        images: [
          { img_src: "http://example.com/1.jpg", img_alt: "Alt 1" },
          { img_src: "http://example.com/2.jpg", img_alt: "Alt 2" },
        ],
      };
      const created = { id: "err-1", ...input };
      (mockDb.errors.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      const result = await ReportsServices.createError(input);
      expect(result).toEqual(created);
      expect(mockDb.errors.create).toHaveBeenCalledWith({
        data: {
          title: input.title,
          description: input.description,
          type: input.type,
          userId: input.userId,
          errorImages: {
            create: [
              { img_src: input.images![0].img_src, img_alt: input.images![0].img_alt },
              { img_src: input.images![1].img_src, img_alt: input.images![1].img_alt },
            ],
          },
        },
      });
    });

    it("works without images (images undefined)", async () => {
      const input = {
        type: "GENERAL" as any,
        description: "No images",
        userId: "user-1",
      };
      const created = { id: "err-2", ...input };
      (mockDb.errors.create as ReturnType<typeof vi.fn>).mockResolvedValue(created);
      const result = await ReportsServices.createError(input as any);
      expect(result).toEqual(created);
      expect(mockDb.errors.create).toHaveBeenCalledWith({
        data: {
          title: undefined,
          description: input.description,
          type: input.type,
          userId: input.userId,
          errorImages: { create: [] },
        },
      });
    });
  });
});
