import { vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// BigInt serialization (same as db.server)
if (typeof BigInt !== "undefined") {
  (BigInt.prototype as any).toJSON = function () {
    return Number(this);
  };
}

process.env.NODE_ENV = "test";
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || "test-secret-for-routes";

// Global Prisma mock: any code importing db from utils/db.server gets this
export const mockDb = mockDeep<PrismaClient>();

// runTransaction: ejecuta el callback con mockDb como "tx" para que los tests que mockean mockDb.* sigan funcionando
vi.mock("../utils/db.server", () => ({
  db: mockDb,
  runTransaction: vi.fn(<T>(fn: (tx: typeof mockDb) => Promise<T>) => fn(mockDb)),
}));

// Taxpayer repository mock: any method returns a vi.fn() (cached per property)
const repoTarget: Record<string, ReturnType<typeof vi.fn>> = {};
export const mockTaxpayerRepository = new Proxy(repoTarget, {
  get(_t, p: string) {
    if (!repoTarget[p]) repoTarget[p] = vi.fn();
    return repoTarget[p];
  },
});

vi.mock("../taxpayer/repository/taxpayer.repository", () => ({
  taxpayerRepository: mockTaxpayerRepository,
}));
