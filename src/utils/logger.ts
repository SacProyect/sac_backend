import { createLogger, format, transports } from 'winston';
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

const logtail = new Logtail(process.env.BETTERSTACK_SOURCE_TOKEN ?? '');

const logger = createLogger({
  level: 'info', // Default log level
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }), // Log stack traces for errors
    format.json() // Structured JSON logging
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple() // Simple format for console output
      ),
    }),
    // Conditionally add Logtail transport if source token is provided
    ...(process.env.BETTERSTACK_SOURCE_TOKEN
      ? [new LogtailTransport(logtail)]
      : []),
  ],
});

// If not in production, log to console
if (process.env.NODE_ENV !== 'production') {
  logger.debug('Logging initialized with Console transport.');
  if (process.env.BETTERSTACK_SOURCE_TOKEN) {
    logger.debug('BetterStack Logtail transport enabled.');
  } else {
    logger.warn('BETTERSTACK_SOURCE_TOKEN is not set. BetterStack logging is disabled.');
  }
}

export default logger;
