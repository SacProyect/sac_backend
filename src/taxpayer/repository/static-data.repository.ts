import { db } from "../../utils/db.server";

export class StaticDataRepository {

    async createTaxpayerCategory(name: string) {
        return db.taxpayerCategory.create({
            data: {
                name: name,
            }
        });
    }

    async findAllCategories() {
        return db.taxpayerCategory.findMany();
    }

    async findAllParishes() {
        return db.parish.findMany();
    }
}

// Export a singleton instance
export const staticDataRepository = new StaticDataRepository();
