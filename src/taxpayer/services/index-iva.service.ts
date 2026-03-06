/**
 * IndexIvaService - Servicio para gestión del Índice IVA
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import { Decimal } from '@prisma/client/runtime/library';
import type { IndexIva } from '@prisma/client';
import logger from '../../utils/logger';

export interface CreateIndexIvaInput {
    specialAmount: number;
    ordinaryAmount: number;
}

export class IndexIvaService {
    
    /**
     * Crea un nuevo índice IVA
     * 
     * Este método:
     * 1. Expira los índices anteriores
     * 2. Crea los nuevos índices (SPECIAL y ORDINARY)
     */
    static async create(data: CreateIndexIvaInput): Promise<any> {
        try {
            const result = await runTransaction(async (tx) => {
                // 1. Obtener los índices anteriores activos
                const previousIndexes = await taxpayerRepository.findIndexIvaExpired(tx);

                // 2. Actualizar expires_at a NOW
                await taxpayerRepository.expireIndexIva(tx);

                // 3. Crear nuevos índices
                const [indexIvaSpecial, indexIvaOrdinary] = await Promise.all([
                    taxpayerRepository.createIndexIvaRecord("SPECIAL", new Decimal(data.specialAmount), tx),
                    taxpayerRepository.createIndexIvaRecord("ORDINARY", new Decimal(data.ordinaryAmount), tx),
                ]);

                return { indexIvaSpecial, indexIvaOrdinary, previousIndexes };
            });

            invalidateTaxpayerCache();

            return result;
        } catch (error: any) {
            logger.error("Error creating index IVA", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Modifica el índice IVA de un contribuyente específico
     */
    static async modify(newIndexIva: Decimal, taxpayerId: string): Promise<any> {
        try {
            const taxpayer = await runTransaction((tx) =>
                taxpayerRepository.updateIndexIva(taxpayerId, newIndexIva, tx)
            );

            invalidateTaxpayerCache();

            return taxpayer;
        } catch (error: any) {
            logger.error("Error modifying index IVA", { 
                taxpayerId,
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error("No se pudo modificar el indice de IVA individual.");
        }
    }

    /**
     * Resuelve el índice IVA efectivo actual para un contribuyente
     * 
     * Si el contribuyente tiene un índice propio, lo usa.
     * Si no, usa el índice general activo.
     */
    static async resolveCurrentEffectiveIndex(
        taxpayer: { index_iva?: unknown; contract_type: string },
        refDate: Date
    ): Promise<Decimal> {
        // Si el contribuyente tiene índice propio
        if (taxpayer.index_iva !== null && taxpayer.index_iva !== undefined) {
            return new Decimal(taxpayer.index_iva as number);
        }

        // Usar índice general
        const generalIndex = await taxpayerRepository.findActiveGeneralIndexIva(
            taxpayer.contract_type,
            refDate
        );

        if (!generalIndex) {
            throw new Error("No se encontró un índice IVA aplicable");
        }

        return generalIndex.base_amount;
    }

    /**
     * Obtiene los índices IVA activos
     */
    static async getActive(): Promise<any[]> {
        const indexes = await db.indexIva.findMany({
            where: { expires_at: null },
            orderBy: { created_at: 'desc' },
        });
        // Convertir Decimal a string para serialización JSON
        return indexes.map(index => ({
            ...index,
            base_amount: index.base_amount.toString(),
        }));
    }

    /**
     * Obtiene el índice IVA por tipo de contrato
     */
    static async getByContractType(contractType: string, refDate?: Date): Promise<Decimal | null> {
        const date = refDate || new Date();
        
        const index = await taxpayerRepository.findActiveGeneralIndexIva(
            contractType,
            date
        );

        return index?.base_amount ?? null;
    }
}
