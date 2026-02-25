import { env } from "./src/config/env-config"
import logger, { flushLogger } from "./src/utils/logger"
import app from "./src/app"

/** Log de conexión a BD al iniciar: host, nombre de BD y entorno (NODE_ENV) */
function logDatabaseConnection() {
    const url = env.DATABASE_URL
    try {
        const u = new URL(url.replace(/^mysql:\/\//, "https://"))
        const host = u.hostname
        const port = u.port || "3306"
        const dbName = (u.pathname || "").replace(/^\//, "") || "(sin nombre)"
        const nodeEnv = env.NODE_ENV
        logger.info(`[DB] Conexión activa — Host: ${host}:${port} | BD: ${dbName} | Entorno: ${nodeEnv}`)
    } catch {
        logger.warn("[DB] No se pudo interpretar DATABASE_URL (solo se muestra que está definida)")
    }
}

logDatabaseConnection()
logger.info(`[STARTUP] NODE_ENV=${env.NODE_ENV}`)

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

const PORT = env.PORT

app.listen(PORT, '0.0.0.0', () => {
    logger.info(`[STARTUP] Server is listening on port: ${PORT}`)
    logger.info(`[STARTUP] Health check: http://localhost:${PORT}/health`)
})

export default app
