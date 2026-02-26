import "reflect-metadata";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { configureContainer } from "./utils/container";
import { userRouter } from "./users/user-routes";
import { taxpayerRouter } from "./taxpayer/taxpayer-routes";
import { reportRouter } from "./reports/reports-routes";
import { censusRouter } from "./census/census-routes";
import { requestLogger } from "./utils/request-logger";
import { notFoundHandler, globalErrorHandler } from "./utils/error-handler";
import { requestIdMiddleware } from "./utils/request-id";
import { cacheStatsMiddleware, cacheClearMiddleware } from "./utils/cache-middleware";
import { cacheService } from "./utils/cache-service";
import { db } from "./utils/db-server";
import { serializeForJson } from "./utils/bigint-serializer";
import logger from "./utils/logger";
import { authenticateToken } from "./users/user-utils";

configureContainer();

const app = express();

// ─── 1. SEGURIDAD ────────────────────────────────────────────────────────────
// Helmet establece headers de seguridad HTTP que diferentes navegadores requieren.
// Sin estos headers, algunos navegadores/dispositivos rechazan las respuestas
// o muestran advertencias de seguridad que impiden la carga de la app.
app.use(helmet({
  // Desactivar CSP porque es una API JSON, no sirve HTML
  contentSecurityPolicy: false,
  // Permitir que el frontend en otros dominios haga peticiones
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// ─── 2. COMPRESIÓN ───────────────────────────────────────────────────────────
// Comprime las respuestas con gzip/brotli. Reduce el tamaño de las respuestas
// JSON hasta un 70%, lo que es crítico para usuarios con conexiones lentas
// (móviles, zonas rurales) donde antes ocurrían timeouts.
app.use(compression());

// ─── 3. REQUEST ID (CORRELACIÓN) ─────────────────────────────────────────────
// Asigna un UUID a cada petición. Permite rastrear exactamente qué pasó
// con la petición de un usuario específico en los logs de BetterStack.
app.use(requestIdMiddleware);

// ─── 4. BODY PARSING con límites ─────────────────────────────────────────────
// Limitar tamaño del body previene que payloads gigantes tumben el servidor.
// 10mb es suficiente para operaciones normales incluyendo uploads base64 pequeños.
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ─── 5. CORS (Cross-Origin Resource Sharing) ─────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "http://172.16.0.145:5173",
  "https://sac-mu.vercel.app",
  "https://sacfrontend-esfdn6llv-sacs-projects-6fc34506.vercel.app",
  "https://main.d2inp34pig64ff.amplifyapp.com",
  "https://sac-app.com",
  "https://www.sac-app.com",
  "http://localhost:39733",
];
 
app.use(
  cors({
    origin: (origin, callback) => {
      // Permitir peticiones sin origin (Postman, curl, mobile apps, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      // Verificar si el origin está en la lista permitida
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // Permitir subdominios de ngrok para desarrollo
      if (/\.ngrok-free\.app$/.test(origin)) {
        return callback(null, true);
      }

      // Permitir subdominios de vercel para preview deployments
      if (/\.vercel\.app$/.test(origin)) {
        return callback(null, true);
      }

      // Permitir subdominios de amplifyapp para preview deployments
      if (/\.amplifyapp\.com$/.test(origin)) {
        return callback(null, true);
      }

      // CORRECCIÓN: En vez de lanzar Error (que crasheaba la petición sin respuesta útil),
      // logueamos el origin bloqueado y devolvemos false. Esto envía un error CORS
      // limpio al navegador en vez de un 500.
      logger.warn('[CORS] Origin bloqueado', { origin });
      callback(null, false);
    },
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-Id",       // Para correlación de errores frontend ↔ backend
      "X-Client-Version",   // Para rastrear versión del frontend
    ],
    exposedHeaders: [
      "X-Request-Id",       // El frontend puede leer el requestId de la respuesta
    ],
    credentials: true,
    // Pre-flight cache: los navegadores cachean la respuesta OPTIONS durante 10 min
    // Esto reduce las peticiones preflight repetidas (cada petición no-simple genera 2 HTTP)
    maxAge: 600,
  })
);

// ─── 6. SERIALIZACIÓN SEGURA DE BIGINT ───────────────────────────────────────
// Intercepta res.json para serializar BigInt (ej. providenceNum) sin parche global.
// Evita "Do not know how to serialize a BigInt" en respuestas de la API.
app.use((_req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = function (body: unknown) {
    return originalJson(serializeForJson(body));
  };
  next();
});

// ─── 7. REQUEST LOGGER ───────────────────────────────────────────────────────
app.use(requestLogger);

// ─── 8. TIMEOUT DE PETICIONES ────────────────────────────────────────────────
// Si una petición tarda más de 30 segundos, la abortamos. Esto previene
// que conexiones colgadas consuman recursos del servidor indefinidamente.
app.use((req, res, next) => {
  // 30 segundos de timeout
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      logger.warn('[TIMEOUT] Petición excedió 30s', {
        method: req.method,
        path: req.originalUrl,
        requestId: (req as any).requestId,
      });
      res.status(408).json({
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'La petición tardó demasiado. Intente de nuevo.',
          requestId: (req as any).requestId,
        },
      });
    }
  });
  next();
});

// ─── 9. RUTAS DE SALUD ──────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "SAC API is working",
    version: process.env.npm_package_version || "1.0.0",
  });
});

// Healthcheck detallado con verificación de BD
app.get("/health", async (req, res) => {
  const health: Record<string, unknown> = {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    memory: {
      used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      unit: "MB",
    },
    environment: process.env.NODE_ENV || "development",
    requestId: (req as any).requestId,
  };

  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    health.database = {
      status: "connected",
      latency: `${Date.now() - start}ms`,
    };
  } catch (e) {
    health.status = "degraded";
    health.database = { status: "disconnected" };
    logger.error("[HEALTH] Base de datos desconectada", { error: (e as Error).message });
  }

  // Cache metrics (optional, for monitoring)
  try {
    const cacheStats = cacheService.getStats();
    health.cache = {
      size: cacheStats.size,
      hitRate: `${cacheStats.hitRate.toFixed(1)}%`,
      hits: cacheStats.metrics.hits,
      misses: cacheStats.metrics.misses,
    };
  } catch {
    health.cache = { status: "unavailable" };
  }

  const statusCode = health.status === "ok" ? 200 : 503;
  res.status(statusCode as number).json(health);
});

// ─── 10. RUTAS DE CACHE (estadísticas y limpieza) ──────────────────────────────
app.get("/cache/stats", authenticateToken, cacheStatsMiddleware);
app.post("/cache/clear", authenticateToken, cacheClearMiddleware);

// ─── 11. RUTAS DE LA APLICACIÓN ───────────────────────────────────────────────
app.use("/user", userRouter);
app.use("/taxpayer", taxpayerRouter);
app.use("/reports", reportRouter);
app.use("/census", censusRouter);
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// ─── 12. ERROR HANDLERS (SIEMPRE AL FINAL) ──────────────────────────────────
app.use(notFoundHandler);
app.use(globalErrorHandler);

export default app;
