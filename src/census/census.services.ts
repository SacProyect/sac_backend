import { TaxpayerCensus } from "@prisma/client";
import { NewTaxpayerCensus } from "../taxpayer/taxpayer.utils";
import { db, runTransaction } from "../utils/db.server";
import { NewTaxpayerCensusInput } from "./census.utils";
import logger from "../utils/logger";



export const createTaxpayerCensus = async (input: NewTaxpayerCensusInput): Promise<TaxpayerCensus> => {
    try {
        logger.info('Creando contribuyente de censo', { rif: input.rif, name: input.name });
        const taxpayerCensus = await runTransaction((tx) =>
            tx.taxpayerCensus.create({
                data: {
                    number: input.number,
                    process: input.process ?? "FP",
                    name: input.name,
                    rif: input.rif,
                    type: input.type ?? "ORDINARY",
                    address: input.address ?? "Caracas",
                    emition_date: input.emition_date ?? new Date(),
                    userId: input.userId
                }
            })
        );

        logger.info('Contribuyente de censo creado exitosamente', { id: taxpayerCensus.id, rif: taxpayerCensus.rif });
        return taxpayerCensus;
    } catch (error) {
        logger.error('Error al crear contribuyente de censo', { rif: input.rif, error });
        throw new Error("Failed to create taxpayer census");
    }
};


export const getTaxpayerCensus = async () => {
    try {
        logger.info('Obteniendo contribuyentes de censo');
        const taxpayersCensus = await db.taxpayerCensus.findMany({
            include: {
                fiscal: {select: {name: true}},
            }
        });

        logger.info('Contribuyentes de censo obtenidos', { count: taxpayersCensus.length });
        return taxpayersCensus;

    } catch (e) {
        logger.error('Error al obtener contribuyentes de censo', { error: e });
        throw new Error("Error al intentar obtener los contribuyentes pertenecientes a censo")
    }
}

export const deleteTaxpayerCensus = async (id: string) => {
    try {
        logger.info('Eliminando contribuyente de censo', { id });
        const deletedTaxpayer = await runTransaction((tx) =>
            tx.taxpayerCensus.delete({
                where: {
                    id: id,
                }
            })
        );

        logger.info('Contribuyente de censo eliminado exitosamente', { id: deletedTaxpayer.id });
        return deletedTaxpayer;

    } catch (e) {
        logger.error('Error al eliminar contribuyente de censo', { id, error: e });
        throw new Error("No se pudo eliminar el contribuyente de censo.")
    }
}