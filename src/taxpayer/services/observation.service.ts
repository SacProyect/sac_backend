/**
 * ObservationService - Servicio para gestión de observaciones
 * 
 * Este servicio sigue el principio de responsabilidad única (SRP)
 */

import { db, runTransaction } from '../../utils/db-server';
import { taxpayerRepository } from '../repository/taxpayer-repository';
import { invalidateTaxpayerCache } from '../../utils/cache-invalidation';
import type { NewObservation } from '../taxpayer-utils';
import logger from '../../utils/logger';

export class ObservationService {
    
    /**
     * Crea una nueva observación
     */
    static async create(input: NewObservation): Promise<any> {
        try {
            const observation = await runTransaction((tx) =>
                taxpayerRepository.createObservation({
                    taxpayerId: input.taxpayerId,
                    description: input.description,
                    date: new Date(input.date),
                }, tx)
            );

            invalidateTaxpayerCache();

            return observation;
        } catch (error: any) {
            logger.error("Error creating observation", { 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Actualiza una observación existente
     */
    static async update(id: string, newDescription: string): Promise<any> {
        try {
            const observation = await db.observations.update({
                where: { id },
                data: { description: newDescription },
            });

            invalidateTaxpayerCache();

            return observation;
        } catch (error: any) {
            logger.error("Error updating observation", { 
                id,
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Elimina una observación
     */
    static async delete(id: string): Promise<void> {
        try {
            await runTransaction((tx) =>
                taxpayerRepository.deleteObservationById(id, tx)
            );

            invalidateTaxpayerCache();
        } catch (error: any) {
            logger.error("Error deleting observation", { 
                id, 
                message: error?.message, 
                stack: error?.stack 
            });
            throw error;
        }
    }

    /**
     * Obtiene observaciones por contribuyente
     */
    static async getByTaxpayer(taxpayerId: string) {
        try {
            const taxpayerObservations = await taxpayerRepository.findObservationsByTaxpayer(taxpayerId);

            return taxpayerObservations;
        } catch (error: any) {
            logger.error("Error getting observations", { 
                taxpayerId,
                message: error?.message, 
                stack: error?.stack 
            });
            throw new Error("Error getting the observations");
        }
    }

    /**
     * Obtiene una observación por ID
     */
    static async getById(id: string) {
        return db.observations.findUnique({
            where: { id },
        });
    }
}
