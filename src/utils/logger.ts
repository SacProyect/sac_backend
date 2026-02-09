import { createLogger, format, transports } from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

const BETTERSTACK_TOKEN = process.env.BETTERSTACK_SOURCE_TOKEN;
const BETTERSTACK_ENDPOINT = process.env.BETTERSTACK_LOGS_ENDPOINT;
const NODE_ENV = process.env.NODE_ENV ?? 'development';
const isDevelopment = NODE_ENV === 'development';
const isStaging = NODE_ENV === 'staging';
const isProduction = NODE_ENV === 'production';

// Staging y producción envían a BetterStack; desarrollo solo usa consola
const logtail =
  !isDevelopment && BETTERSTACK_TOKEN
    ? new Logtail(BETTERSTACK_TOKEN, {
        ...(BETTERSTACK_ENDPOINT && { endpoint: BETTERSTACK_ENDPOINT }),
        sendLogsToConsoleOutput: false,
        sendLogsToBetterStack: true,
        batchSize: 10,
        batchInterval: 1000,
      })
    : null;

// Formato estructurado para enviar a Logtail/BetterStack (JSON con metadata)
const logtailFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format((info) => {
    info.service = process.env.npm_package_name ?? 'sac_backend';
    info.env = process.env.NODE_ENV ?? 'development';
    if (info.stack) info.stack_trace = info.stack;
    return info;
  })(),
  format.json()
);

const logLevel = process.env.LOG_LEVEL ?? 'info';

const consoleTransport = new transports.Console({
  format: format.combine(
    format.colorize(),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
      return `${timestamp} [${level}]: ${message}${metaStr}`;
    })
  ),
});

// Desarrollo:  solo consola.
// Staging:     BetterStack + consola (para debug en Render).
// Producción:  solo BetterStack; consola como fallback si no hay token.
function buildTransports() {
  const list: any[] = [];

  if (isDevelopment) {
    list.push(consoleTransport);
    return list;
  }

  // Staging o producción: siempre BetterStack si hay token
  if (logtail) {
    list.push(new LogtailTransport(logtail, { level: logLevel, format: logtailFormat }));
  }

  // Staging: también consola para ver logs en el dashboard de Render
  // Producción: consola solo si no hay token (fallback)
  if (isStaging || !logtail) {
    list.push(consoleTransport);
  }

  return list;
}

const loggerTransports = buildTransports();

const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: process.env.npm_package_name ?? 'sac_backend' },
  transports: loggerTransports,
});

logger.debug(`Logging initialized [env=${NODE_ENV}]`, {
  transports: loggerTransports.map((t: any) => t.constructor?.name ?? 'unknown'),
  betterstack: !!logtail,
});

/** Envía los logs pendientes a BetterStack (llamar en shutdown para no perder logs). */
export async function flushLogger(): Promise<void> {
  if (logtail) await logtail.flush();
}

export default logger;
