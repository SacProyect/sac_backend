import { TaxpayerCensus } from "@prisma/client";
import { NewTaxpayerCensus } from "../taxpayer/taxpayer.utils";
import { db } from "../utils/db.server";
import { NewTaxpayerCensusInput } from "./census.utils";



export const createTaxpayerCensus = async (input: NewTaxpayerCensusInput): Promise<TaxpayerCensus> => {
    try {
        const taxpayerCensus = await db.taxpayerCensus.create({
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
        });

        return taxpayerCensus;
    } catch (error) {
        console.error(error);
        throw new Error("Failed to create taxpayer census");
    }
};


export const getTaxpayerCensus = async () => {

    try {

        const taxpayersCensus = await db.taxpayerCensus.findMany({
            include: {
                fiscal: {select: {name: true}},
            }
        });

        return taxpayersCensus;


    } catch (e) {
        throw new Error("Error al intentar obtener los contribuyentes pertenecientes a censo")
    }
}

export const deleteTaxpayerCensus = async (id: string) => {


    try {

        const deletedTaxpayer = await db.taxpayerCensus.delete({
            where: {
                id: id,
            }
        })

        return deletedTaxpayer;

    } catch (e) {
        console.error(e);
        throw new Error("No se pudo eliminar el contribuyente de censo.")
    }
}