import { PrismaClient } from "@prisma/client";

let db: PrismaClient;

declare global {
    var __db: PrismaClient | undefined;
}
declare global {
    interface BigInt {
        toJSON(): Number;
    }
}

if (!global.__db) {
    global.__db = new PrismaClient();
}

db = global.__db

BigInt.prototype.toJSON = function () { return Number(this) }

export { db }