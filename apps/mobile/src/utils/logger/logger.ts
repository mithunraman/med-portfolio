import type {
  Logger,
  LoggerConfig,
  LogLevel,
  LogContext,
  LogEntry,
  TimerEntry,
} from './types';
import { LOG_LEVEL_VALUES } from './types';
import { createConsoleTransport } from './transports';

/**
 * Default patterns to redact from logs.
 * Matches common sensitive fields.
 */
const DEFAULT_REDACT_PATTERNS: RegExp[] = [
  /("?password"?\s*[:=]\s*)"[^"]*"/gi,
  /("?token"?\s*[:=]\s*)"[^"]*"/gi,
  /("?accessToken"?\s*[:=]\s*)"[^"]*"/gi,
  /("?refreshToken"?\s*[:=]\s*)"[^"]*"/gi,
  /("?secret"?\s*[:=]\s*)"[^"]*"/gi,
  /("?apiKey"?\s*[:=]\s*)"[^"]*"/gi,
  /(Bearer\s+)[^\s"]+/gi,
];

/**
 * Default configuration based on environment.
 */
function getDefaultConfig(): LoggerConfig {
  const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

  return {
    minLevel: isDev ? 'debug' : 'warn',
    transports: [createConsoleTransport()],
    redactPatterns: DEFAULT_REDACT_PATTERNS,
    enabled: true,
  };
}

/**
 * Redact sensitive data from a string.
 */
function redactSensitiveData(input: string, patterns: RegExp[]): string {
  let result = input;
  for (const pattern of patterns) {
    result = result.replace(pattern, '$1"[REDACTED]"');
  }
  return result;
}

/**
 * Sanitize context object by redacting sensitive values.
 */
function sanitizeContext(
  context: LogContext | undefined,
  patterns: RegExp[]
): LogContext | undefined {
  if (!context) return undefined;

  const sanitized: LogContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value === 'string') {
      sanitized[key] = redactSensitiveData(value, patterns);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = redactSensitiveData(JSON.stringify(value), patterns);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/**
 * Core logger implementation.
 */
class LoggerImpl implements Logger {
  private config: LoggerConfig;
  private scope?: string;
  private timers: Map<string, TimerEntry> = new Map();

  constructor(config: Partial<LoggerConfig> = {}, scope?: string) {
    this.config = { ...getDefaultConfig(), ...config };
    this.scope = scope;
  }

  /**
   * Check if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    return LOG_LEVEL_VALUES[level] >= LOG_LEVEL_VALUES[this.config.minLevel];
  }

  /**
   * Process and dispatch a log entry to all transports.
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      level,
      message,
      context: sanitizeContext(context, this.config.redactPatterns ?? []),
      scope: this.scope,
      timestamp: new Date(),
    };

    for (const transport of this.config.transports) {
      try {
        transport.log(entry);
      } catch {
        // Silently fail - logging should never crash the app
      }
    }
  }

  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  /**
   * Create a scoped logger that prefixes all messages.
   */
  createScope(scope: string): Logger {
    const newScope = this.scope ? `${this.scope}:${scope}` : scope;
    return new LoggerImpl(this.config, newScope);
  }

  /**
   * Start a performance timer.
   */
  time(label: string): void {
    this.timers.set(label, {
      label,
      startTime: performance.now(),
    });
  }

  /**
   * End a performance timer and log the duration.
   */
  timeEnd(label: string): void {
    const timer = this.timers.get(label);
    if (!timer) {
      this.warn(`Timer "${label}" does not exist`);
      return;
    }

    const duration = performance.now() - timer.startTime;
    this.timers.delete(label);
    this.debug(`${label} completed`, { durationMs: Math.round(duration) });
  }
}

/**
 * Singleton logger instance.
 */
let loggerInstance: LoggerImpl | null = null;

/**
 * Get or create the singleton logger instance.
 */
export function getLogger(): Logger {
  if (!loggerInstance) {
    loggerInstance = new LoggerImpl();
  }
  return loggerInstance;
}

/**
 * Configure the logger. Call this early in app initialization.
 */
export function configureLogger(config: Partial<LoggerConfig>): void {
  loggerInstance = new LoggerImpl(config);
}

/**
 * Default logger instance for convenience.
 */
export const logger = getLogger();
