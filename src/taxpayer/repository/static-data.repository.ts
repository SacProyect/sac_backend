import { db, TxClient } from "../../utils/db.server";

export class StaticDataRepository {

    async createTaxpayerCategory(name: string, tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayerCategory.create({
            data: {
                name: name,
            }
        });
    }

    async findAllCategories(tx?: TxClient) {
        const client = tx ?? db;
        return client.taxpayerCategory.findMany();
    }

    async findAllParishes(tx?: TxClient) {
        const client = tx ?? db;
        return client.parish.findMany();
    }
}

// Export a singleton instance
export const staticDataRepository = new StaticDataRepository();
