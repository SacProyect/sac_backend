import { PrismaClient } from "@prisma/client";
//TODO ESTO ES UNA PRUEBA PARA VER SI FUNCIONA EN LOCAL ESTO SE VA A ELIMINAR MAS ADELANTE
import * as dotenv from "dotenv";
import path from "path";

// Cargar variables de entorno desde el archivo .env en la raíz del proyecto
// override: true para sobrescribir variables de entorno del sistema
dotenv.config({
    path: path.resolve(__dirname, "../../.env"),
    override: true
});

let db: PrismaClient;

/** Cliente de transacción de Prisma. Usar dentro de runTransaction para commit/rollback automático. */
export type TxClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Ejecuta una función dentro de una transacción.
 * Si la función lanza un error, se hace rollback automático; si termina bien, commit.
 */
export async function runTransaction<T>(
    fn: (tx: TxClient) => Promise<T>
): Promise<T> {
    return db.$transaction(fn);
}

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

db = global.__db;

BigInt.prototype.toJSON = function () {
    return Number(this);
};

export { db };