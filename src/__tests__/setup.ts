import { vi } from "vitest";
import { mockDeep } from "vitest-mock-extended";
import type { PrismaClient } from "@prisma/client";

// BigInt: los tests que necesiten serializar objetos con BigInt deben usar
// serializeForJson o safeStringify desde utils/bigint-serializer (ya no hay parche global en db-server).

process.env.NODE_ENV = "test";
process.env.TOKEN_SECRET = process.env.TOKEN_SECRET || "test-secret-for-routes";
process.env.DATABASE_URL =
  process.env.DATABASE_URL || "mysql://user:pass@localhost:3306/testdb";
// Evitar que Resend lance al cargar EmailService en tests (no se envían correos)
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY || "re_test_dummy";
// Evitar que s3-client lance al cargar StorageService en tests
process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "test-key";
process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "test-secret";

// Global Prisma mock: any code importing db from utils/db-server gets this
export const mockDb = mockDeep<PrismaClient>();

// runTransaction: ejecuta el callback con mockDb como "tx" para que los tests que mockean mockDb.* sigan funcionando
vi.mock("../utils/db-server", () => ({
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

// Mock del módulo taxpayer-repository:
// - exporta taxpayerRepository (instancia usada por servicios legacy)
// - exporta TaxpayerRepository (clase usada por DI en configureContainer)
vi.mock("../taxpayer/repository/taxpayer-repository", () => {
  class TaxpayerRepository {
    // new TaxpayerRepository() devolverá el proxy mockeado
    constructor() {
      return mockTaxpayerRepository as any;
    }
  }

  return {
    taxpayerRepository: mockTaxpayerRepository,
    TaxpayerRepository,
  };
});
