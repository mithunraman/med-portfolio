import type { LogEntry, LogTransport, LogLevel } from './types';

/**
 * Format a log entry into a human-readable string.
 */
function formatLogEntry(entry: LogEntry): string {
  const timestamp = entry.timestamp.toISOString();
  const level = entry.level.toUpperCase().padEnd(5);
  const scope = entry.scope ? `[${entry.scope}] ` : '';
  const context = entry.context ? ` ${JSON.stringify(entry.context)}` : '';

  return `${timestamp} ${level} ${scope}${entry.message}${context}`;
}

/**
 * Get the appropriate console method for a log level.
 */
function getConsoleMethod(level: LogLevel): (...args: unknown[]) => void {
  switch (level) {
    case 'debug':
      return console.debug;
    case 'info':
      return console.info;
    case 'warn':
      return console.warn;
    case 'error':
      return console.error;
    default:
      return console.log;
  }
}

/**
 * Console transport for development.
 * Outputs formatted logs to the console with appropriate methods.
 */
export function createConsoleTransport(): LogTransport {
  return {
    name: 'console',
    log(entry: LogEntry): void {
      const method = getConsoleMethod(entry.level);
      const formatted = formatLogEntry(entry);
      method(formatted);
    },
  };
}

/**
 * Batch configuration for remote transport.
 */
interface BatchConfig {
  /** Maximum entries before flushing. */
  maxSize: number;
  /** Maximum time (ms) before flushing. */
  maxWait: number;
}

/**
 * Remote transport for production logging.
 * Batches logs and sends them to a remote endpoint.
 */
export function createRemoteTransport(
  endpoint: string,
  options: { batchConfig?: BatchConfig; headers?: Record<string, string> } = {}
): LogTransport {
  const { batchConfig = { maxSize: 10, maxWait: 5000 }, headers = {} } = options;
  let batch: LogEntry[] = [];
  let flushTimeout: ReturnType<typeof setTimeout> | null = null;

  const flush = async (): Promise<void> => {
    if (batch.length === 0) return;

    const toSend = [...batch];
    batch = [];

    if (flushTimeout) {
      clearTimeout(flushTimeout);
      flushTimeout = null;
    }

    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({ logs: toSend }),
      });
    } catch {
      // Silently fail - logging should never crash the app
      // In production, you might want to retry or store locally
    }
  };

  const scheduleFlush = (): void => {
    if (flushTimeout) return;
    flushTimeout = setTimeout(flush, batchConfig.maxWait);
  };

  return {
    name: 'remote',
    async log(entry: LogEntry): Promise<void> {
      batch.push(entry);

      if (batch.length >= batchConfig.maxSize) {
        await flush();
      } else {
        scheduleFlush();
      }
    },
  };
}

/**
 * No-op transport for testing or disabled logging.
 */
export function createNoopTransport(): LogTransport {
  return {
    name: 'noop',
    log(): void {
      // Intentionally empty
    },
  };
}
