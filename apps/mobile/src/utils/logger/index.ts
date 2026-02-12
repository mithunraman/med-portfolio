/**
 * Logging infrastructure for the mobile app.
 *
 * @example Basic usage
 * ```typescript
 * import { logger } from '@/utils/logger';
 *
 * logger.debug('Verbose info for debugging');
 * logger.info('User performed action', { action: 'login' });
 * logger.warn('Something unexpected', { retryCount: 2 });
 * logger.error('Operation failed', { error: err.message });
 * ```
 *
 * @example Scoped logger
 * ```typescript
 * const authLogger = logger.createScope('Auth');
 * authLogger.info('Login attempt'); // Output: [Auth] Login attempt
 * ```
 *
 * @example Performance timing
 * ```typescript
 * logger.time('fetchData');
 * await fetchData();
 * logger.timeEnd('fetchData'); // Output: fetchData completed { durationMs: 142 }
 * ```
 *
 * @example Custom configuration
 * ```typescript
 * import { configureLogger, createRemoteTransport } from '@/utils/logger';
 *
 * configureLogger({
 *   minLevel: 'info',
 *   transports: [
 *     createConsoleTransport(),
 *     createRemoteTransport('https://logs.example.com/ingest'),
 *   ],
 * });
 * ```
 */

// Core logger
export { logger, getLogger, configureLogger } from './logger';

// Transports
export {
  createConsoleTransport,
  createRemoteTransport,
  createNoopTransport,
} from './transports';

// Types
export type {
  Logger,
  LoggerConfig,
  LogLevel,
  LogContext,
  LogEntry,
  LogTransport,
} from './types';

export { LOG_LEVEL_VALUES } from './types';
