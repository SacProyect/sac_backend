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