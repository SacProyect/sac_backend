import * as dotenv from "dotenv"
import logger from "./src/utils/logger"
import app from "./src/app"

dotenv.config()

/** Log de conexión a BD al iniciar: host, nombre de BD y entorno (NODE_ENV) */
function logDatabaseConnection() {
    const url = process.env.DATABASE_URL
    if (!url) {
        logger.warn("[DB] DATABASE_URL no definida")
        return
    }
    try {
        const u = new URL(url.replace(/^mysql:\/\//, "https://"))
        const host = u.hostname
        const port = u.port || "3306"
        const dbName = (u.pathname || "").replace(/^\//, "") || "(sin nombre)"
        const env = process.env.NODE_ENV ?? "development"
        logger.info(`[DB] Conexión activa — Host: ${host}:${port} | BD: ${dbName} | Entorno: ${env}`)
    } catch {
        logger.warn("[DB] No se pudo interpretar DATABASE_URL (solo se muestra que está definida)")
    }
}

logDatabaseConnection()

if (!process.env.PORT) {
    logger.warn('No port value specified...')
}
const PORT = parseInt(process.env.PORT as string, 10)

app.listen(PORT, '0.0.0.0', () => {
    logger.info(`Server is listening on port: ${PORT}`)
})

export default app
