/**
 * Format milliseconds into a time string
 */

type TimeFormat = 'mm:ss' | 'hh:mm:ss' | 'compact' | 'human';

interface FormatTimeOptions {
  /** Output format (default: 'mm:ss') */
  format?: TimeFormat;
  /** Whether to show leading zeros (default: true for mm:ss, false for compact) */
  padMinutes?: boolean;
}

/**
 * Formats milliseconds into a human-readable time string
 *
 * @param ms - Time in milliseconds
 * @param options - Formatting options
 * @returns Formatted time string
 *
 * @example
 * formatTime(65000) // "1:05"
 * formatTime(65000, { format: 'mm:ss' }) // "1:05"
 * formatTime(65000, { format: 'mm:ss', padMinutes: true }) // "01:05"
 * formatTime(3665000, { format: 'hh:mm:ss' }) // "1:01:05"
 * formatTime(65000, { format: 'human' }) // "1 min 5 sec"
 * formatTime(65000, { format: 'compact' }) // "1:05"
 */
export function formatTime(ms: number, options: FormatTimeOptions = {}): string {
  const { format = 'mm:ss', padMinutes = false } = options;

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  switch (format) {
    case 'hh:mm:ss': {
      const paddedHours = hours.toString().padStart(2, '0');
      const paddedMinutes = minutes.toString().padStart(2, '0');
      const paddedSeconds = seconds.toString().padStart(2, '0');
      return `${paddedHours}:${paddedMinutes}:${paddedSeconds}`;
    }

    case 'human': {
      const parts: string[] = [];
      if (hours > 0) parts.push(`${hours} hr`);
      if (minutes > 0) parts.push(`${minutes} min`);
      if (seconds > 0 || parts.length === 0) parts.push(`${seconds} sec`);
      return parts.join(' ');
    }

    case 'compact':
    case 'mm:ss':
    default: {
      const displayMinutes = padMinutes ? minutes.toString().padStart(2, '0') : minutes.toString();
      const displaySeconds = seconds.toString().padStart(2, '0');

      if (format === 'mm:ss' && hours > 0) {
        // If hours exist in mm:ss format, include them
        return `${hours}:${minutes.toString().padStart(2, '0')}:${displaySeconds}`;
      }

      return `${displayMinutes}:${displaySeconds}`;
    }
  }
}

/**
 * Formats seconds into a time string (convenience wrapper)
 */
export function formatSeconds(seconds: number, options: FormatTimeOptions = {}): string {
  return formatTime(seconds * 1000, options);
}

export default formatTime;
