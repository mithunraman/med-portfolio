/**
 * Log severity levels in order of priority.
 * Higher index = higher severity.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Numeric values for log level comparison.
 */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Structured context data attached to log entries.
 */
export type LogContext = Record<string, unknown>;

/**
 * A single log entry with all metadata.
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  context?: LogContext;
  scope?: string;
  timestamp: Date;
}

/**
 * Transport interface for pluggable log outputs.
 * Implement this to add custom log destinations.
 */
export interface LogTransport {
  name: string;
  log(entry: LogEntry): void | Promise<void>;
}

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /** Minimum log level to output. Logs below this level are ignored. */
  minLevel: LogLevel;
  /** List of transports to send logs to. */
  transports: LogTransport[];
  /** Patterns to redact from log output (e.g., tokens, passwords). */
  redactPatterns?: RegExp[];
  /** Whether logging is enabled. */
  enabled: boolean;
}

/**
 * Timer entry for performance measurements.
 */
export interface TimerEntry {
  label: string;
  startTime: number;
}

/**
 * Public logger interface.
 */
export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  createScope(scope: string): Logger;
  time(label: string): void;
  timeEnd(label: string): void;
}
