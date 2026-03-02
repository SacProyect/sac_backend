import { PrismaClient } from '@prisma/client';
import { mockDeep, DeepMockProxy } from 'vitest-mock-extended';

export type PrismaClientMock = DeepMockProxy<PrismaClient>;

/**
 * Mock profundo de PrismaClient para usar en tests.
 * Este mock debe inyectarse en lugar de la instancia real de Prisma
 * (o del servicio que la envuelva) para evitar conexiones reales a la BD.
 */
export const prismaMock: PrismaClientMock = mockDeep<PrismaClient>();

