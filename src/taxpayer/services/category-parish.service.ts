/**
 * CategoryParishService - Servicio para categorías de contribuyentes y parroquias.
 * Entidades de referencia (lookup tables). Candidato a módulo catalog/reference-data en el futuro.
 */

import { runTransaction } from '../../utils/db-server';
import { Prisma } from '@prisma/client';
import logger from '../../utils/logger';
import { staticDataRepository } from '../repository/static-data-repository';

// ---------------------------------------------------------------------------
// CreateTaxpayerCategory
// ---------------------------------------------------------------------------

/**
 * Crea una nueva categoría de contribuyente.
 * Valida que el nombre no sea vacío.
 */
export async function CreateTaxpayerCategory(name: string) {
    const trimmed = typeof name === 'string' ? name.trim() : '';
    if (!trimmed) {
        throw new Error("Name missing in CreateTaxpayerCategory");
    }
    try {
        const createdCategory = await runTransaction((tx) =>
            staticDataRepository.createTaxpayerCategory(trimmed, tx)
        );
        return createdCategory;
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            logger.error("CreateTaxpayerCategory Prisma error", { code: e.code, message: e?.message, name: trimmed });
        } else {
            logger.error("CreateTaxpayerCategory failed", { name: trimmed, message: e?.message, stack: e?.stack });
        }
        throw e;
    }
}

// ---------------------------------------------------------------------------
// getTaxpayerCategories
// ---------------------------------------------------------------------------

/**
 * Lista todas las categorías de contribuyentes.
 */
export async function getTaxpayerCategories() {
    try {
        const categories = await staticDataRepository.findAllCategories();
        return categories;
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            logger.error("Prisma error getting taxpayer categories", { code: e.code, message: e?.message });
        } else {
            logger.error("Can't get the taxpayer categories", { message: e?.message, stack: e?.stack });
        }
        throw new Error("Can't get the taxpayer categories");
    }
}

// ---------------------------------------------------------------------------
// getParishList
// ---------------------------------------------------------------------------

/**
 * Lista todas las parroquias.
 */
export async function getParishList() {
    try {
        const parishList = await staticDataRepository.findAllParishes();
        return parishList;
    } catch (e: any) {
        if (e instanceof Prisma.PrismaClientKnownRequestError) {
            logger.error("Prisma error getting parish list", { code: e.code, message: e?.message });
        } else {
            logger.error("Can't get the parish list", { message: e?.message, stack: e?.stack });
        }
        throw new Error("Can't get the parish list.");
    }
}
