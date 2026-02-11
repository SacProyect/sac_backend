import * as dotenv from "dotenv"
import logger, { flushLogger } from "./src/utils/logger"
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

/** Verificar variables de entorno críticas al arrancar */
function checkRequiredEnvVars() {
    const required = ['DATABASE_URL', 'TOKEN_SECRET']
    const missing = required.filter(v => !process.env[v])

    if (missing.length > 0) {
        logger.error(`[STARTUP] Variables de entorno faltantes: ${missing.join(', ')}`)
        logger.error('[STARTUP] El servidor puede no funcionar correctamente sin estas variables')
    }

    // Variables opcionales pero recomendadas
    const optional = ['BETTERSTACK_SOURCE_TOKEN', 'NODE_ENV']
    const missingOptional = optional.filter(v => !process.env[v])
    if (missingOptional.length > 0) {
        logger.warn(`[STARTUP] Variables opcionales no definidas: ${missingOptional.join(', ')}`)
    }

    logger.info(`[STARTUP] NODE_ENV=${process.env.NODE_ENV ?? 'development'}`)
}

checkRequiredEnvVars()
logDatabaseConnection()

// Capturar errores no manejados que matarían el proceso
process.on("uncaughtException", (error) => {
    logger.error("[FATAL] Uncaught Exception", {
        message: error.message,
        stack: error.stack,
        name: error.name,
    })
    flushLogger().finally(() => process.exit(1))
})

process.on("unhandledRejection", (reason: unknown) => {
    const err = reason instanceof Error ? reason : new Error(String(reason))
    logger.error("[FATAL] Unhandled Promise Rejection", {
        message: err.message,
        stack: err.stack,
        name: err.name,
    })
})

// Graceful shutdown para SIGTERM (producción: PM2, Docker, Render, etc.)
process.on("SIGTERM", async () => {
    logger.info("[SHUTDOWN] SIGTERM recibido, cerrando servidor...")
    await flushLogger()
    process.exit(0)
})

// Graceful shutdown para SIGINT (desarrollo: Ctrl+C)
process.on("SIGINT", async () => {
    logger.info("[SHUTDOWN] SIGINT recibido, cerrando servidor...")
    await flushLogger()
    process.exit(0)
})

if (!process.env.PORT) {
    logger.warn('[STARTUP] No port value specified, defaulting to 3000')
}
const PORT = parseInt(process.env.PORT as string, 10) || 3000

app.listen(PORT, '0.0.0.0', () => {
    logger.info(`[STARTUP] Server is listening on port: ${PORT}`)
    logger.info(`[STARTUP] Health check: http://localhost:${PORT}/health`)
})

export default app
