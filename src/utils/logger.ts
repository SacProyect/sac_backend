import { createLogger, format, transports } from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

const BETTERSTACK_TOKEN = process.env.BETTERSTACK_SOURCE_TOKEN;
const BETTERSTACK_ENDPOINT = process.env.BETTERSTACK_LOGS_ENDPOINT; // opcional, ej: s1719396.eu-fsn-3.betterstackdata.com

const logtail = BETTERSTACK_TOKEN
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

const logger = createLogger({
  level: logLevel,
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.json()
  ),
  defaultMeta: { service: process.env.npm_package_name ?? 'sac_backend' },
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      ),
    }),
    // Todo lo que pase por el logger se envía también a BetterStack (mismo nivel mínimo)
    ...(logtail
      ? [
          new LogtailTransport(logtail, {
            level: logLevel,
            format: logtailFormat,
          }),
        ]
      : []),
  ],
});

if (process.env.NODE_ENV !== 'production') {
  logger.debug('Logging initialized.');
  if (logtail) {
    logger.info('BetterStack Logtail: envío de logs al servidor activado.');
  } else {
    logger.warn('BETTERSTACK_SOURCE_TOKEN no configurado. Los logs no se envían a BetterStack.');
  }
}

/** Envía los logs pendientes a BetterStack (llamar en shutdown para no perder logs). */
export async function flushLogger(): Promise<void> {
  if (logtail) await logtail.flush();
}

export default logger;
